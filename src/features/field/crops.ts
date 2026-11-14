import type { CropId, CropSeason } from '@/lib/api/contract';

export type CropFamily = 'cereal' | 'legume' | 'cover' | 'perennial' | 'tuber' | 'other' | 'fallow';
export type CropIcon = 'Wheat' | 'Bean' | 'Coffee' | 'Sprout' | 'Leaf' | 'Trees' | 'Carrot' | 'Flower2' | 'Cherry' | 'Citrus' | 'Circle';

/** Catálogo de cultivos: ícono grande, color para el calendario y familia (para explicar beneficios). */
export const CROPS: Record<CropId, { icon: CropIcon; color: string; family: CropFamily }> = {
  maize: { icon: 'Wheat', color: '#f4c542', family: 'cereal' },
  soybean: { icon: 'Bean', color: '#9bd36b', family: 'legume' },
  wheat: { icon: 'Wheat', color: '#e0b25a', family: 'cereal' },
  rice: { icon: 'Wheat', color: '#c7e07a', family: 'cereal' },
  coffee: { icon: 'Coffee', color: '#b07a52', family: 'perennial' },
  beans: { icon: 'Bean', color: '#c46b6b', family: 'legume' },
  sorghum: { icon: 'Wheat', color: '#d08a4a', family: 'cereal' },
  millet: { icon: 'Wheat', color: '#d9b26a', family: 'cereal' },
  cowpea: { icon: 'Bean', color: '#8fc27a', family: 'legume' },
  groundnut: { icon: 'Bean', color: '#c9a36b', family: 'legume' },
  chickpea: { icon: 'Bean', color: '#d6c48a', family: 'legume' },
  mungbean: { icon: 'Bean', color: '#6fbf73', family: 'legume' },
  barley: { icon: 'Wheat', color: '#d4c26a', family: 'cereal' },
  oats: { icon: 'Wheat', color: '#cfc79a', family: 'cover' },
  potato: { icon: 'Carrot', color: '#b89a6a', family: 'tuber' },
  cassava: { icon: 'Carrot', color: '#a8855a', family: 'tuber' },
  plantain: { icon: 'Leaf', color: '#7fbf5a', family: 'perennial' },
  sugarcane: { icon: 'Leaf', color: '#9fd06a', family: 'perennial' },
  cotton: { icon: 'Flower2', color: '#e8e4dc', family: 'other' },
  sunflower: { icon: 'Flower2', color: '#ffd23f', family: 'other' },
  alfalfa: { icon: 'Sprout', color: '#6fcf97', family: 'legume' },
  clover: { icon: 'Sprout', color: '#4fbf7f', family: 'cover' },
  vetch: { icon: 'Sprout', color: '#8a7fd6', family: 'cover' },
  rye: { icon: 'Wheat', color: '#a6c46a', family: 'cover' },
  radish: { icon: 'Carrot', color: '#d97fa0', family: 'cover' },
  pasture: { icon: 'Sprout', color: '#5fbf6f', family: 'other' },
  'forage-peanut': { icon: 'Sprout', color: '#5fd08a', family: 'cover' },
  'shade-trees': { icon: 'Trees', color: '#3f9f5f', family: 'perennial' },
  vegetables: { icon: 'Cherry', color: '#ef6f5f', family: 'other' },
  squash: { icon: 'Citrus', color: '#f0913a', family: 'other' },
  pigeonpea: { icon: 'Bean', color: '#b5a24a', family: 'legume' },
  fallow: { icon: 'Circle', color: '#7d8aa0', family: 'fallow' },
};

/** Meses (1–12) que cubre una temporada; si endMonth < startMonth cruza el año. */
export function seasonMonths(s: Pick<CropSeason, 'startMonth' | 'endMonth'>): number[] {
  const out: number[] = [];
  let m = s.startMonth;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === s.endMonth) break;
    m = (m % 12) + 1;
  }
  return out;
}

/** Cultivo activo en cada mes del año 1 de la rotación (null = suelo sin cultivo). */
export function monthCrops(seasons: CropSeason[], year = 1): (CropSeason | null)[] {
  const byMonth: (CropSeason | null)[] = Array(12).fill(null);
  // Primero cultivos principales y perennes; las coberturas/intercalados no tapan al principal.
  const order = [...seasons].sort((a, b) => rank(a) - rank(b));
  for (const s of order) {
    if ((s.year ?? 1) !== year || s.role === 'fallow') continue;
    for (const m of seasonMonths(s)) if (!byMonth[m - 1]) byMonth[m - 1] = s;
  }
  return byMonth;
}

function rank(s: CropSeason) {
  return s.role === 'cash' || s.role === 'perennial' ? 0 : s.role === 'forage' ? 1 : s.role === 'intercrop' ? 2 : 3;
}

/**
 * Rejilla de la rotación completa: una fila por año con el cultivo de cada mes. A diferencia de monthCrops,
 * una temporada que cruza el año (trigo de invierno oct → jul) sigue en la fila del año siguiente; la del último
 * año vuelve al año 1 porque la rotación se repite.
 */
export function rotationRows(seasons: CropSeason[], years: number): (CropSeason | null)[][] {
  const n = Math.max(1, years);
  const rows = Array.from({ length: n }, () => Array<CropSeason | null>(12).fill(null));
  const order = [...seasons].sort((a, b) => rank(a) - rank(b));
  for (const s of order) {
    if (s.role === 'fallow') continue;
    let y = (s.year ?? 1) - 1;
    let m = s.startMonth;
    for (let i = 0; i < 12; i++) {
      const row = rows[y % n]!;
      if (!row[m - 1]) row[m - 1] = s;
      if (m === s.endMonth) break;
      if (m === 12) y++;
      m = (m % 12) + 1;
    }
  }
  return rows;
}
