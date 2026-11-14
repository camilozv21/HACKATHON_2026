import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl';

export const HAZARD_SOURCE = 'hazard-events';
export const HAZARD_LAYER = 'hazard-events';

/**
 * Eventos bajo un toque (con margen: el dedo es más grande que el punto).
 * La región no se abre si el toque cae sobre un evento.
 */
export function hazardHits(map: MapLibreMap, point: { x: number; y: number }, r = 14): MapGeoJSONFeature[] {
  if (!map.getLayer(HAZARD_LAYER)) return [];
  const box: [PointLike, PointLike] = [
    [point.x - r, point.y - r],
    [point.x + r, point.y + r],
  ];
  return map.queryRenderedFeatures(box, { layers: [HAZARD_LAYER] });
}
