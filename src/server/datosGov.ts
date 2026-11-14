/**
 * Cliente mínimo de la API SODA de datos.gov.co (Socrata). Sin auth; con `DATOS_GOV_APP_TOKEN` (opcional)
 * sube el límite de peticiones. Las respuestas son pequeñas porque se agregan en el servidor con `$group`.
 */
const BASE = 'https://www.datos.gov.co/resource';

export type SodaOptions = {
  /** Segundos en la caché de datos de Next; `false` = sin caché (trabajos programados). */
  revalidate?: number | false;
  timeoutMs?: number;
};

export async function soda<T>(dataset: string, params: Record<string, string>, opts: SodaOptions = {}): Promise<T[]> {
  const { revalidate = 86_400, timeoutMs = 15_000 } = opts;
  const u = new URL(`${BASE}/${dataset}.json`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.DATOS_GOV_APP_TOKEN;
  if (token) headers['X-App-Token'] = token;
  const res = await fetch(u, {
    ...(revalidate === false ? { cache: 'no-store' as const } : { next: { revalidate } }),
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  });
  if (!res.ok) throw new Error(`datos.gov.co ${dataset} ${res.status}`);
  return (await res.json()) as T[];
}

/** Número de SODA (texto, a veces con coma decimal). NaN si no es número. */
export function sodaNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  return Number(String(v).replace(/\s/g, '').replace(',', '.'));
}
