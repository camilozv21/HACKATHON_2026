import type { HazardKind } from '@/lib/api/contract';

/**
 * En el globo el color dice el grupo de riesgo (3 grupos + gris) y la forma dice la fuente:
 * relleno = oficial o satélite, anillo = reporte de la comunidad sin verificar.
 * Paleta validada sobre el globo oscuro (todos los pares, también con daltonismo): azul, ámbar, magenta.
 * Nunca solo color: la leyenda, la lista y el detalle siempre dicen el tipo con texto e ícono.
 */
export type HazardGroup = 'water' | 'earth' | 'fire' | 'other';

export const GROUP_COLOR: Record<HazardGroup, string> = {
  water: '#3987e5',
  earth: '#c98500',
  fire: '#d55181',
  other: '#8b97ab',
};

export const KIND_GROUP: Record<HazardKind, HazardGroup> = {
  flood: 'water',
  storm: 'water',
  landslide: 'earth',
  erosion: 'earth',
  earthquake: 'earth',
  volcano: 'earth',
  wildfire: 'fire',
  drought: 'fire',
  frost: 'other',
  other: 'other',
};

export const GROUPS: HazardGroup[] = ['water', 'earth', 'fire', 'other'];

/** Tipos que la comunidad puede reportar (los sismos y volcanes los registran las entidades). */
export const REPORTABLE: HazardKind[] = ['landslide', 'flood', 'storm', 'wildfire', 'drought', 'frost', 'erosion', 'other'];
