import type { CropSeason, FarmerPriorities, RotationStrategy } from '@/lib/api/contract';

/**
 * Cómo ordenamos las estrategias según lo que le importa a la persona (todo en el cliente, sin backend).
 *
 *   1. Cada prioridad recibe un peso: mucho = 5, algo = 3, poco = 1  (FarmerPriorities guarda 0–5).
 *   2. Cada estrategia trae puntajes 0–100 del backend. Los convertimos en un puntaje por prioridad:
 *        ahorrar agua      = water
 *        mejorar el suelo  = (soilOrganicMatter + nitrogen + pestBreak) / 3
 *        más ingresos      = income
 *        forraje           = forage
 *        frenar la erosión = erosion
 *        menos trabajo     = 100 − 25 × (siembras por año − 1), entre 0 y 100   ← estimación nuestra
 *   3. Puntaje total = Σ (peso × puntaje de la prioridad) ÷ Σ pesos   → sigue en 0–100.
 *   4. Orden: mayor puntaje primero; si empatan, se respeta el orden del backend.
 *
 * Cambiar prioridades solo vuelve a hacer esta cuenta. Las restricciones (riego, maquinaria, mercados) sí van
 * al backend, porque cambian qué estrategias son viables.
 */

export const PRIORITY_KEYS = ['waterSaving', 'soilHealth', 'income', 'forage', 'erosionControl', 'laborEquipment'] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export const LEVELS = ['high', 'mid', 'low'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_WEIGHT: Record<Level, number> = { high: 5, mid: 3, low: 1 };

/** Peso guardado (0–5) → nivel que ve la persona. */
export function levelOf(weight: number): Level {
  return weight >= 4 ? 'high' : weight >= 2 ? 'mid' : 'low';
}

type Scorable = Pick<RotationStrategy, 'scores' | 'seasons' | 'durationMonths'>;

/**
 * Siembras por año: cada temporada que no es perenne ni descanso cuenta como una siembra; un perenne, media.
 * Una mezcla de cobertura (varias especies sembradas el mismo mes) se siembra en una sola pasada: cuenta una vez.
 */
export function sowingsPerYear(seasons: CropSeason[], durationMonths: number): number {
  const years = Math.max(1, durationMonths / 12);
  const coverPasses = new Set<string>();
  const ops = seasons.reduce((n, s) => {
    if (s.role === 'fallow') return n;
    if (s.role === 'perennial') return n + 0.5;
    if (s.role === 'cover') {
      const key = `${s.year ?? 1}:${s.startMonth}`;
      if (coverPasses.has(key)) return n;
      coverPasses.add(key);
    }
    return n + 1;
  }, 0);
  return ops / years;
}

export function laborScore(seasons: CropSeason[], durationMonths: number): number {
  const v = 100 - 25 * (sowingsPerYear(seasons, durationMonths) - 1);
  return Math.round(Math.min(100, Math.max(0, v)));
}

export function priorityScores(s: Scorable): Record<PriorityKey, number> {
  const { scores } = s;
  return {
    waterSaving: scores.water,
    soilHealth: Math.round((scores.soilOrganicMatter + scores.nitrogen + scores.pestBreak) / 3),
    income: scores.income,
    forage: scores.forage,
    erosionControl: scores.erosion,
    laborEquipment: laborScore(s.seasons, s.durationMonths),
  };
}

export type Contribution = { key: PriorityKey; weight: number; score: number; points: number };

/** Puntaje total 0–100 y aporte de cada prioridad (para mostrar la cuenta en la UI). */
export function scoreStrategy(s: Scorable, priorities: FarmerPriorities): { total: number; parts: Contribution[] } {
  const ps = priorityScores(s);
  let weights = PRIORITY_KEYS.map((k) => Math.max(0, priorities[k]));
  // Si todo vale 0, todas pesan igual (evita dividir entre 0).
  if (weights.every((w) => w === 0)) weights = weights.map(() => 1);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const parts = PRIORITY_KEYS.map((key, i) => {
    const weight = weights[i]!;
    const score = ps[key];
    return { key, weight, score, points: (weight * score) / sumW };
  });
  const total = Math.round(parts.reduce((a, p) => a + p.points, 0));
  return { total, parts };
}

export type Ranked<T extends Scorable> = { strategy: T; total: number; parts: Contribution[]; rank: number };

export function rankStrategies<T extends Scorable>(strategies: readonly T[], priorities: FarmerPriorities): Ranked<T>[] {
  return strategies
    .map((strategy, i) => ({ strategy, i, ...scoreStrategy(strategy, priorities) }))
    .sort((a, b) => b.total - a.total || a.i - b.i)
    .map(({ strategy, total, parts }, idx) => ({ strategy, total, parts, rank: idx + 1 }));
}
