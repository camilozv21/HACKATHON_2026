'use client';

import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useGlobeStore } from '@/features/globe/store';
import { useFieldStore } from './store';
import type { SelectedField } from './types';

const SRC = 'field';
export const FIELD_LAYERS = ['field-fill', 'field-glow', 'field-line', 'field-vertex'] as const;

function ensureLayers(map: MapLibreMap) {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'field-fill',
    type: 'fill',
    source: SRC,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#6ee39a', 'fill-opacity': 0.16 },
  });
  map.addLayer({
    id: 'field-glow',
    type: 'line',
    source: SRC,
    filter: ['==', ['geometry-type'], 'Polygon'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': '#9ff0b8', 'line-width': 12, 'line-blur': 9, 'line-opacity': 0.75 },
  });
  map.addLayer({
    id: 'field-line',
    type: 'line',
    source: SRC,
    filter: ['==', ['geometry-type'], 'Polygon'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': '#f2fff6', 'line-width': 2.2 },
  });
  map.addLayer({
    id: 'field-vertex',
    type: 'circle',
    source: SRC,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#3fcf78',
      'circle-stroke-width': 2,
    },
  });
}

function toGeoJSON(field: SelectedField | null): GeoJSON.FeatureCollection {
  if (!field || field.geometry.type !== 'Polygon') return { type: 'FeatureCollection', features: [] };
  const ring = field.geometry.coordinates[0]!;
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: field.geometry },
      ...ring.slice(0, -1).map((c) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: c },
      })),
    ],
  };
}

/** Dibuja la finca seleccionada: polígono con brillo, o pin luminoso con pulso (CSS). */
export function FieldOverlay() {
  const t = useTranslations('field');
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const field = useFieldStore((s) => s.field);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!map || !ready) return;
    let cancelled = false;

    const apply = () => {
      ensureLayers(map);
      (map.getSource(SRC) as GeoJSONSource).setData(toGeoJSON(field));
      // Mantener la finca por encima de capas añadidas después (etiquetas, datos NASA).
      for (const id of FIELD_LAYERS) if (map.getLayer(id)) map.moveLayer(id);
    };
    // Si el estilo aún carga, se aplica en el próximo idle; el cleanup quita ese listener para que un
    // render viejo (p. ej. sin finca) no sobrescriba al nuevo.
    const styleReady = map.isStyleLoaded();
    if (styleReady) apply();
    else map.once('idle', apply);

    (async () => {
      if (field?.geometry.type === 'Point') {
        const { Marker } = await import('maplibre-gl');
        if (cancelled) return;
        if (!markerRef.current) {
          const el = document.createElement('div');
          el.className = 'field-pin';
          el.setAttribute('role', 'img');
          el.innerHTML = '<span class="field-pin__glow"></span><span class="field-pin__dot"></span>';
          markerRef.current = new Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' });
        }
        markerRef.current.getElement().setAttribute('aria-label', t('pinLabel'));
        markerRef.current.setLngLat(field.geometry.coordinates).addTo(map);
      } else {
        markerRef.current?.remove();
      }
    })();

    return () => {
      cancelled = true;
      if (!styleReady) map.off('idle', apply);
    };
  }, [map, ready, field, t]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [map],
  );

  return null;
}
