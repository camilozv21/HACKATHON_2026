/** Ejecuta `cb` cuando el navegador está ocioso (o tras `timeout` ms como máximo). Devuelve cancelador. */
export function whenIdle(cb: () => void, timeout = 1000): () => void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(cb, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, Math.min(timeout, 200));
  return () => clearTimeout(id);
}
