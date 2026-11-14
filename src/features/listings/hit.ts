import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl';

export const LISTING_SOURCE = 'listings';
export const LISTING_LAYER = 'listings';

/** Fincas bajo un toque (con margen para el dedo). La región y los eventos no se abren si el toque cae aquí. */
export function listingHits(map: MapLibreMap, point: { x: number; y: number }, r = 14): MapGeoJSONFeature[] {
  if (!map.getLayer(LISTING_LAYER)) return [];
  const box: [PointLike, PointLike] = [
    [point.x - r, point.y - r],
    [point.x + r, point.y + r],
  ];
  return map.queryRenderedFeatures(box, { layers: [LISTING_LAYER] });
}
