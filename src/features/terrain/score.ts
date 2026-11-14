/**
 * Zonas de riesgo: de los indicadores crudos (GEE) a un puntaje 0–100 por riesgo, su nivel y la evidencia.
 * Tramos absolutos (no percentiles): un municipio no sale "alto" solo por compararse con los demás.
 * Tabla de tramos y pesos: docs/terrain-risk.md.
 */
import type { Confidence, Level } from '@/lib/api/contract';
import type { TerrainIndicators, TerrainItem } from '@/lib/api/terrain';
import { HAZARDS, LAND_STATES, type Hazard } from './kinds';

export type IndicatorId = keyof TerrainIndicators | 'waterShare';

/** Cada componente: indicador, de qué valor (0 puntos) a qué valor (100 puntos) y peso dentro del riesgo. */
type Component = { id: IndicatorId; from: number; to: number; weight: number };

export const COMPONENTS: Record<Hazard, Component[]> = {
  drought: [
    { id: 'smAnom', from: 0, to: -25, weight: 0.35 },
    { id: 'pAnom', from: 0, to: -30, weight: 0.3 },
    { id: 'etRatio', from: 0.8, to: 0.3, weight: 0.2 },
    { id: 'gwTrend', from: 0, to: -2, weight: 0.15 },
  ],
  water: [
    { id: 'pHeavy', from: 0, to: 8, weight: 0.3 },
    { id: 'smWet', from: 0, to: 40, weight: 0.3 },
    { id: 'flat', from: 0, to: 60, weight: 0.25 },
    { id: 'waterShare', from: 0, to: 15, weight: 0.15 },
  ],
  heat: [
    { id: 'lstHot', from: 0, to: 50, weight: 0.7 },
    { id: 'lstAnom', from: 0, to: 2, weight: 0.3 },
  ],
  soil: [
    { id: 'toBare', from: 0, to: 10, weight: 0.35 },
    { id: 'ndviTrend', from: 0, to: -0.08, weight: 0.35 },
    // Erosión: lluvia que erosiona (Fournier) × factor de pendiente; se calcula aparte.
    { id: 'mfi', from: 60, to: 160, weight: 0.3 },
  ],
};

/** Misión de cada indicador (para mostrar de dónde sale cada frase). */
export const INDICATOR_SOURCE: Record<IndicatorId, string> = {
  smAnom: 'SMAP',
  smWet: 'SMAP',
  pAnom: 'GPM IMERG',
  pHeavy: 'GPM IMERG',
  mfi: 'GPM IMERG · SRTM',
  etRatio: 'MODIS ET',
  lstHot: 'MODIS LST',
  lstAnom: 'MODIS LST',
  gwTrend: 'GRACE/GRACE-FO',
  slope: 'SRTM',
  flat: 'SRTM',
  ndviTrend: 'MODIS NDVI',
  toBare: 'MODIS NDVI',
  waterShare: 'MODIS (MNDWI)',
};

/** Puntos (0–100) de un valor en un tramo; sirve para tramos que suben o bajan. */
export function ramp(v: number, from: number, to: number): number {
  const x = (v - from) / (to - from);
  return Math.round(Math.min(1, Math.max(0, x)) * 100);
}

/** Factor de pendiente para la erosión: plano ≈ 0,2; ≥ 30 % = 1. */
export const slopeFactor = (slopePct: number) => Math.min(1, 0.2 + (0.8 * Math.max(0, slopePct)) / 30);

export const levelOf = (score: number): Level => (score >= 67 ? 'high' : score >= 34 ? 'medium' : 'low');

export type Evidence = { id: IndicatorId; value: number; points: number; source: string };

export type HazardResult = {
  hazard: Hazard;
  score: number | null;
  level: Level | null;
  /** Componentes con dato, de mayor a menor aporte. */
  evidence: Evidence[];
  /** Indicadores sin dato en este municipio. */
  missing: IndicatorId[];
};

export type TerrainRisk = {
  hazards: Record<Hazard, HazardResult>;
  all: { score: number | null; level: Level | null; top: Hazard | null };
  confidence: Confidence;
};

function valueOf(item: TerrainItem, id: IndicatorId): number | null {
  if (id === 'waterShare') return (item.p1[LAND_STATES.indexOf('water')] ?? 0) / 10;
  return item.i[id];
}

export function scoreHazard(item: TerrainItem, hazard: Hazard): HazardResult {
  const evidence: Evidence[] = [];
  const missing: IndicatorId[] = [];
  let sum = 0;
  let weights = 0;
  for (const c of COMPONENTS[hazard]) {
    const value = valueOf(item, c.id);
    if (value == null) {
      missing.push(c.id);
      continue;
    }
    let points = ramp(value, c.from, c.to);
    if (c.id === 'mfi') {
      const slope = item.i.slope;
      if (slope == null) missing.push('slope');
      points = Math.round(points * slopeFactor(slope ?? 4));
    }
    sum += points * c.weight;
    weights += c.weight;
    evidence.push({ id: c.id, value, points, source: INDICATOR_SOURCE[c.id] });
  }
  // Con menos de la mitad del peso con dato, no se da puntaje: se dice que falta información.
  if (weights < 0.5) return { hazard, score: null, level: null, evidence, missing };
  const score = Math.round(sum / weights);
  evidence.sort((a, b) => b.points - a.points);
  return { hazard, score, level: levelOf(score), evidence, missing };
}

/** Riesgo combinado: 0,6 × el peor + 0,4 × el promedio (un riesgo grave no se diluye entre los demás). */
export function combine(scores: (number | null)[]): number | null {
  const ok = scores.filter((s): s is number => s != null);
  if (!ok.length) return null;
  const max = Math.max(...ok);
  const mean = ok.reduce((a, b) => a + b, 0) / ok.length;
  return Math.round(0.6 * max + 0.4 * mean);
}

export function confidenceOf(valid: number, synthetic: boolean): Confidence {
  if (synthetic) return 'low';
  return valid >= 0.8 ? 'high' : valid >= 0.5 ? 'medium' : 'low';
}

export function scoreTerrain(item: TerrainItem, opts: { synthetic: boolean }): TerrainRisk {
  const hazards = Object.fromEntries(HAZARDS.map((h) => [h, scoreHazard(item, h)])) as Record<Hazard, HazardResult>;
  const score = combine(HAZARDS.map((h) => hazards[h].score));
  let top: Hazard | null = null;
  for (const h of HAZARDS) if (hazards[h].score != null && (top == null || hazards[h].score! > hazards[top].score!)) top = h;
  return {
    hazards,
    all: { score, level: score == null ? null : levelOf(score), top },
    confidence: confidenceOf(item.v, opts.synthetic),
  };
}

/** Nivel por tipo para pintar el mapa: `{ all, drought, water, heat, soil }` (null = sin dato). */
export function levelsFor(item: TerrainItem, opts: { synthetic: boolean }) {
  const r = scoreTerrain(item, opts);
  return {
    all: r.all.level,
    drought: r.hazards.drought.level,
    water: r.hazards.water.level,
    heat: r.hazards.heat.level,
    soil: r.hazards.soil.level,
  };
}
