import type { CropId } from '@/lib/api/contract';

/**
 * Rasgos típicos de cada cultivo para armar asociaciones (cultivos que crecen juntos).
 * Son valores aproximados de guías agronómicas generales: cambian con la variedad, el suelo y el manejo.
 * La UI siempre lo dice ("valores típicos; tu variedad puede variar").
 */

export type Habit = 'tree' | 'erect' | 'grass' | 'bush' | 'climber' | 'creeper';
/** Familia botánica: dos cultivos de la misma familia comparten plagas y enfermedades. */
export type BotanicalFamily = 'grass' | 'legume' | 'squash' | 'spurge' | 'nightshade' | 'mustard' | 'daisy' | 'mallow' | 'banana' | 'coffee' | 'mixed';
export type Tol = 'low' | 'medium' | 'high';

export type CropTraits = {
  /** Altura de la planta adulta (m). Un trepador: hasta dónde sube si tiene tutor. */
  heightM: number;
  /** Ancho de la copa de una mata (m): cuánto espacio ocupa a lo ancho. */
  spreadM: number;
  habit: Habit;
  /** Profundidad efectiva de las raíces (m). */
  rootM: number;
  /** Días de siembra a cosecha (perennes: 365). */
  cycleDays: number;
  perennial?: boolean;
  /** Fija nitrógeno del aire (leguminosas). */
  nFix?: boolean;
  /** Cuánto abono pide. */
  feeder: 'heavy' | 'medium' | 'light';
  family: BotanicalFamily;
  /** Temperatura media del mes en la que crece bien (°C). */
  tempC: [number, number];
  /** Aguanta heladas. */
  frostOk?: boolean;
  /** Agua que usa en su ciclo (mm; perennes: por año). */
  waterMm: number;
  drought: Tol;
  /** Aguanta suelo encharcado. */
  waterlog: Tol;
  /** Aguanta sombra. */
  shade: Tol;
  /** Aguanta meses muy lluviosos (> 220 mm) sin hongos ni pudrición. */
  wetOk: boolean;
  /** Se cosecha para comer o vender (false: cobertura, forraje o sombra). */
  food: boolean;
};

const T = (t: CropTraits) => t;

export const TRAITS: Partial<Record<CropId, CropTraits>> = {
  maize: T({ heightM: 2.5, spreadM: 0.6, habit: 'erect', rootM: 1.2, cycleDays: 120, feeder: 'heavy', family: 'grass', tempC: [14, 32], waterMm: 550, drought: 'medium', waterlog: 'low', shade: 'low', wetOk: true, food: true }),
  beans: T({ heightM: 2, spreadM: 0.4, habit: 'climber', rootM: 0.6, cycleDays: 90, nFix: true, feeder: 'light', family: 'legume', tempC: [14, 28], waterMm: 350, drought: 'low', waterlog: 'low', shade: 'medium', wetOk: true, food: true }),
  squash: T({ heightM: 0.5, spreadM: 2, habit: 'creeper', rootM: 0.6, cycleDays: 100, feeder: 'heavy', family: 'squash', tempC: [16, 32], waterMm: 400, drought: 'medium', waterlog: 'low', shade: 'medium', wetOk: true, food: true }),
  cassava: T({ heightM: 2, spreadM: 1, habit: 'erect', rootM: 1.2, cycleDays: 300, feeder: 'medium', family: 'spurge', tempC: [19, 33], waterMm: 800, drought: 'high', waterlog: 'low', shade: 'low', wetOk: true, food: true }),
  coffee: T({ heightM: 2.5, spreadM: 1.5, habit: 'bush', rootM: 1, cycleDays: 365, perennial: true, feeder: 'medium', family: 'coffee', tempC: [17, 26], waterMm: 1300, drought: 'low', waterlog: 'low', shade: 'high', wetOk: true, food: true }),
  plantain: T({ heightM: 4, spreadM: 2.5, habit: 'erect', rootM: 0.6, cycleDays: 365, perennial: true, feeder: 'heavy', family: 'banana', tempC: [19, 32], waterMm: 1400, drought: 'low', waterlog: 'low', shade: 'medium', wetOk: true, food: true }),
  'shade-trees': T({ heightM: 10, spreadM: 6, habit: 'tree', rootM: 2.5, cycleDays: 365, perennial: true, nFix: true, feeder: 'light', family: 'mixed', tempC: [16, 32], waterMm: 1000, drought: 'medium', waterlog: 'low', shade: 'low', wetOk: true, food: false }),
  pigeonpea: T({ heightM: 2, spreadM: 1.2, habit: 'bush', rootM: 2, cycleDays: 200, nFix: true, feeder: 'light', family: 'legume', tempC: [18, 35], waterMm: 500, drought: 'high', waterlog: 'low', shade: 'low', wetOk: true, food: true }),
  soybean: T({ heightM: 0.9, spreadM: 0.5, habit: 'bush', rootM: 1, cycleDays: 120, nFix: true, feeder: 'light', family: 'legume', tempC: [15, 30], waterMm: 500, drought: 'medium', waterlog: 'low', shade: 'low', wetOk: true, food: true }),
  wheat: T({ heightM: 0.9, spreadM: 0.15, habit: 'grass', rootM: 1.2, cycleDays: 150, feeder: 'medium', family: 'grass', tempC: [3, 24], frostOk: true, waterMm: 450, drought: 'medium', waterlog: 'low', shade: 'low', wetOk: false, food: true }),
  rice: T({ heightM: 1, spreadM: 0.3, habit: 'grass', rootM: 0.4, cycleDays: 130, feeder: 'heavy', family: 'grass', tempC: [20, 35], waterMm: 1100, drought: 'low', waterlog: 'high', shade: 'low', wetOk: true, food: true }),
  sorghum: T({ heightM: 2, spreadM: 0.5, habit: 'erect', rootM: 1.5, cycleDays: 115, feeder: 'medium', family: 'grass', tempC: [18, 36], waterMm: 450, drought: 'high', waterlog: 'medium', shade: 'low', wetOk: false, food: true }),
  millet: T({ heightM: 2, spreadM: 0.4, habit: 'erect', rootM: 1.5, cycleDays: 85, feeder: 'light', family: 'grass', tempC: [21, 36], waterMm: 350, drought: 'high', waterlog: 'low', shade: 'low', wetOk: false, food: true }),
  cowpea: T({ heightM: 0.5, spreadM: 1, habit: 'creeper', rootM: 1, cycleDays: 80, nFix: true, feeder: 'light', family: 'legume', tempC: [20, 35], waterMm: 300, drought: 'high', waterlog: 'low', shade: 'medium', wetOk: true, food: true }),
  groundnut: T({ heightM: 0.4, spreadM: 0.5, habit: 'bush', rootM: 0.8, cycleDays: 120, nFix: true, feeder: 'light', family: 'legume', tempC: [20, 32], waterMm: 450, drought: 'medium', waterlog: 'low', shade: 'medium', wetOk: true, food: true }),
  chickpea: T({ heightM: 0.5, spreadM: 0.4, habit: 'bush', rootM: 1, cycleDays: 110, nFix: true, feeder: 'light', family: 'legume', tempC: [10, 27], waterMm: 300, drought: 'high', waterlog: 'low', shade: 'low', wetOk: false, food: true }),
  mungbean: T({ heightM: 0.6, spreadM: 0.4, habit: 'bush', rootM: 0.8, cycleDays: 70, nFix: true, feeder: 'light', family: 'legume', tempC: [20, 35], waterMm: 300, drought: 'high', waterlog: 'low', shade: 'low', wetOk: false, food: true }),
  barley: T({ heightM: 0.8, spreadM: 0.15, habit: 'grass', rootM: 1, cycleDays: 110, feeder: 'medium', family: 'grass', tempC: [3, 22], frostOk: true, waterMm: 400, drought: 'medium', waterlog: 'low', shade: 'low', wetOk: false, food: true }),
  oats: T({ heightM: 1, spreadM: 0.15, habit: 'grass', rootM: 1, cycleDays: 110, feeder: 'medium', family: 'grass', tempC: [3, 22], frostOk: true, waterMm: 400, drought: 'medium', waterlog: 'medium', shade: 'low', wetOk: true, food: true }),
  potato: T({ heightM: 0.6, spreadM: 0.6, habit: 'bush', rootM: 0.5, cycleDays: 110, feeder: 'heavy', family: 'nightshade', tempC: [9, 22], waterMm: 500, drought: 'low', waterlog: 'low', shade: 'low', wetOk: true, food: true }),
  sugarcane: T({ heightM: 3.5, spreadM: 1, habit: 'erect', rootM: 1.2, cycleDays: 365, perennial: true, feeder: 'heavy', family: 'grass', tempC: [20, 35], waterMm: 1600, drought: 'medium', waterlog: 'medium', shade: 'low', wetOk: true, food: true }),
  cotton: T({ heightM: 1.3, spreadM: 0.8, habit: 'bush', rootM: 1.5, cycleDays: 170, feeder: 'heavy', family: 'mallow', tempC: [20, 34], waterMm: 700, drought: 'high', waterlog: 'low', shade: 'low', wetOk: false, food: true }),
  sunflower: T({ heightM: 2, spreadM: 0.5, habit: 'erect', rootM: 1.5, cycleDays: 110, feeder: 'medium', family: 'daisy', tempC: [15, 32], waterMm: 500, drought: 'high', waterlog: 'low', shade: 'low', wetOk: false, food: true }),
  alfalfa: T({ heightM: 0.8, spreadM: 0.4, habit: 'bush', rootM: 2.5, cycleDays: 365, perennial: true, nFix: true, feeder: 'light', family: 'legume', tempC: [8, 30], frostOk: true, waterMm: 900, drought: 'high', waterlog: 'low', shade: 'low', wetOk: false, food: false }),
  clover: T({ heightM: 0.3, spreadM: 0.4, habit: 'creeper', rootM: 0.5, cycleDays: 150, nFix: true, feeder: 'light', family: 'legume', tempC: [5, 26], frostOk: true, waterMm: 400, drought: 'low', waterlog: 'medium', shade: 'medium', wetOk: true, food: false }),
  vetch: T({ heightM: 0.8, spreadM: 0.5, habit: 'climber', rootM: 0.7, cycleDays: 150, nFix: true, feeder: 'light', family: 'legume', tempC: [3, 24], frostOk: true, waterMm: 300, drought: 'medium', waterlog: 'low', shade: 'medium', wetOk: true, food: false }),
  rye: T({ heightM: 1.3, spreadM: 0.15, habit: 'grass', rootM: 1.5, cycleDays: 180, feeder: 'light', family: 'grass', tempC: [0, 22], frostOk: true, waterMm: 350, drought: 'medium', waterlog: 'medium', shade: 'low', wetOk: true, food: false }),
  radish: T({ heightM: 0.5, spreadM: 0.4, habit: 'bush', rootM: 1.5, cycleDays: 70, feeder: 'medium', family: 'mustard', tempC: [5, 25], frostOk: true, waterMm: 250, drought: 'medium', waterlog: 'low', shade: 'low', wetOk: true, food: false }),
  pasture: T({ heightM: 0.6, spreadM: 0.3, habit: 'grass', rootM: 1, cycleDays: 365, perennial: true, feeder: 'medium', family: 'grass', tempC: [5, 32], frostOk: true, waterMm: 700, drought: 'medium', waterlog: 'medium', shade: 'medium', wetOk: true, food: false }),
  'forage-peanut': T({ heightM: 0.2, spreadM: 0.8, habit: 'creeper', rootM: 0.5, cycleDays: 365, perennial: true, nFix: true, feeder: 'light', family: 'legume', tempC: [18, 32], waterMm: 1000, drought: 'medium', waterlog: 'medium', shade: 'high', wetOk: true, food: false }),
};

/** Cultivos con rasgos conocidos (los que el planificador puede combinar). */
export const PLANNER_CROPS = Object.keys(TRAITS) as CropId[];

export function traitsOf(c: CropId): CropTraits | null {
  return TRAITS[c] ?? null;
}

// ---------------------------------------------------------------- pisos (alturas) y profundidades

/** Pisos de altura: suelo ≤ 0,6 m · bajo ≤ 1,5 m · medio ≤ 3 m · alto ≤ 7 m · dosel > 7 m. */
export const STRATA = ['ground', 'low', 'mid', 'high', 'canopy'] as const;
export type Stratum = (typeof STRATA)[number];
export const STRATUM_TOP: Record<Stratum, number> = { ground: 0.6, low: 1.5, mid: 3, high: 7, canopy: Infinity };

export function stratumOf(heightM: number): Stratum {
  return STRATA.find((s) => heightM <= STRATUM_TOP[s]) ?? 'canopy';
}

/** Profundidad de raíces: poco profundas ≤ 0,6 m · medias ≤ 1,2 m · profundas > 1,2 m. */
export const ROOT_LAYERS = ['shallow', 'mid', 'deep'] as const;
export type RootLayer = (typeof ROOT_LAYERS)[number];

export function rootLayerOf(rootM: number): RootLayer {
  return rootM <= 0.6 ? 'shallow' : rootM <= 1.2 ? 'mid' : 'deep';
}

/** Ciclo: corto < 100 días · medio < 200 · largo (o perenne). */
export type CycleClass = 'short' | 'medium' | 'long';
export function cycleClassOf(t: CropTraits): CycleClass {
  if (t.perennial || t.cycleDays >= 200) return 'long';
  return t.cycleDays < 100 ? 'short' : 'medium';
}

/** Meses que ocupa en el terreno (perennes: 12). */
export function cycleMonths(t: CropTraits): number {
  return t.perennial ? 12 : Math.min(12, Math.max(2, Math.round(t.cycleDays / 30)));
}

/** Planta que puede servir de tutor a un trepador: erguida o árbol y de al menos 1,5 m. */
export function canSupport(t: CropTraits): boolean {
  return t.habit !== 'climber' && t.habit !== 'creeper' && t.heightM >= 1.5;
}

/** Cubre el suelo: rastrera o baja y ancha. */
export function coversGround(t: CropTraits): boolean {
  return t.habit === 'creeper' || (t.heightM <= 0.6 && t.spreadM >= 0.8);
}
