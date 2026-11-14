/**
 * Calendario de siembra a partir del clima de la finca (no meses fijos por región):
 *  - temporada principal: los meses cálidos (≥ 12 °C, sin heladas) con lluvia ≥ ½ ET0 (periodo de crecimiento FAO).
 *    Si llueve todo el año, empieza en el mes en que más sube la lluvia (inicio de lluvias).
 *  - segunda temporada: el otro pico de lluvia en climas bimodales (Andes, África del Este), si existe.
 *  - época fresca: el primer mes ≤ 22 °C después del cultivo anterior (cereales de invierno, coberturas).
 *  - el ciclo de cada cultivo se alarga con el frío y se acorta con el calor (aprox. de grados-día).
 */
import type { CropId, CropSeason } from '@/lib/api/contract';
import { cycleMonths } from '@/features/rotations/mixed/traits';
import { crop } from './agronomy';
import type { Site } from './site';

export const shift = (m: number, n: number) => ((((m - 1 + n) % 12) + 12) % 12) + 1;

type Run = { start: number; len: number };

/** Tramos seguidos (circulares) de meses que cumplen la condición, del más largo al más corto. */
export function runs(flags: boolean[]): Run[] {
  if (flags.every(Boolean)) return [{ start: 1, len: 12 }];
  const out: Run[] = [];
  const first = flags.findIndex((f) => !f);
  for (let k = 1; k <= 12; k++) {
    const i = (first + k) % 12;
    if (!flags[i]) continue;
    const prev = (i + 11) % 12;
    if (flags[prev]) continue;
    let len = 0;
    while (len < 12 && flags[(i + len) % 12]) len++;
    out.push({ start: i + 1, len });
  }
  return out.sort((a, b) => b.len - a.len);
}

export type Windows = {
  main: Run;
  second: Run | null;
  /** true si la temporada principal solo existe con riego. */
  needsIrrigation: boolean;
};

export function warmOk(site: Site, m: number) {
  const x = site.months[m - 1]!;
  return x.t >= 12 && x.frost < 2;
}

export function wetOk(site: Site, m: number) {
  const x = site.months[m - 1]!;
  return x.p >= 0.5 * x.et0;
}

/** Mes de inicio de lluvias: el que más sube la lluvia de los 3 meses siguientes frente a los 3 anteriores. */
function onset(site: Site, exclude: number[] = []): number {
  const p = site.months.map((m) => m.p);
  let best = 1;
  let bestV = -Infinity;
  for (let m = 1; m <= 12; m++) {
    if (exclude.some((e) => Math.min(Math.abs(e - m), 12 - Math.abs(e - m)) < 4)) continue;
    const next = [0, 1, 2].reduce((a, k) => a + p[shift(m, k) - 1]!, 0);
    const prev = [1, 2, 3].reduce((a, k) => a + p[shift(m, -k) - 1]!, 0);
    if (next - prev > bestV) {
      bestV = next - prev;
      best = m;
    }
  }
  return best;
}

export function windows(site: Site): Windows {
  const warm = Array.from({ length: 12 }, (_, i) => warmOk(site, i + 1));
  const rainfed = runs(warm.map((w, i) => w && wetOk(site, i + 1)));
  const main = rainfed.find((r) => r.len >= 2);
  if (main) {
    if (main.len === 12) {
      const a = onset(site);
      const b = onset(site, [a]);
      return { main: { start: a, len: 12 }, second: { start: b, len: 6 }, needsIrrigation: false };
    }
    const second = rainfed.find((r) => r !== main && r.len >= 2) ?? null;
    return { main, second, needsIrrigation: false };
  }
  // Sin temporada de lluvias cálida: solo con riego (o cultivos de época fresca).
  const warmRuns = runs(warm);
  const w = warmRuns[0];
  if (w && w.len === 12) return { main: { start: onset(site), len: 12 }, second: null, needsIrrigation: true };
  if (w) return { main: w, second: null, needsIrrigation: true };
  const hottest = site.months.reduce((a, b) => (b.t > a.t ? b : a)).month;
  return { main: { start: hottest, len: 3 }, second: null, needsIrrigation: true };
}

/** Meses de ciclo del cultivo si se siembra en `start` (perennes: 12). */
export function cycleFor(site: Site, id: CropId, start: number): number {
  const { t } = crop(id);
  if (t.perennial) return 12;
  const base = cycleMonths(t);
  const temps = Array.from({ length: base }, (_, k) => site.months[shift(start, k) - 1]!.t);
  const tbar = temps.reduce((a, b) => a + b, 0) / base;
  const [tb, ref] = t.frostOk ? [0, 15] : [10, 24];
  const factor = Math.min(1.9, Math.max(0.9, (ref - tb) / Math.max(tbar - tb, 2)));
  return Math.min(11, Math.max(2, Math.round(base * factor)));
}

/** Primer mes fresco (≤ 22 °C) desde `from`, para sembrar un cultivo de invierno. */
export function coolStart(site: Site, from: number): number {
  for (let k = 0; k < 8; k++) {
    const m = shift(from, k);
    if (site.months[m - 1]!.t <= 22) return m;
  }
  return from;
}

// ---------------------------------------------------------------- línea de tiempo absoluta

/** Posición absoluta (0 … años×12−1) de un mes de un año de la rotación. */
export const absOf = (year: number, month: number) => (year - 1) * 12 + (month - 1);

export function toSeason(crop: CropId, role: CropSeason['role'], abs: number, len: number, years: number): CropSeason {
  const total = years * 12;
  const a = ((abs % total) + total) % total;
  const year = Math.floor(a / 12) + 1;
  const startMonth = (a % 12) + 1;
  return { crop, role, year, startMonth, endMonth: shift(startMonth, Math.min(12, len) - 1) };
}

export function seasonLength(s: Pick<CropSeason, 'startMonth' | 'endMonth'>): number {
  return ((s.endMonth - s.startMonth + 12) % 12) + 1;
}

export const seasonAbs = (s: Pick<CropSeason, 'year' | 'startMonth'>) => absOf(s.year ?? 1, s.startMonth);
