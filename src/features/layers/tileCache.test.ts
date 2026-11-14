import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedTileUrl, configureTileCache, fetchGibsTile, resetTileCache, tileCacheStats } from './tileCache';

const URL_A = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/X/default/2026-10-01/GoogleMapsCompatible_Level7/2/1/1.png';
const URL_B = URL_A.replace('/1/1.png', '/1/2.png');
const URL_C = URL_A.replace('/1/1.png', '/1/3.png');

const png = (size: number) =>
  new Response(new Uint8Array(size), { status: 200, headers: { 'content-type': 'image/png' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetTileCache();
  fetchMock = vi.fn(async () => png(1000));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('caché de teselas GIBS', () => {
  it('convierte https:// en gibs:// y deja otras URLs igual', () => {
    expect(cachedTileUrl(URL_A).startsWith('gibs://gibs.earthdata.nasa.gov/')).toBe(true);
    expect(cachedTileUrl('data:image/png;base64,xx')).toBe('data:image/png;base64,xx');
  });

  it('la segunda vez sale de memoria, con https:// o con gibs://', async () => {
    const a = await fetchGibsTile(URL_A);
    const b = await fetchGibsTile(cachedTileUrl(URL_A));
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(URL_A);
    expect(tileCacheStats()).toMatchObject({ hits: 1, misses: 1, tiles: 1, bytes: 1000 });
  });

  it('une peticiones iguales en vuelo en una sola descarga', async () => {
    const [a, b] = await Promise.all([fetchGibsTile(URL_A), fetchGibsTile(URL_A)]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tileCacheStats().joined).toBe(1);
  });

  it('suelta las menos usadas al pasar el límite de bytes', async () => {
    configureTileCache({ maxBytes: 2500 });
    await fetchGibsTile(URL_A);
    await fetchGibsTile(URL_B);
    await fetchGibsTile(URL_A); // A pasa a ser la más reciente
    await fetchGibsTile(URL_C); // sale B
    expect(tileCacheStats()).toMatchObject({ tiles: 2, bytes: 2000 });
    await fetchGibsTile(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await fetchGibsTile(URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('no guarda respuestas que no son imagen (GIBS fuera de rango devuelve XML)', async () => {
    fetchMock.mockImplementation(async () => new Response('<xml/>', { status: 400, headers: { 'content-type': 'text/xml' } }));
    await expect(fetchGibsTile(URL_A)).rejects.toThrow('GIBS 400');
    expect(tileCacheStats().tiles).toBe(0);
  });

  it('cancela la descarga solo cuando ya nadie la espera', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          signal = init.signal!;
          signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
        }),
    );
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = fetchGibsTile(URL_A, c1.signal);
    const p2 = fetchGibsTile(URL_A, c2.signal);
    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal!.aborted).toBe(false);
    c2.abort();
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal!.aborted).toBe(true);
    expect(tileCacheStats().inflight).toBe(0);
  });
});
