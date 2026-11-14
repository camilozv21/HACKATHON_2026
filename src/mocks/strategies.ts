/**
 * Rotaciones "de hoy" para el mock del backend:
 *  - las de las fincas demo (la historia de cada una),
 *  - la más común de cada zona agroclimática, cuando la persona no nos dio la suya (se avisa en dataGaps).
 * Las opciones nuevas y todos los puntajes los calcula el motor (src/mocks/engine/), no se escriben a mano.
 */
import type { CropId, CropSeason } from '@/lib/api/contract';
import type { Archetype } from './climateTemplates';
import { placeSystem } from './engine/place';
import { windows } from './engine/schedule';
import { evaluate } from './engine/score';
import type { Site, Zone } from './engine/site';
import type { Slot, SystemFlags, SystemTpl } from './engine/systems';

/** Mismo texto en todas las estrategias: src/mocks/farmerData.ts lo quita cuando llega un análisis de suelo. */
export { NO_SOIL_TEST } from './engine/recommend';

const S = (crop: CropSeason['crop'], startMonth: number, endMonth: number, extra: Partial<CropSeason> = {}) =>
  ({ crop, startMonth, endMonth, year: 1, role: 'cash', ...extra }) as CropSeason;

export type CurrentRotation = { seasons: CropSeason[]; durationMonths: 12 | 24 | 36; flags: SystemFlags };

/** Lo que hace hoy cada finca demo. */
export const DEMO_CURRENT: Record<Archetype, CurrentRotation> = {
  'tropical-highland': { seasons: [S('coffee', 1, 12, { role: 'perennial' })], durationMonths: 12, flags: {} },
  temperate: { seasons: [S('maize', 5, 10), S('soybean', 5, 10, { year: 2 })], durationMonths: 24, flags: {} },
  monsoon: {
    seasons: [S('rice', 6, 10), S('wheat', 11, 4), S('fallow', 5, 5, { role: 'fallow' })],
    durationMonths: 12,
    flags: { burn: true },
  },
  sahel: { seasons: [S('millet', 6, 10), S('fallow', 11, 5, { role: 'fallow' })], durationMonths: 12, flags: {} },
  pampa: { seasons: [S('soybean', 11, 4), S('fallow', 5, 10, { role: 'fallow' })], durationMonths: 12, flags: {} },
};

export function currentRotationFor(arch: Archetype): CropSeason[] {
  return DEMO_CURRENT[arch].seasons;
}

const one = (crop: CropId | CropId[], at: Slot['at'], role: CropSeason['role'] = 'cash', year: 1 | 2 | 3 = 1): Slot => ({ crop, role, at, year });

type Default = { years: 1 | 2; slots: Slot[] };

/** Rotación más común por zona (si la persona no nos contó la suya). */
const ZONE_DEFAULT: Record<Zone, Default> = {
  'tropical-highland': { years: 1, slots: [one('maize', 'main'), one('beans', 'second')] },
  'cold-highland': { years: 1, slots: [one(['potato', 'barley'], 'main')] },
  'humid-tropics': { years: 1, slots: [one('maize', 'main'), one('cassava', 'after')] },
  savanna: { years: 1, slots: [one('maize', 'main')] },
  'semi-arid': { years: 1, slots: [one(['maize', 'sorghum', 'millet'], 'main')] },
  arid: { years: 1, slots: [one(['sorghum', 'millet'], 'main')] },
  monsoon: { years: 1, slots: [one('rice', 'main'), one('wheat', 'cool')] },
  mediterranean: { years: 1, slots: [one(['wheat', 'barley'], 'cool')] },
  continental: { years: 2, slots: [one('maize', 'main', 'cash', 1), one('soybean', 'main', 'cash', 2)] },
  subtropical: { years: 1, slots: [one('soybean', 'main')] },
};

/** Si lo típico de la zona no se da con el clima de este punto, se prueba lo siguiente. */
const FALLBACKS: Default[] = [
  { years: 1, slots: [one(['maize', 'sorghum'], 'main')] },
  { years: 1, slots: [one(['potato', 'barley', 'oats'], 'main')] },
  { years: 1, slots: [one(['wheat', 'barley'], 'cool')] },
  { years: 1, slots: [one('pasture', 'all', 'forage')] },
];

export function defaultRotationFor(site: Site): CurrentRotation {
  // En la zona cafetera (18–23 °C de media, sobre los 1000 m) lo más común es el café.
  if (site.zone === 'tropical-highland' && site.tAnnual >= 18 && site.tAnnual <= 23 && (site.elevationM ?? 0) >= 1000)
    return { seasons: [S('coffee', 1, 12, { role: 'perennial' })], durationMonths: 12, flags: {} };
  const clim = { tMean: site.months.map((m) => m.t), precip: site.months.map((m) => m.p), frost: site.months.map((m) => m.frost) };
  const w = windows(site);
  // Trópico cálido con meses muy lluviosos: arroz de temporada (deltas y llanuras que se inundan).
  const paddy: Default | null =
    site.tAnnual >= 22 && site.wetMonths.length >= 2 && site.zone !== 'tropical-highland' ? { years: 1, slots: [one('rice', 'main')] } : null;

  for (const d of [paddy, ZONE_DEFAULT[site.zone], ...FALLBACKS]) {
    if (!d) continue;
    const tpl: SystemTpl = {
      id: 'default',
      kind: 'rotation',
      zones: [site.zone],
      years: d.years,
      slots: d.slots,
      name: { es: '', en: '' },
      rationale: { es: '', en: '' },
      benefits: [],
      risks: [],
      review: [],
    };
    const placed = placeSystem(tpl, site, w, clim, 'full');
    const ev = evaluate(placed.seasons, d.years * 12, { site, clim, irrigation: 'full', retention: 0.8, markets: [] });
    if (ev.fits.every((f) => f.season.role === 'fallow' || f.thermal >= 0.6)) {
      return { seasons: placed.seasons, durationMonths: (d.years * 12) as 12 | 24, flags: {} };
    }
  }
  return { seasons: [S('pasture', 1, 12, { role: 'forage' })], durationMonths: 12, flags: {} };
}
