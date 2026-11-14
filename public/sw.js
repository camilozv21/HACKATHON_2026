/* Field Shift — service worker mínimo.
 * - Navegaciones: red primero; sin conexión, la última copia guardada de la página (el "shell").
 * - /_next/static: caché primero (archivos con hash, no cambian).
 * - Nunca guarda tiles del mapa ni datos de terceros, ni /api (el último análisis vive en localStorage).
 */
const VERSION = 'fs-v1';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ['/es', '/en', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La página nos pasa lo que ya cargó antes de que el SW tomara el control.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'cache-urls' || !Array.isArray(data.urls)) return;
  const same = data.urls.filter((u) => typeof u === 'string' && (u.startsWith('/') || u.startsWith(self.location.origin)));
  const statics = same.filter((u) => u.includes('/_next/static/'));
  const pages = same.filter((u) => !u.includes('/_next/static/'));
  event.waitUntil(
    Promise.all([
      caches.open(STATIC).then((c) => c.addAll(statics)).catch(() => {}),
      caches.open(SHELL).then((c) => c.addAll(pages)).catch(() => {}),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles, NASA, geocoding: siempre de la red
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/audio/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL);
          const locale = url.pathname.startsWith('/en') ? '/en' : '/es';
          return (await cache.match(url.pathname)) || (await cache.match(locale)) || Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
