/**
 * "Máquina del tiempo": la fecha que la persona quiere revisar (un mes completo o un día) y el periodo de datos
 * que le corresponde. Módulo puro: lo usan el cliente, la API de región y el agente.
 *
 * Datos diarios de NASA POWER desde 1981 y con ~2–3 días de retraso: no se puede elegir el futuro ni los
 * últimos LATENCY_DAYS días. Un mes en curso se corta en el último día disponible (periodo parcial).
 */
export type TimeSel = { kind: 'month'; ym: string } | { kind: 'day'; date: string };

export type Period = {
  /** YYYY-MM-DD */
  start: string;
  end: string;
  year: number;
  /** 1–12 */
  month: number;
  /** Día elegido (si la persona eligió un día), dentro del mes. */
  focus: string | null;
  days: number;
  /** El mes todavía no termina (o los datos aún no llegan hasta su último día). */
  partial: boolean;
};

export const DATA_START = '1981-01-01';
export const LATENCY_DAYS = 3;
const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Último día con datos (hoy − LATENCY_DAYS). */
export function latestAvailable(now = new Date()): string {
  return new Date(now.getTime() - LATENCY_DAYS * DAY).toISOString().slice(0, 10);
}

function validDay(d: string) {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

/** "2026-05" → mes; "2026-05-14" → día. null si no es válido o está fuera del rango con datos. */
export function parseTimeParam(v: string | null | undefined, now = new Date()): TimeSel | null {
  if (!v) return null;
  const latest = latestAvailable(now);
  if (/^\d{4}-\d{2}$/.test(v)) {
    const m = Number(v.slice(5, 7));
    if (m < 1 || m > 12) return null;
    if (`${v}-01` < DATA_START || `${v}-01` > latest) return null;
    return { kind: 'month', ym: v };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    if (!validDay(v) || v < DATA_START || v > latest) return null;
    return { kind: 'day', date: v };
  }
  return null;
}

export const toTimeParam = (s: TimeSel) => (s.kind === 'month' ? s.ym : s.date);
export const selMonth = (s: TimeSel) => (s.kind === 'month' ? s.ym : s.date.slice(0, 7));

/** Periodo de datos: siempre el mes de la fecha elegida (un día se ve dentro de su mes). */
export function periodOf(sel: TimeSel, now = new Date()): Period {
  const ym = selMonth(sel);
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const start = `${ym}-01`;
  const latest = latestAvailable(now);
  const fullEnd = `${ym}-${pad(daysInMonth(year, month))}`;
  const partial = fullEnd > latest;
  const end = partial ? latest : fullEnd;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1;
  return { start, end, year, month, focus: sel.kind === 'day' ? sel.date : null, days, partial };
}

/** Fecha para las capas del mapa: el día elegido o el 15 del mes (el último disponible si el mes está en curso). */
export function representativeDate(sel: TimeSel, now = new Date()): string {
  if (sel.kind === 'day') return sel.date;
  const p = periodOf(sel, now);
  const mid = `${sel.ym}-15`;
  return mid > p.end ? p.end : mid;
}

/** "mayo de 2026" / "May 2026"; un día: "14 de mayo de 2026" / "May 14, 2026". */
export function periodLabel(sel: TimeSel, locale: string): string {
  const date = sel.kind === 'month' ? `${sel.ym}-15` : sel.date;
  const opts: Intl.DateTimeFormatOptions =
    sel.kind === 'month' ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, opts).format(new Date(`${date}T12:00:00Z`));
}

/** Suma meses a "YYYY-MM". */
export function shiftMonth(ym: string, delta: number): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Atajos del selector: este mes (en curso), el mes pasado y el mismo mes del año pasado. */
export function presets(now = new Date()) {
  const thisMonth = latestAvailable(now).slice(0, 7);
  return { thisMonth, lastMonth: shiftMonth(thisMonth, -1), sameMonthLastYear: shiftMonth(thisMonth, -12) };
}
