/**
 * Clima de NASA POWER para el motor de recomendaciones (solo servidor, lo usa /api/mock/analysis).
 *  - Serie mensual 2001–último año (misma transformación que ve el teléfono: src/lib/api/power.ts).
 *  - T2M_RANGE de la climatología: rango diario medio por mes. En la serie mensual T2M_MAX/T2M_MIN son los
 *    extremos del mes, y con ellos la ET0 de Hargreaves sale ~40 % más alta.
 * Caché de 24 h por celda de 0.1°; si POWER no responde, null por 30 min y el análisis usa la plantilla.
 */
import type { ClimateProfile } from '@/lib/api/contract';
import { fetchPowerClimate } from '@/lib/api/power';

export type PowerForAnalysis = { climate: ClimateProfile; dailyRangeC: (number | null)[] | null };

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const OK_TTL = 24 * 3_600_000;
const FAIL_TTL = 30 * 60_000;
const cache = new Map<string, { at: number; ttl: number; data: PowerForAnalysis | null }>();

async function dailyRange(lat: number, lon: number, signal: AbortSignal): Promise<(number | null)[] | null> {
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M_RANGE&community=AG&latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}&format=JSON`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { properties?: { parameter?: { T2M_RANGE?: Record<string, number> } } };
    const p = json.properties?.parameter?.T2M_RANGE;
    if (!p) return null;
    return MONTHS.map((m) => (typeof p[m] === 'number' && p[m]! > -900 ? p[m]! : null));
  } catch {
    return null;
  }
}

export async function powerForAnalysis(lat: number, lon: number): Promise<PowerForAnalysis | null> {
  if (process.env.ANALYSIS_USE_POWER === 'false') return null;
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;

  const signal = AbortSignal.timeout(9000);
  try {
    const [climate, range] = await Promise.all([fetchPowerClimate(lat, lon, signal), dailyRange(lat, lon, signal)]);
    const data = { climate, dailyRangeC: range };
    cache.set(key, { at: Date.now(), ttl: OK_TTL, data });
    return data;
  } catch {
    cache.set(key, { at: Date.now(), ttl: FAIL_TTL, data: null });
    return null;
  }
}
