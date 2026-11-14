/**
 * Caché en memoria de teselas NASA GIBS (bytes comprimidos, LRU por tamaño).
 *
 * GIBS responde `Cache-Control: no-store`: el navegador no guarda nada y MapLibre suelta las teselas de una fuente
 * cuando cambia la fecha o se quita la capa. Sin esta caché, volver a una capa o fecha ya vista, repetir la
 * animación de 12 meses o tocar el mapa para leer un valor descarga todo otra vez.
 *
 * - Las fuentes usan `gibs://…` (ver `cachedTileUrl`); MapLibre llama a `loadGibsTile` en el hilo principal.
 * - Peticiones repetidas en vuelo se unen en una sola (la capa principal y los fotogramas piden lo mismo).
 * - Se cancela la descarga solo cuando ya nadie la espera.
 * - Vive solo durante la sesión: no toca disco ni el service worker.
 */

export const GIBS_PROTOCOL = 'gibs';
const PREFIX = `${GIBS_PROTOCOL}://`;

/** ~16 MB alcanzan para ~600 teselas de 256 px (PNG/JPEG de 10–40 KB). La mitad en gama baja. */
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

type Inflight = { promise: Promise<ArrayBuffer>; controller: AbortController; waiters: number };

const store = new Map<string, ArrayBuffer>();
const inflight = new Map<string, Inflight>();
let bytes = 0;
let maxBytes = DEFAULT_MAX_BYTES;
const stats = { hits: 0, misses: 0, joined: 0 };

/** `https://gibs…/{z}/{y}/{x}.png` → `gibs://gibs…/{z}/{y}/{x}.png` (solo para URLs https). */
export function cachedTileUrl(url: string) {
  return url.startsWith('https://') ? PREFIX + url.slice('https://'.length) : url;
}

const toHttps = (url: string) => (url.startsWith(PREFIX) ? `https://${url.slice(PREFIX.length)}` : url);

export function configureTileCache(opts: { maxBytes: number }) {
  maxBytes = opts.maxBytes;
  evict();
}

function evict() {
  // Map conserva el orden de inserción: la primera clave es la menos usada.
  for (const [key, buf] of store) {
    if (bytes <= maxBytes) break;
    store.delete(key);
    bytes -= buf.byteLength;
  }
}

function remember(url: string, buf: ArrayBuffer) {
  // Una respuesta anómala muy grande no debe vaciar la caché.
  if (buf.byteLength > maxBytes / 2) return;
  const old = store.get(url);
  if (old) bytes -= old.byteLength;
  store.set(url, buf);
  bytes += buf.byteLength;
  evict();
}

/** GIBS respondió, pero sin imagen (fuera de su rango de fechas o sin tesela): es "sin datos", no un fallo de red. */
export class GibsNoTileError extends Error {
  constructor(public status: number) {
    super(`GIBS ${status}`);
    this.name = 'GibsNoTileError';
  }
}

function abortError() {
  return new DOMException('Cancelado', 'AbortError');
}

/**
 * Bytes de una tesela GIBS (acepta `https://` o `gibs://`). Lanza si la respuesta no es una imagen
 * (GIBS devuelve 400/404 con XML fuera de su rango de fechas).
 */
export function fetchGibsTile(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const key = toHttps(url);
  const hit = store.get(key);
  if (hit) {
    // Mover al final = recién usada.
    store.delete(key);
    store.set(key, hit);
    stats.hits++;
    return Promise.resolve(hit);
  }
  if (signal?.aborted) return Promise.reject(abortError());

  let entry = inflight.get(key);
  if (entry) stats.joined++;
  else {
    stats.misses++;
    const controller = new AbortController();
    const promise = fetch(key, { mode: 'cors', credentials: 'omit', signal: controller.signal })
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.startsWith('image/')) throw new GibsNoTileError(res.status);
        const buf = await res.arrayBuffer();
        remember(key, buf);
        return buf;
      })
      .finally(() => {
        if (inflight.get(key)?.promise === promise) inflight.delete(key);
      });
    // Si todos los que esperaban se fueron, nadie lee el rechazo.
    promise.catch(() => undefined);
    entry = { promise, controller, waiters: 0 };
    inflight.set(key, entry);
  }

  const shared = entry;
  shared.waiters++;
  if (!signal) return shared.promise;

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const onAbort = () => {
      shared.waiters--;
      if (shared.waiters <= 0 && inflight.get(key) === shared) {
        inflight.delete(key);
        shared.controller.abort();
      }
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    shared.promise.then(
      (buf) => {
        signal.removeEventListener('abort', onAbort);
        resolve(buf);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/** Función para `addProtocol(GIBS_PROTOCOL, loadGibsTile)` de MapLibre. */
export async function loadGibsTile(params: { url: string }, abortController: AbortController) {
  const data = await fetchGibsTile(params.url, abortController.signal);
  return { data };
}

/** Para `?debug=1`. */
export function tileCacheStats() {
  return { ...stats, tiles: store.size, bytes, maxBytes, inflight: inflight.size };
}

/** Solo para pruebas. */
export function resetTileCache() {
  store.clear();
  inflight.clear();
  bytes = 0;
  maxBytes = DEFAULT_MAX_BYTES;
  stats.hits = stats.misses = stats.joined = 0;
}
