'use client';

import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useEffect } from 'react';
import { useFieldStore } from '@/features/field/store';
import { useGlobeStore } from '@/features/globe/store';
import { ListingsResponse, listingsUrl } from '@/lib/api/listings';
import { LISTING_LAYER, LISTING_SOURCE, listingHits } from './hit';
import { useListingsStore, type ListingPoint } from './store';

const GLOW = 'listings-glow';
const SELECTED = 'listings-selected';
// Verde de la marca (fincas) con anillo claro: distinto de los eventos (rojo/azul/naranja) también en forma.
const FILL = '#4ade80';

function toGeoJSON(points: ListingPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, sample: Boolean(p.sample) },
    })),
  };
}

function ensureLayers(map: MapLibreMap) {
  if (map.getSource(LISTING_SOURCE)) return;
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  map.addSource(LISTING_SOURCE, { type: 'geojson', data: empty });
  map.addSource(SELECTED, { type: 'geojson', data: empty });
  map.addLayer({
    id: GLOW,
    type: 'circle',
    source: LISTING_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 6, 6, 11, 11, 16],
      'circle-color': FILL,
      'circle-opacity': 0.25,
      'circle-blur': 0.8,
    },
  });
  map.addLayer({
    id: LISTING_LAYER,
    type: 'circle',
    source: LISTING_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3.2, 5, 5, 9, 7.5, 13, 9],
      // Los ejemplos van huecos (anillo), las publicaciones reales rellenas: no depende solo del color.
      'circle-color': ['case', ['get', 'sample'], '#05070d', FILL],
      'circle-stroke-color': ['case', ['get', 'sample'], FILL, 'rgba(255,255,255,0.9)'],
      'circle-stroke-width': ['case', ['get', 'sample'], 2.5, 1.5],
    },
  });
  map.addLayer({
    id: SELECTED,
    type: 'circle',
    source: SELECTED,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 10, 9, 14],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
}

function removeLayers(map: MapLibreMap) {
  for (const id of [SELECTED, LISTING_LAYER, GLOW]) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of [SELECTED, LISTING_SOURCE]) if (map.getSource(id)) map.removeSource(id);
}

/** Pide las fincas que venden (Colombia) y las dibuja en el globo; tocar una abre su tarjeta. */
export function ListingsLayer() {
  const map = useGlobeStore((s) => s.map);
  const nonce = useListingsStore((s) => s.nonce);

  useEffect(() => {
    const ctrl = new AbortController();
    const { points, setPoints } = useListingsStore.getState();
    setPoints(points, 'loading');
    fetch(listingsUrl({ limit: 200 }), { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return ListingsResponse.parse(await r.json());
      })
      .then((d) =>
        useListingsStore.getState().setPoints(
          d.listings.map((l) => ({ id: l.id, lat: l.lat, lon: l.lon, farmName: l.farmName, place: l.place, products: l.products, sample: l.sample })),
          'ready',
        ),
      )
      .catch(() => {
        if (!ctrl.signal.aborted) useListingsStore.getState().setPoints([], 'error');
      });
    return () => ctrl.abort();
  }, [nonce]);

  useEffect(() => {
    if (!map) return;
    ensureLayers(map);
    const draw = () => (map.getSource(LISTING_SOURCE) as GeoJSONSource | undefined)?.setData(toGeoJSON(useListingsStore.getState().points));
    const drawSelected = () => {
      const { points, selectedId } = useListingsStore.getState();
      (map.getSource(SELECTED) as GeoJSONSource | undefined)?.setData(toGeoJSON(points.filter((p) => p.id === selectedId)));
    };
    draw();
    drawSelected();
    const unsub = useListingsStore.subscribe((s, prev) => {
      if (s.points !== prev.points) {
        draw();
        drawSelected();
      } else if (s.selectedId !== prev.selectedId) drawSelected();
    });
    const onClick = (e: MapMouseEvent) => {
      if (useFieldStore.getState().mode !== 'idle') return;
      const hit = listingHits(map, e.point)[0];
      if (hit) useListingsStore.getState().select(String(hit.properties?.id));
    };
    const canvas = map.getCanvas();
    const enter = () => (canvas.style.cursor = 'pointer');
    const leave = () => (canvas.style.cursor = '');
    map.on('click', onClick);
    map.on('mouseenter', LISTING_LAYER, enter);
    map.on('mouseleave', LISTING_LAYER, leave);
    return () => {
      unsub();
      map.off('click', onClick);
      map.off('mouseenter', LISTING_LAYER, enter);
      map.off('mouseleave', LISTING_LAYER, leave);
      canvas.style.cursor = '';
      removeLayers(map);
    };
  }, [map]);

  return null;
}
