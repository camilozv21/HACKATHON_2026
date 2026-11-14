/**
 * Fechas válidas de una capa GIBS a partir de sus rangos ISO 8601 ("inicio/fin/periodo").
 * El timeline muestra meses; para capas diarias cada mes usa un día representativo (el 15 o el válido más cercano).
 */
import type { LayerConfig } from './layers.config';

type Range = { start: number; end: number; stepDays: number | null; stepMonths: number | null };

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
export const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);

function parsePeriod(p: string): { days: number | null; months: number | null } {
  const mm = p.match(/^P(\d+)M$/);
  if (mm) return { days: null, months: Number(mm[1]) };
  const yy = p.match(/^P(\d+)Y$/);
  if (yy) return { days: null, months: Number(yy[1]) * 12 };
  const dd = p.match(/^P(\d+)D$/);
  if (dd) return { days: Number(dd[1]), months: null };
  return { days: 1, months: null };
}

export function parseRanges(ranges: string[]): Range[] {
  return ranges
    .map((r) => {
      const [s, e, p = 'P1D'] = r.split('/');
      if (!s || !e) return null;
      const { days, months } = parsePeriod(p);
      return { start: toTime(s), end: toTime(e), stepDays: days, stepMonths: months };
    })
    .filter((r): r is Range => r !== null && r.end >= r.start);
}

function monthsBetween(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + db.getUTCMonth() - da.getUTCMonth();
}

/** ¿La fecha cae exactamente en una fecha válida de alguno de los rangos? */
export function isValidDate(layer: LayerConfig, date: string): boolean {
  if (!layer.gibs) return true;
  const t = toTime(date);
  return parseRanges(layer.gibs.ranges).some((r) => {
    if (t < r.start || t > r.end) return false;
    if (r.stepMonths) {
      const d = new Date(t);
      const s = new Date(r.start);
      return d.getUTCDate() === s.getUTCDate() && monthsBetween(r.start, t) % r.stepMonths === 0;
    }
    return Math.round((t - r.start) / DAY) % (r.stepDays ?? 1) === 0;
  });
}

/** Fecha válida más cercana a `date` (por defecto, la última disponible). */
export function snapDate(layer: LayerConfig, date?: string | null): string | null {
  if (!layer.gibs) return null;
  const ranges = parseRanges(layer.gibs.ranges);
  if (!ranges.length) return layer.gibs.defaultTime;
  const target = date ? toTime(date) : (layer.gibs.defaultTime ? toTime(layer.gibs.defaultTime) : ranges.at(-1)!.end);
  let best: number | null = null;
  for (const r of ranges) {
    let candidate: number;
    if (target <= r.start) candidate = r.start;
    else if (target >= r.end) candidate = r.end;
    else if (r.stepMonths) {
      // Paso anterior y siguiente al objetivo; gana el más cercano en días.
      const stepsDown = Math.floor(monthsBetween(r.start, target) / r.stepMonths) * r.stepMonths;
      const at = (steps: number) => {
        const d = new Date(r.start);
        d.setUTCMonth(d.getUTCMonth() + steps);
        return Math.min(d.getTime(), r.end);
      };
      const down = at(stepsDown) > target ? at(stepsDown - r.stepMonths) : at(stepsDown);
      const up = at(stepsDown + r.stepMonths);
      candidate = Math.abs(down - target) <= Math.abs(up - target) ? down : up;
    } else {
      const step = (r.stepDays ?? 1) * DAY;
      candidate = r.start + Math.round((target - r.start) / step) * step;
    }
    if (best === null || Math.abs(candidate - target) < Math.abs(best - target)) best = candidate;
  }
  return best === null ? null : toIso(best);
}

export type MonthOption = { key: string; date: string | null };

/**
 * Últimos `count` meses hasta la fecha más reciente de la capa. Cada mes trae su fecha válida representativa
 * (o null si ese mes no tiene datos, para mostrarlo deshabilitado).
 */
export function monthOptions(layer: LayerConfig, count = 12): MonthOption[] {
  if (!layer.gibs) return [];
  const latest = snapDate(layer);
  if (!latest) return [];
  const end = new Date(toTime(latest));
  const out: MonthOption[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    const key = toIso(d.getTime()).slice(0, 7);
    let date: string | null;
    if (layer.cadence === 'monthly') {
      date = isValidDate(layer, `${key}-01`) ? `${key}-01` : null;
    } else {
      const mid = `${key}-15`;
      const isLatestMonth = key === latest.slice(0, 7);
      const snapped = isLatestMonth ? latest : snapDate(layer, mid);
      date = snapped && snapped.slice(0, 7) === key ? snapped : null;
    }
    out.push({ key, date });
  }
  return out;
}

export function latestDate(layer: LayerConfig): string | null {
  return snapDate(layer);
}

/**
 * ¿La capa tiene datos cerca de esa fecha? (snapDate siempre devuelve algo: la fecha más cercana, aunque esté a
 * años de distancia). Se tolera un paso de la capa después del último dato (p. ej. un mes en capas mensuales).
 */
export function coversDate(layer: LayerConfig, date: string): boolean {
  if (!layer.gibs) return true;
  const ranges = parseRanges(layer.gibs.ranges);
  if (!ranges.length) return true;
  const t = toTime(date);
  const first = Math.min(...ranges.map((r) => r.start));
  const last = Math.max(...ranges.map((r) => r.end));
  const tolerance = layer.cadence === 'monthly' ? 31 * DAY : 3 * DAY;
  return t >= first - tolerance && t <= last + tolerance;
}

/** Fecha de la capa para una fecha/mes elegido en la máquina del tiempo (capas mensuales: el día 1 del mes). */
export function layerDateFor(layer: LayerConfig, date: string): string | null {
  if (!coversDate(layer, date)) return null;
  return snapDate(layer, layer.cadence === 'monthly' ? `${date.slice(0, 7)}-01` : date);
}
