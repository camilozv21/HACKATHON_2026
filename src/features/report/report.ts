/**
 * Informe agroclimático de una zona y un periodo: lo calcula el teléfono con datos diarios de NASA POWER y la
 * climatología del mismo punto (lo "normal"). Módulo puro: lo usan la página del informe, el CSV y las pruebas.
 */
import { summarizePeriod, type FieldEvent, type PeriodSummary } from '@/features/time/events';
import { daysInMonth, latestAvailable, parseTimeParam, periodOf, type TimeSel } from '@/features/time/period';
import type { ClimateProfile } from '@/lib/api/contract';
import type { PowerDay } from '@/lib/api/power';

const DAY = 86_400_000;
export const RECENT_REPORT_DAYS = 30;

export type ReportPeriod = { start: string; end: string; days: number; sel: TimeSel | null; partial: boolean };

/** `t` = "YYYY-MM" (un mes) o "YYYY-MM-DD" (el mes de ese día); sin `t`, los últimos 30 días con datos. */
export function reportPeriod(t: string | null | undefined, now = new Date()): ReportPeriod {
  const sel = parseTimeParam(t, now);
  if (sel) {
    const p = periodOf(sel, now);
    return { start: p.start, end: p.end, days: p.days, sel: { kind: 'month', ym: p.start.slice(0, 7) }, partial: p.partial };
  }
  const end = latestAvailable(now);
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - (RECENT_REPORT_DAYS - 1) * DAY).toISOString().slice(0, 10);
  return { start, end, days: RECENT_REPORT_DAYS, sel: null, partial: false };
}

export type ReportQuery = { lat: number; lon: number; name?: string | null; when?: string | null };

/** Enlace a la página del informe (se puede compartir o pedir al agente). */
export function reportHref(locale: string, q: ReportQuery): string {
  const p = new URLSearchParams({ lat: q.lat.toFixed(4), lon: q.lon.toFixed(4) });
  if (q.name) p.set('name', q.name.slice(0, 120));
  if (q.when) p.set('t', q.when);
  return `/${locale}/report?${p}`;
}

export function parseReportQuery(params: URLSearchParams): ReportQuery | null {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!params.get('lat') || !params.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, name: params.get('name')?.slice(0, 120) || null, when: params.get('t') };
}

/**
 * Lo normal de cada día según la climatología mensual del punto: lluvia del mes repartida en sus días, temperatura
 * media (T2M) y humedad de raíces. Ojo: en NASA POWER mensual, T2M_MAX y T2M_MIN son los extremos del mes, no el
 * promedio de las máximas y mínimas diarias; por eso solo la temperatura media se compara con lo normal.
 */
export function normalsFor(date: string, climate: ClimateProfile | null) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const month = climate?.months[m - 1];
  const precip = month?.precip.value;
  return {
    precipPerDay: precip != null ? precip / daysInMonth(y, m) : null,
    tmean: month?.tMean.value ?? null,
    soil: month?.soilMoisture.value ?? null,
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type WatchKey = 'dry' | 'wet' | 'frost' | 'heat' | 'calm';

export type AgroReport = {
  summary: PeriodSummary;
  tmaxAvg: number | null;
  tminAvg: number | null;
  tmeanAvg: number | null;
  tmeanNormal: number | null;
  soilAvg: number | null;
  soilNormal: number | null;
  /** Qué vigilar, en orden de importancia. */
  watch: WatchKey[];
  daysWithData: number;
};

export function buildReport(days: PowerDay[], climate: ClimateProfile | null, periodDays = days.length): AgroReport {
  const normals = days.map((d) => normalsFor(d.date, climate));
  const perDay = normals.map((n) => n.precipPerDay).filter((v): v is number => v != null);
  const normalPerDay = perDay.length === days.length && days.length ? perDay.reduce((a, b) => a + b, 0) / perDay.length : null;
  const summary = summarizePeriod(days, normalPerDay, periodDays);

  const pick = (k: 'tmax' | 'tmin' | 'tmean' | 'soil') => mean(days.map((d) => d[k]).filter((v): v is number => v != null));
  const norm = (k: 'tmean' | 'soil') => mean(normals.map((n) => n[k]).filter((v): v is number => v != null));
  const round = (v: number | null) => (v == null ? null : r1(v));

  const has = (k: FieldEvent['kind']) => summary.events.some((e) => e.kind === k);
  const watch: WatchKey[] = [];
  if (has('drySpell') || (summary.pct != null && summary.pct <= -30)) watch.push('dry');
  if (has('heavyRain') || (summary.pct != null && summary.pct >= 30)) watch.push('wet');
  if (has('frost')) watch.push('frost');
  if (has('heat')) watch.push('heat');
  if (!watch.length) watch.push('calm');

  return {
    summary,
    tmaxAvg: round(pick('tmax')),
    tminAvg: round(pick('tmin')),
    tmeanAvg: round(pick('tmean')),
    tmeanNormal: round(norm('tmean')),
    soilAvg: round(pick('soil')),
    soilNormal: round(norm('soil')),
    watch,
    daysWithData: days.filter((d) => d.precip != null).length,
  };
}

/**
 * CSV de los datos diarios (métrico). En español usa ";" y coma decimal (como espera Excel en Colombia);
 * en inglés "," y punto. Con BOM para que Excel lea bien las tildes.
 */
export function reportCsv(
  days: PowerDay[],
  climate: ClimateProfile | null,
  meta: { place: string; lat: number; lon: number; start: string; end: string; generated: string },
  locale: string,
): string {
  const es = locale === 'es';
  const sep = es ? ';' : ',';
  const num = (v: number | null, d = 1) => (v == null ? '' : es ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
  const esc = (s: string) => (s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = es
    ? ['fecha', 'lluvia_mm', 'lluvia_normal_mm', 'temp_media_c', 'temp_media_normal_c', 'temp_max_c', 'temp_min_c', 'humedad_suelo_raices_pct']
    : ['date', 'rain_mm', 'normal_rain_mm', 'mean_temp_c', 'normal_mean_temp_c', 'max_temp_c', 'min_temp_c', 'root_zone_soil_moisture_pct'];
  const lines = [
    `# ${es ? 'Informe agroclimático · Field Shift' : 'Agroclimatic report · Field Shift'}`,
    `# ${es ? 'Zona' : 'Area'}: ${meta.place} (${meta.lat.toFixed(4)}, ${meta.lon.toFixed(4)})`,
    `# ${es ? 'Periodo' : 'Period'}: ${meta.start} – ${meta.end}`,
    `# ${es ? 'Fuente: NASA POWER (diario, ~50 km); lo normal es el promedio mensual del mismo punto' : 'Source: NASA POWER (daily, ~50 km); normal is the monthly average for the same point'}`,
    `# ${es ? 'Generado' : 'Generated'}: ${meta.generated}`,
    head.join(sep),
    ...days.map((d) => {
      const n = normalsFor(d.date, climate);
      return [d.date, num(d.precip), num(n.precipPerDay), num(d.tmean ?? null), num(n.tmean), num(d.tmax), num(d.tmin), num(d.soil, 0)]
        .map((c) => esc(String(c)))
        .join(sep);
    }),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
