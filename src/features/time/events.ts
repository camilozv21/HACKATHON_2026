/**
 * Reconstrucción de lo que pasó en un periodo a partir de datos diarios (NASA POWER): totales contra lo normal y
 * eventos simples que un agricultor reconoce. Reglas (también se muestran en la UI):
 *
 *   Lluvia fuerte  : un día con ≥ 20 mm, o ≥ 3 veces la lluvia diaria normal del mes y ≥ 10 mm.
 *                    Días fuertes seguidos cuentan como un solo evento (valor = suma).
 *   Racha seca     : ≥ 7 días seguidos con < 1 mm.
 *   Calor extremo  : días seguidos con máxima ≥ 35 °C (valor = la máxima más alta).
 *   Helada         : días seguidos con mínima ≤ 0 °C (valor = la mínima más baja).
 */
export type DayObs = { date: string; precip: number | null; tmax: number | null; tmin: number | null };
export type EventKind = 'heavyRain' | 'drySpell' | 'heat' | 'frost';
export type FieldEvent = { kind: EventKind; start: string; end: string; days: number; value: number; peakDate: string };

export const RULES = {
  heavyRainMm: 20,
  heavyRainFactor: 3,
  heavyRainMinMm: 10,
  dryDayMm: 1,
  drySpellDays: 7,
  heatC: 35,
  frostC: 0,
} as const;

export type PeriodSummary = {
  totalMm: number;
  /** Lluvia normal para los mismos días (mm), si hay climatología. */
  normalMm: number | null;
  /** Diferencia con lo normal en %, null sin climatología o con normal ~0. */
  pct: number | null;
  rainyDays: number;
  wettest: { date: string; mm: number } | null;
  hottest: { date: string; c: number } | null;
  coldest: { date: string; c: number } | null;
  /** Días con dato de lluvia / días del periodo. */
  coverage: number;
  events: FieldEvent[];
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Agrupa días consecutivos que cumplen `pred` en eventos. */
function runs(days: DayObs[], pred: (d: DayObs) => boolean): DayObs[][] {
  const out: DayObs[][] = [];
  let cur: DayObs[] = [];
  for (const d of days) {
    if (pred(d)) cur.push(d);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function isHeavyRain(mm: number | null, normalMmPerDay: number | null) {
  if (mm == null) return false;
  if (mm >= RULES.heavyRainMm) return true;
  return normalMmPerDay != null && normalMmPerDay > 0 && mm >= RULES.heavyRainFactor * normalMmPerDay && mm >= RULES.heavyRainMinMm;
}

export function summarizePeriod(days: DayObs[], normalMmPerDay: number | null, periodDays = days.length): PeriodSummary {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const withRain = sorted.filter((d) => d.precip != null);
  const totalMm = r1(withRain.reduce((a, d) => a + d.precip!, 0));
  const normalMm = normalMmPerDay != null ? r1(normalMmPerDay * withRain.length) : null;
  const pct = normalMm != null && normalMm > 0.5 ? Math.round(((totalMm - normalMm) / normalMm) * 100) : null;
  const pick = <K extends 'precip' | 'tmax' | 'tmin'>(k: K, better: (a: number, b: number) => boolean) =>
    sorted.reduce<DayObs | null>((best, d) => (d[k] != null && (best == null || better(d[k]!, best[k]!)) ? d : best), null);
  const wet = pick('precip', (a, b) => a > b);
  const hot = pick('tmax', (a, b) => a > b);
  const cold = pick('tmin', (a, b) => a < b);

  const events: FieldEvent[] = [];
  const mk = (kind: EventKind, run: DayObs[], value: number, peak: DayObs): FieldEvent => ({
    kind,
    start: run[0]!.date,
    end: run.at(-1)!.date,
    days: run.length,
    value: r1(value),
    peakDate: peak.date,
  });

  for (const run of runs(sorted, (d) => isHeavyRain(d.precip, normalMmPerDay))) {
    const peak = run.reduce((a, b) => (b.precip! > a.precip! ? b : a));
    events.push(mk('heavyRain', run, run.reduce((a, d) => a + d.precip!, 0), peak));
  }
  for (const run of runs(sorted, (d) => d.precip != null && d.precip < RULES.dryDayMm)) {
    if (run.length >= RULES.drySpellDays) events.push(mk('drySpell', run, run.length, run.at(-1)!));
  }
  for (const run of runs(sorted, (d) => d.tmax != null && d.tmax >= RULES.heatC)) {
    const peak = run.reduce((a, b) => (b.tmax! > a.tmax! ? b : a));
    events.push(mk('heat', run, peak.tmax!, peak));
  }
  for (const run of runs(sorted, (d) => d.tmin != null && d.tmin <= RULES.frostC)) {
    const peak = run.reduce((a, b) => (b.tmin! < a.tmin! ? b : a));
    events.push(mk('frost', run, peak.tmin!, peak));
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind));

  return {
    totalMm,
    normalMm,
    pct,
    rainyDays: withRain.filter((d) => d.precip! >= RULES.dryDayMm).length,
    wettest: wet && wet.precip! > 0 ? { date: wet.date, mm: r1(wet.precip!) } : null,
    hottest: hot ? { date: hot.date, c: r1(hot.tmax!) } : null,
    coldest: cold ? { date: cold.date, c: r1(cold.tmin!) } : null,
    coverage: periodDays > 0 ? withRain.length / periodDays : 0,
    events,
  };
}
