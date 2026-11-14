/**
 * Parámetros agronómicos que usa el motor de recomendaciones, además de los rasgos compartidos con la UI de
 * cultivos asociados (src/features/rotations/mixed/traits.ts: altura, raíces, ciclo, familia, temperatura, agua).
 *
 * Fuentes (valores típicos, redondeados; cambian con la variedad y el manejo):
 *  - kc: coeficiente de cultivo medio de la temporada — FAO-56 (Allen et al. 1998), tabla 12 (promedio ini/med/fin).
 *  - ky: respuesta del rendimiento al déficit de agua — FAO-33 (Doorenbos y Kassam 1979).
 *  - residue: cuánto rastrojo y raíz vuelve al suelo (0–1), relativo al maíz (≈ 1).
 *  - canopy: fracción del suelo que cubre el cultivo en pleno desarrollo (0–1). Base del factor C de RUSLE.
 *  - value: margen bruto relativo por ciclo (perennes: por año), 0–100. Genérico: NO son precios locales.
 *  - forage: forraje aprovechable (0–1): pastoreo por mes en coberturas y forrajes, rastrojo en cultivos de grano.
 */
import type { CropId, FarmerPriorities } from '@/lib/api/contract';
import { monthScore, type MonthlyClimate } from '@/features/rotations/mixed/climate';
import { traitsOf, type CropTraits } from '@/features/rotations/mixed/traits';

export type Agro = { kc: number; ky: number; residue: number; canopy: number; value: number; forage: number };

const A = (kc: number, ky: number, residue: number, canopy: number, value: number, forage: number): Agro => ({
  kc,
  ky,
  residue,
  canopy,
  value,
  forage,
});

const AGRO: Partial<Record<CropId, Agro>> = {
  maize: A(0.9, 1.25, 1, 0.85, 55, 0.35),
  soybean: A(0.85, 0.85, 0.35, 0.85, 60, 0.1),
  wheat: A(0.8, 1.05, 0.7, 0.8, 50, 0.25),
  rice: A(1.1, 1.2, 0.6, 0.85, 65, 0.25),
  coffee: A(0.95, 1, 0.6, 0.55, 85, 0),
  beans: A(0.8, 1.15, 0.25, 0.7, 60, 0.15),
  sorghum: A(0.75, 0.9, 0.9, 0.75, 40, 0.45),
  millet: A(0.7, 0.85, 0.7, 0.6, 35, 0.35),
  cowpea: A(0.8, 0.9, 0.35, 0.75, 45, 0.6),
  groundnut: A(0.85, 0.7, 0.25, 0.75, 55, 0.5),
  chickpea: A(0.7, 0.85, 0.25, 0.6, 50, 0.2),
  mungbean: A(0.75, 0.9, 0.3, 0.7, 45, 0.3),
  barley: A(0.8, 1, 0.6, 0.75, 40, 0.3),
  oats: A(0.8, 1, 0.6, 0.8, 30, 0.8),
  potato: A(0.9, 1.1, 0.15, 0.75, 75, 0.05),
  cassava: A(0.65, 0.8, 0.4, 0.6, 55, 0.3),
  plantain: A(1, 1.2, 0.7, 0.7, 60, 0.2),
  sugarcane: A(1, 1.2, 0.6, 0.85, 70, 0.4),
  cotton: A(0.85, 0.85, 0.5, 0.7, 60, 0.1),
  sunflower: A(0.75, 0.95, 0.5, 0.7, 45, 0.1),
  alfalfa: A(0.95, 1.1, 0.6, 0.95, 45, 1),
  clover: A(0.85, 0.8, 0.5, 0.85, 0, 0.8),
  vetch: A(0.8, 0.8, 0.5, 0.85, 0, 0.7),
  rye: A(0.75, 0.8, 0.8, 0.85, 0, 0.6),
  radish: A(0.75, 0.8, 0.4, 0.8, 0, 0.4),
  pasture: A(0.85, 1, 0.8, 0.95, 25, 1),
  'forage-peanut': A(0.85, 0.8, 0.6, 0.9, 0, 0.6),
  'shade-trees': A(0.9, 0.8, 0.9, 0.4, 5, 0.2),
  vegetables: A(0.9, 1.1, 0.2, 0.6, 85, 0.1),
  squash: A(0.8, 1, 0.25, 0.85, 45, 0.1),
  pigeonpea: A(0.8, 0.8, 0.6, 0.6, 45, 0.5),
  fallow: A(0.3, 0, 0.1, 0.1, 0, 0.2),
};

const GENERIC_AGRO = A(0.85, 1, 0.4, 0.7, 45, 0.2);

/** Rasgos de respaldo para cultivos que la UI de asociaciones no modela (hortalizas, descanso). */
const FALLBACK_TRAITS: Partial<Record<CropId, CropTraits>> = {
  vegetables: {
    heightM: 0.6,
    spreadM: 0.5,
    habit: 'bush',
    rootM: 0.5,
    cycleDays: 90,
    feeder: 'heavy',
    family: 'mixed',
    tempC: [12, 28],
    waterMm: 450,
    drought: 'low',
    waterlog: 'low',
    shade: 'low',
    wetOk: false,
    food: true,
  },
  fallow: {
    heightM: 0.3,
    spreadM: 0.3,
    habit: 'grass',
    rootM: 0.3,
    cycleDays: 90,
    feeder: 'light',
    family: 'mixed',
    tempC: [-30, 45],
    frostOk: true,
    waterMm: 0,
    drought: 'high',
    waterlog: 'high',
    shade: 'high',
    wetOk: true,
    food: false,
  },
};

const GENERIC_TRAITS: CropTraits = { ...FALLBACK_TRAITS.vegetables!, feeder: 'medium' };

export type Crop = { id: CropId; t: CropTraits; a: Agro };

export function crop(id: CropId): Crop {
  return { id, t: traitsOf(id) ?? FALLBACK_TRAITS[id] ?? GENERIC_TRAITS, a: AGRO[id] ?? GENERIC_AGRO };
}

export const isLegume = (id: CropId) => Boolean(crop(id).t.nFix);
export const isHungry = (id: CropId) => crop(id).t.feeder === 'heavy' && !crop(id).t.nFix;

/**
 * Resistencia al invierno: temperatura media del mes (°C) por debajo de la cual el cultivo se muere (no solo se
 * detiene). Centeno y trigo de invierno aguantan inviernos continentales; avena y rábano se mueren con heladas
 * fuertes (por eso son coberturas "que el invierno mata"). Valores aproximados de guías de coberturas (SARE, 2019).
 */
const WINTER_KILL_C: Partial<Record<CropId, number>> = {
  rye: -25,
  wheat: -15,
  alfalfa: -20,
  pasture: -15,
  clover: -12,
  vetch: -10,
  barley: -8,
  oats: -4,
  radish: -3,
};

/** 0–1: qué tan bien crece el cultivo ese mes (misma cuenta que la UI de asociaciones + muerte por invierno). */
export function monthFit(
  id: CropId,
  month: number,
  clim: MonthlyClimate,
  irrigation: FarmerPriorities['constraints']['irrigation'],
): number {
  const c = crop(id);
  const t = clim.tMean[month - 1];
  const kill = WINTER_KILL_C[id];
  if (t != null && kill != null && t < kill) return 0;
  return monthScore(c.t, month, clim, { irrigation });
}

// ---------------------------------------------------------------- nombres (texto que genera el "backend")

type L = { es: string; en: string };

const NAMES: Partial<Record<CropId, L>> = {
  maize: { es: 'maíz', en: 'maize' },
  soybean: { es: 'soya', en: 'soybean' },
  wheat: { es: 'trigo', en: 'wheat' },
  rice: { es: 'arroz', en: 'rice' },
  coffee: { es: 'café', en: 'coffee' },
  beans: { es: 'frijol', en: 'beans' },
  sorghum: { es: 'sorgo', en: 'sorghum' },
  millet: { es: 'mijo', en: 'millet' },
  cowpea: { es: 'caupí', en: 'cowpea' },
  groundnut: { es: 'maní', en: 'groundnut' },
  chickpea: { es: 'garbanzo', en: 'chickpea' },
  mungbean: { es: 'frijol mungo', en: 'mungbean' },
  barley: { es: 'cebada', en: 'barley' },
  oats: { es: 'avena', en: 'oats' },
  potato: { es: 'papa', en: 'potato' },
  cassava: { es: 'yuca', en: 'cassava' },
  plantain: { es: 'plátano', en: 'plantain' },
  sugarcane: { es: 'caña', en: 'sugarcane' },
  cotton: { es: 'algodón', en: 'cotton' },
  sunflower: { es: 'girasol', en: 'sunflower' },
  alfalfa: { es: 'alfalfa', en: 'alfalfa' },
  clover: { es: 'trébol', en: 'clover' },
  vetch: { es: 'vicia', en: 'vetch' },
  rye: { es: 'centeno', en: 'cereal rye' },
  radish: { es: 'rábano forrajero', en: 'forage radish' },
  pasture: { es: 'pasto', en: 'pasture' },
  'forage-peanut': { es: 'maní forrajero', en: 'forage peanut' },
  'shade-trees': { es: 'árboles de sombra', en: 'shade trees' },
  vegetables: { es: 'hortalizas', en: 'vegetables' },
  squash: { es: 'calabaza', en: 'squash' },
  pigeonpea: { es: 'guandul', en: 'pigeon pea' },
  fallow: { es: 'descanso', en: 'fallow' },
};

export function cropName(id: CropId, locale: 'es' | 'en'): string {
  return NAMES[id]?.[locale] ?? id;
}

export const capitalize = (s: string) => (s ? s[0]!.toLocaleUpperCase() + s.slice(1) : s);
