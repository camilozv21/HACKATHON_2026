/**
 * PWA: registro del service worker (solo producción) y el aviso de instalación.
 * El SW (public/sw.js) guarda el "shell" de la app y los archivos estáticos; nunca los tiles del mapa.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function initPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Lo que se cargó antes de que el SW tomara el control no pasó por él: se lo pasamos para guardarlo.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin + '/_next/static/'));
        reg.active?.postMessage({ type: 'cache-urls', urls: [...urls, location.pathname] });
      })
      .catch(() => {
        /* sin SW la app funciona igual, solo no queda disponible sin conexión */
      });
  }
}

export const canInstall = () => deferred !== null;
export function subscribeInstall(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  deferred = null;
  emit();
}
