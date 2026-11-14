/**
 * Calendario social de una rotación: jornales por mes, meses con comida de la finca y meses con algo que vender.
 * Valores típicos de referencia (ver docs/rotation-outlook.md): cambian con la variedad, la pendiente, el
 * manejo y la maquinaria. El mock lo dice siempre en `assumptions`.
 */
import { CROPS, rotationRows, seasonMonths } from '@/features/field/crops';
import { traitsOf } from '@/features/rotations/mixed/traits';
import type { CropId, CropSeason } from '@/lib/api/contract';

/**
 * Jornales (días de trabajo de una persona) por hectárea en un ciclo, con herramientas de mano o tracción animal.
 * Perennes: por año con la planta ya produciendo. Coberturas: sembrar y cortar.
 * Con fuente colombiana (references.ts): maíz, papa, yuca, plátano, café, caña panelera y hortalizas (DANE 2011,
 * coeficientes de 2005), fríjol y yuca (UPRA 2023, rango por región). Los demás son valores típicos sin fuente local.
 */
export const LABOR_DAYS: Record<CropId, number> = {
  maize: 40,
  soybean: 30,
  wheat: 30,
  rice: 60,
  coffee: 150,
  beans: 80,
  sorghum: 35,
  millet: 45,
  cowpea: 50,
  groundnut: 70,
  chickpea: 40,
  mungbean: 45,
  barley: 30,
  oats: 25,
  potato: 105,
  cassava: 75,
  plantain: 108,
  sugarcane: 200,
  cotton: 70,
  sunflower: 30,
  alfalfa: 30,
  clover: 6,
  vetch: 6,
  rye: 6,
  radish: 6,
  pasture: 15,
  'forage-peanut': 8,
  'shade-trees': 10,
  vegetables: 150,
  squash: 50,
  pigeonpea: 40,
  fallow: 0,
};

/** Jornales extra para establecer un perenne nuevo (hoyado, siembra, resiembra), una sola vez. */
export const ESTABLISH_DAYS: Partial<Record<CropId, number>> = {
  coffee: 90,
  plantain: 45,
  sugarcane: 50,
  'shade-trees': 25,
  'forage-peanut': 12,
  pasture: 10,
  alfalfa: 10,
};

/** Años desde la siembra hasta la primera cosecha que deja ingreso (perennes). */
export const YEARS_TO_HARVEST: Partial<Record<CropId, number>> = { coffee: 2, plantain: 1, sugarcane: 1 };

/** Con tractor o sembradora, los granos extensivos piden mucho menos trabajo a mano. */
const MECHANIZABLE = new Set<CropId>(['maize', 'soybean', 'wheat', 'rice', 'sorghum', 'barley', 'oats', 'sunflower', 'cotton']);

/** Lo que no se come en la casa (se vende o es cobertura, sombra o forraje). */
const NOT_HOME_FOOD = new Set<CropId>(['coffee', 'cotton', 'sugarcane', 'soybean', 'sunflower', 'shade-trees']);

/** Meses que dura lo cosechado (seco y guardado, en la mata o fresco). */
const STORE_MONTHS: Partial<Record<CropId, number>> = {
  maize: 6,
  rice: 6,
  wheat: 6,
  barley: 6,
  oats: 6,
  sorghum: 6,
  millet: 6,
  beans: 6,
  cowpea: 6,
  groundnut: 6,
  chickpea: 6,
  mungbean: 6,
  pigeonpea: 6,
  potato: 3,
  cassava: 4,
  squash: 3,
  vegetables: 2,
};

/** Café de la zona central de Colombia: cosecha principal oct–dic y mitaca abr–may. */
const COFFEE_HARVEST = [10, 11, 12, 4, 5];

const isPerennial = (s: CropSeason) => s.role === 'perennial' || Boolean(traitsOf(s.crop)?.perennial);
const fullYear = (s: CropSeason) => seasonMonths(s).length >= 12;

export function cycleYearsOf(durationMonths: number) {
  return Math.min(3, Math.max(1, Math.round(durationMonths / 12)));
}

/** Temporadas que caen en cada año del ciclo (una temporada que cruza el año cuenta en el año en que se siembra). */
function seasonsByYear(seasons: CropSeason[], years: number) {
  return Array.from({ length: years }, (_, i) => seasons.filter((s) => ((s.year ?? 1) - 1) % years === i));
}

/**
 * Jornales por hectárea en cada mes de cada año del ciclo. Anual: 30 % al sembrar, 20 % en el deshierbe,
 * 40 % en la cosecha y el resto repartido. Cobertura: 70 % al sembrar y 30 % al cortarla. Perenne: 45 % parejo en el
 * año y 55 % en la cosecha (café: oct–dic y abr–may).
 */
export function laborRows(seasons: CropSeason[], years: number, mechanized: boolean): number[][] {
  const rows = Array.from({ length: years }, () => Array<number>(12).fill(0));
  const byYear = seasonsByYear(seasons, years);
  byYear.forEach((list, y) => {
    for (const s of list) {
      if (s.role === 'fallow') continue;
      let total = LABOR_DAYS[s.crop] * (mechanized && MECHANIZABLE.has(s.crop) ? 0.4 : 1);
      if (s.role === 'intercrop') total *= 0.7;
      const months = seasonMonths(s);
      const add = (m: number, v: number, yearOffset = 0) => {
        rows[(y + yearOffset) % years]![m - 1]! += v;
      };
      // Mes calendario → año del ciclo en que cae (las temporadas que cruzan diciembre siguen en el año siguiente).
      const placed = months.map((m, i) => ({ m, off: i > 0 && m < months[0]! ? 1 : 0 }));
      if (isPerennial(s) && fullYear(s)) {
        const harvest = s.crop === 'coffee' ? COFFEE_HARVEST : s.crop === 'shade-trees' ? [1, 7] : [];
        const flat = harvest.length ? total * 0.45 : total;
        for (let m = 1; m <= 12; m++) add(m, flat / 12);
        harvest.forEach((m) => add(m, (total - flat) / harvest.length));
        continue;
      }
      if (s.role === 'cover' || CROPS[s.crop].family === 'cover') {
        total = Math.min(total, 8);
        add(placed[0]!.m, total * 0.7, placed[0]!.off);
        add(placed.at(-1)!.m, total * 0.3, placed.at(-1)!.off);
        continue;
      }
      if (placed.length === 1) {
        add(placed[0]!.m, total);
        continue;
      }
      if (placed.length === 2) {
        add(placed[0]!.m, total * 0.5, placed[0]!.off);
        add(placed[1]!.m, total * 0.5, placed[1]!.off);
        continue;
      }
      const middle = placed.slice(2, -1);
      add(placed[0]!.m, total * 0.3, placed[0]!.off);
      add(placed[1]!.m, total * 0.2, placed[1]!.off);
      add(placed.at(-1)!.m, total * (middle.length ? 0.4 : 0.5), placed.at(-1)!.off);
      middle.forEach((p) => add(p.m, (total * 0.1) / middle.length, p.off));
    }
  });
  return rows;
}

/** Promedio de los años del ciclo: un año típico con la rotación andando. */
export function averageRow(rows: number[][]): number[] {
  return Array.from({ length: 12 }, (_, m) => rows.reduce((a, r) => a + r[m]!, 0) / rows.length);
}

/** Cosechas del ciclo: mes y cultivo (para comida y ventas). Perenne de todo el año: según el cultivo. */
function harvests(seasons: CropSeason[]): { crop: CropId; months: number[] }[] {
  const out: { crop: CropId; months: number[] }[] = [];
  for (const s of seasons) {
    if (s.role === 'fallow' || s.role === 'cover') continue;
    if (isPerennial(s) && fullYear(s)) {
      if (s.crop === 'coffee') out.push({ crop: s.crop, months: COFFEE_HARVEST });
      else if (s.crop === 'plantain' || s.crop === 'sugarcane') out.push({ crop: s.crop, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
      continue;
    }
    out.push({ crop: s.crop, months: [s.endMonth] });
  }
  return out;
}

/** Meses con comida de la finca para la casa: lo cosechado dura según se guarde (granos secos ~6 meses). */
export function foodCalendar(seasons: CropSeason[]) {
  const months = Array<boolean>(12).fill(false);
  const crops = new Set<CropId>();
  for (const h of harvests(seasons)) {
    const tr = traitsOf(h.crop);
    if (NOT_HOME_FOOD.has(h.crop) || (tr && !tr.food && h.crop !== 'vegetables')) continue;
    if (h.crop === 'pasture' || h.crop === 'alfalfa') continue;
    crops.add(h.crop);
    const keep = STORE_MONTHS[h.crop] ?? 1;
    for (const m of h.months) for (let i = 0; i < keep; i++) months[(m - 1 + i) % 12] = true;
  }
  const families = new Set([...crops].map((c) => traitsOf(c)?.family ?? c));
  const gapMonths = months.flatMap((v, i) => (v ? [] : [i + 1]));
  return { months, gapMonths, crops: [...crops], families: families.size };
}

/** Meses con algo que vender: cosechas (café, plátano y caña casi todo el año) y leche si hay pasto y se vende ganado. */
export function cashCalendar(seasons: CropSeason[], markets: string[]) {
  const months = Array<boolean>(12).fill(false);
  for (const h of harvests(seasons)) {
    if (h.crop === 'pasture' || h.crop === 'shade-trees') continue;
    for (const m of h.months) months[m - 1] = true;
  }
  const grazing = seasons.some((s) => s.role === 'forage' || s.crop === 'pasture' || s.crop === 'alfalfa');
  if (grazing && markets.includes('livestock')) months.fill(true);
  return { months };
}

/** Cultivo de cada mes en cada año del ciclo (para la franja de años). */
export function monthRows(seasons: CropSeason[], years: number): (CropId | null)[][] {
  return rotationRows(seasons, years).map((row) => row.map((s) => s?.crop ?? null));
}

/** Cultivos de la rotación (sin descanso). */
export function cropsOf(seasons: CropSeason[]): CropId[] {
  return [...new Set(seasons.filter((s) => s.role !== 'fallow').map((s) => s.crop))];
}

/** Perennes que se cosechan o dan sombra (los que se tardan en establecer). */
export function perennialsOf(seasons: CropSeason[]): CropId[] {
  return [...new Set(seasons.filter((s) => isPerennial(s) && s.role !== 'cover').map((s) => s.crop))];
}

/** Coberturas (incluidas las vivas bajo un perenne). */
export function coversOf(seasons: CropSeason[]): CropId[] {
  return [...new Set(seasons.filter((s) => s.role === 'cover' || CROPS[s.crop].family === 'cover').map((s) => s.crop))];
}

/** Lo que se vende o se come (no coberturas, sombra ni descanso). */
export function harvestedOf(seasons: CropSeason[]): CropId[] {
  return [
    ...new Set(
      seasons
        .filter((s) => s.role === 'cash' || s.role === 'perennial' || s.role === 'intercrop')
        .map((s) => s.crop)
        .filter((c) => c !== 'shade-trees' && c !== 'fallow'),
    ),
  ];
}
