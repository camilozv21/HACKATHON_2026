/**
 * Periodo de eventos que se muestra: el de la máquina del tiempo (un mes) o, si se mira el presente,
 * los últimos RECENT_DAYS días. Módulo puro: lo usan el cliente, la API y el agente.
 */
import { periodOf, type TimeSel } from '@/features/time/period';

export const RECENT_DAYS = 90;
const DAY = 86_400_000;

export const isoDay = (t: number | Date) => new Date(t).toISOString().slice(0, 10);

export type EventWindow = { from: string; to: string; recent: boolean };

export function eventWindow(sel: TimeSel | null, now = new Date()): EventWindow {
  if (sel) {
    const p = periodOf(sel, now);
    return { from: p.start, to: p.end, recent: false };
  }
  return { from: isoDay(now.getTime() - (RECENT_DAYS - 1) * DAY), to: isoDay(now), recent: true };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida from/to de la URL: fechas reales, en orden, sin futuro y de hasta ~4 meses. */
export function parseWindow(from: string | null, to: string | null, now = new Date()): EventWindow | null {
  if (!from && !to) return eventWindow(null, now);
  if (!from || !to || !DAY_RE.test(from) || !DAY_RE.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || isoDay(a) !== from || isoDay(b) !== to) return null;
  const today = isoDay(now);
  const end = to > today ? today : to;
  if (from > end || (Date.parse(`${end}T00:00:00Z`) - a) / DAY > 124) return null;
  return { from, to: end, recent: false };
}
