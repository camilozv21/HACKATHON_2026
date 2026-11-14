import type { RotationStrategy } from '@/lib/api/contract';
import { rotationRows } from '@/features/field/crops';

/**
 * Escenarios "¿y si…?" calculados en el teléfono con reglas simples (el backend todavía no los soporta).
 * Son una ESTIMACIÓN y la UI lo dice siempre.
 *
 *   r = cambio de lluvia en % (−30 a +30)      t = calentamiento en °C (0 a 3)
 *   sed    = sensibilidad al agua = (100 − water) / 100     (las opciones que piden más agua sufren más)
 *   cover  = meses con suelo cubierto / 12
 *   seco   = max(0, −r) × 0.6 + t × 5           (puntos de estrés por menos lluvia y más calor)
 *   humedo = max(0, r)
 *
 *   agua'     = agua − seco × (0.5 + sed) + humedo × 0.2 × (0.5 + sed)
 *   erosión'  = erosión − humedo × 0.4 × (1 − cover)      (más lluvia sobre suelo desnudo = más lavado)
 *   ingresos' = ingresos − seco × 0.3 × sed               (el estrés baja el rendimiento de lo que más agua pide)
 *   uso de agua mensual' = uso × (1 + 0.04 × t)          (~4 % más evapotranspiración por cada °C)
 *
 * Todos los puntajes se mantienen entre 0 y 100.
 */
export type Scenario = { rainPct: number; tempC: number };
export const NEUTRAL: Scenario = { rainPct: 0, tempC: 0 };
export const RAIN_RANGE = { min: -30, max: 30, step: 10 } as const;
export const TEMP_RANGE = { min: 0, max: 3, step: 0.5 } as const;

export const isNeutral = (s: Scenario) => s.rainPct === 0 && s.tempC === 0;

const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)));

/** Fracción del año con suelo cubierto (promedio de los años de la rotación). */
export function coverFraction(s: Pick<RotationStrategy, 'monthly' | 'seasons' | 'durationMonths'>): number {
  if (s.monthly?.length === 12) return s.monthly.filter((m) => m.soilCovered).length / 12;
  const years = Math.max(1, s.durationMonths / 12);
  let covered = 0;
  for (const row of rotationRows(s.seasons, years)) covered += row.filter(Boolean).length;
  return covered / (12 * years);
}

export function applyScenario<T extends RotationStrategy>(s: T, sc: Scenario): T {
  if (isNeutral(sc)) return s;
  const sed = (100 - s.scores.water) / 100;
  const cover = coverFraction(s);
  const dry = Math.max(0, -sc.rainPct) * 0.6 + sc.tempC * 5;
  const wet = Math.max(0, sc.rainPct);
  return {
    ...s,
    scores: {
      ...s.scores,
      water: clamp(s.scores.water - dry * (0.5 + sed) + wet * 0.2 * (0.5 + sed)),
      erosion: clamp(s.scores.erosion - wet * 0.4 * (1 - cover)),
      income: clamp(s.scores.income - dry * 0.3 * sed),
    },
    monthly: s.monthly?.map((m) => ({ ...m, waterUseMm: Math.round(m.waterUseMm * (1 + 0.04 * sc.tempC)) })),
  };
}
