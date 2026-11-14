/**
 * Lluvia y temperatura reales de NASA POWER (diario + climatología mensual), para el resumen de región y para el
 * agente. Solo servidor.
 *  - powerRecent: los últimos 45 días (cache 6 h por celda de 0.1°).
 *  - powerPeriod: un periodo pasado de la máquina del tiempo (cache 24 h: el pasado ya no cambia).
 */
import type { PowerRecent } from '@/mocks/region';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const cache = new Map<string, { at: number; ttl: number; data: PowerRecent | null }>();
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

async function fetchPower(lat: number, lon: number, start: Date, end: Date, ttl: number): Promise<PowerRecent | null> {
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}:${ymd(start)}-${ymd(end)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;

  const base = 'https://power.larc.nasa.gov/api/temporal';
  const common = `community=AG&latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}&format=JSON`;
  try {
    const [daily, clim] = await Promise.all([
      fetch(`${base}/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN&start=${ymd(start)}&end=${ymd(end)}&${common}`, {
        signal: AbortSignal.timeout(7000),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${base}/climatology/point?parameters=PRECTOTCORR,T2M_MAX&${common}`, {
        signal: AbortSignal.timeout(7000),
      }).then((r) => (r.ok ? r.json() : null)),
    ]);
    const p = daily?.properties?.parameter;
    const c = clim?.properties?.parameter;
    if (!p || !c) throw new Error('POWER sin datos');
    const val = (v: unknown) => (typeof v === 'number' && v > -900 ? v : null);
    const data: PowerRecent = {
      days: Object.keys(p.PRECTOTCORR ?? {}).map((k) => ({
        date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`,
        precip: val(p.PRECTOTCORR[k]),
        tmax: val(p.T2M_MAX?.[k]),
        tmin: val(p.T2M_MIN?.[k]),
      })),
      climPrecipMmDay: MONTHS.map((m) => Number(c.PRECTOTCORR?.[m] ?? 0)),
      climTmax: MONTHS.map((m) => Number(c.T2M_MAX?.[m] ?? 0)),
    };
    cache.set(key, { at: Date.now(), ttl, data });
    return data;
  } catch {
    // Reintentar en ~30 min si POWER no respondió.
    cache.set(key, { at: Date.now(), ttl: 30 * 60_000, data: null });
    return null;
  }
}

export function powerRecent(lat: number, lon: number): Promise<PowerRecent | null> {
  const end = new Date(Date.now() - 2 * 86_400_000);
  const start = new Date(end.getTime() - 44 * 86_400_000);
  return fetchPower(lat, lon, start, end, 6 * 3_600_000);
}

/** Datos diarios de un periodo (YYYY-MM-DD, inclusivo). */
export function powerPeriod(lat: number, lon: number, start: string, end: string): Promise<PowerRecent | null> {
  return fetchPower(lat, lon, new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`), 24 * 3_600_000);
}
