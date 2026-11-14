import type { ClimateProfile, CropSeason, FieldInsights, Level } from '@/lib/api/contract';
import { monthCrops } from '../crops';

export type Stress = 'heat' | 'drought' | 'frost' | 'waterlogging';

export type MonthView = {
  month: number;
  rain: number | null;
  tMax: number | null;
  tMin: number | null;
  soil: number | null;
  ndvi: number | null;
  et: number | null;
  crop: CropSeason | null;
  bare: boolean;
  stress: Stress[];
};

/**
 * Un año de la finca mes a mes: clima (NASA POWER real si hay; si no, el del análisis), verdor (MODIS del
 * análisis), cultivo de la rotación, meses de suelo desnudo y meses de estrés.
 */
export function buildYear(
  climate: ClimateProfile,
  seasons: CropSeason[],
  opts: { ndviSource?: ClimateProfile; insights?: FieldInsights } = {},
): MonthView[] {
  const crops = monthCrops(seasons);
  const fromInsights = new Map<number, Set<Stress>>();
  for (const s of opts.insights?.stressSeasons ?? []) {
    for (const m of s.months) {
      if (!fromInsights.has(m)) fromInsights.set(m, new Set());
      fromInsights.get(m)!.add(s.kind);
    }
  }

  return climate.months.map((c, i) => {
    const month = i + 1;
    const rain = c.precip.value;
    const et = c.et.value;
    const stress = new Set<Stress>(fromInsights.get(month) ?? []);
    if ((c.heatDays.value ?? 0) >= 3) stress.add('heat');
    if ((c.frostDays.value ?? 0) >= 1) stress.add('frost');
    // Sequía: llueve menos de la mitad de lo que pierde el campo, o el suelo está mucho más seco de lo normal.
    if ((rain != null && et != null && rain < et * 0.5 && et > 30) || (c.soilMoistureAnomaly.value ?? 0) <= -8) stress.add('drought');
    if (rain != null && rain > 250 && (c.soilMoisture.value ?? 0) >= 80) stress.add('waterlogging');
    return {
      month,
      rain,
      tMax: c.tMax.value,
      tMin: c.tMin.value,
      soil: c.soilMoisture.value,
      ndvi: c.ndvi.value ?? opts.ndviSource?.months[i]?.ndvi.value ?? null,
      et,
      crop: crops[i] ?? null,
      bare: !crops[i],
      stress: [...stress],
    };
  });
}

/** Agrupa meses consecutivos: [11,12,1,2] → "nov–feb". */
export function monthRanges(months: number[], names: string[]): string {
  if (!months.length) return '';
  const set = new Set(months);
  const ranges: [number, number][] = [];
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(m === 1 ? 12 : m - 1)) continue;
    let end = m;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== m) end = (end % 12) + 1;
    ranges.push([m, end]);
  }
  if (!ranges.length) return names.join('–'); // todo el año
  return ranges.map(([a, b]) => (a === b ? names[a - 1] : `${names[a - 1]}–${names[b - 1]}`)).join(', ');
}

export const levelFromCount = (n: number, med: number, high: number): Level => (n >= high ? 'high' : n >= med ? 'medium' : 'low');
