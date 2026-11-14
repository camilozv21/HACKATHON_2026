import type { HazardKind } from '@/lib/api/contract';

/** Quita tildes y espacios dobles, en mayúsculas: "Inundación " → "INUNDACION". */
export const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/**
 * Eventos UNGRD que importan para el campo (naturales y de clima). Los demás (incendio estructural, accidentes,
 * colapsos, inmersión, explosiones…) no se muestran: no son riesgos agroclimáticos.
 */
const UNGRD: Record<string, HazardKind> = {
  'MOVIMIENTO EN MASA': 'landslide',
  INUNDACION: 'flood',
  'CRECIENTE SUBITA': 'flood',
  'AVENIDA TORRENCIAL': 'flood',
  LLUVIAS: 'flood',
  TEMPORAL: 'storm',
  VENDAVAL: 'storm',
  GRANIZADA: 'storm',
  'TORMENTA ELECTRICA': 'storm',
  'CICLON TROPICAL: DEPRESION/TORMENTA/HURACAN': 'storm',
  'ONDA TROPICAL': 'storm',
  'INCENDIO DE COBERTURA VEGETAL': 'wildfire',
  'INCENDIO FORESTAL': 'wildfire',
  SEQUIA: 'drought',
  'DESABASTECIMIENTO DE AGUA': 'drought',
  RACIONAMIENTO: 'drought',
  HELADA: 'frost',
  EROSION: 'erosion',
  'EROSION COSTERA': 'erosion',
  SISMO: 'earthquake',
  'ACTIVIDAD VOLCANICA': 'volcano',
  'ACTIVACION VOLCANICA': 'volcano',
};

/** null = no es un evento agroclimático (no se muestra). */
export function ungrdKind(evento: string): HazardKind | null {
  return UNGRD[normalizeName(evento)] ?? null;
}

const EONET: Record<string, HazardKind | null> = {
  landslides: 'landslide',
  floods: 'flood',
  severeStorms: 'storm',
  wildfires: 'wildfire',
  drought: 'drought',
  earthquakes: 'earthquake',
  volcanoes: 'volcano',
  tempExtremes: 'other',
  dustHaze: 'other',
  snow: 'other',
  // Hielo marino, color del agua y eventos humanos no son riesgos para una finca.
  seaLakeIce: null,
  waterColor: null,
  manmade: null,
};

export function eonetKind(categoryIds: string[]): HazardKind | null {
  for (const c of categoryIds) {
    const k = EONET[c];
    if (k) return k;
  }
  return null;
}

/** Categorías EONET que pedimos aparte de los incendios (que son la gran mayoría). */
export const EONET_NON_FIRE = ['floods', 'severeStorms', 'volcanoes', 'landslides', 'drought', 'earthquakes', 'tempExtremes', 'dustHaze', 'snow'];
