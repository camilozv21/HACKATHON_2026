/**
 * Caché en memoria con vencimiento, para respuestas ya compactadas de servicios externos
 * (la caché de datos de Next no guarda respuestas de más de 2 MB, como las de EONET con polígonos).
 * Una petición en curso se comparte: diez visitas a la vez hacen una sola llamada.
 */
type Entry = { at: number; value: Promise<unknown> };
const g = globalThis as typeof globalThis & { __fieldShiftMemo?: Map<string, Entry> };

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const cache = (g.__fieldShiftMemo ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  cache.set(key, { at: Date.now(), value });
  // Un error no se queda en la caché.
  value.catch(() => cache.get(key)?.value === value && cache.delete(key));
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}
