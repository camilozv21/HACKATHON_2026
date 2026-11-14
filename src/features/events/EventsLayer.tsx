'use client';

import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useEffect } from 'react';
import { useFieldStore } from '@/features/field/store';
import { useGlobeStore } from '@/features/globe/store';
import { useTimeStore } from '@/features/time/store';
import { EventsResponse, type HazardEvent } from '@/lib/api/contract';
import { listingHits } from '@/features/listings/hit';
import { HAZARD_LAYER, HAZARD_SOURCE, hazardHits } from './hit';
import { GROUP_COLOR, KIND_GROUP } from './kinds';
import { useEventsStore, visibleEvents } from './store';
import { eventWindow } from './window';

const SELECTED = 'hazard-selected';
const GLOW = 'hazard-events-glow';

const color: ExpressionSpecification = [
  'match',
  ['get', 'group'],
  'water',
  GROUP_COLOR.water,
  'earth',
  GROUP_COLOR.earth,
  'fire',
  GROUP_COLOR.fire,
  GROUP_COLOR.other,
];
const isCommunity: ExpressionSpecification = ['==', ['get', 'source'], 'community'];

function toGeoJSON(events: HazardEvent[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: { id: e.id, kind: e.kind, source: e.source, group: KIND_GROUP[e.kind] },
    })),
  };
}

function ensureLayers(map: MapLibreMap) {
  if (map.getSource(HAZARD_SOURCE)) return;
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  map.addSource(HAZARD_SOURCE, { type: 'geojson', data: empty });
  map.addSource(SELECTED, { type: 'geojson', data: empty });
  // Brillo suave (puntos luminosos sobre el globo oscuro); estático, sin animación por frame.
  map.addLayer({
    id: GLOW,
    type: 'circle',
    source: HAZARD_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 6, 9, 11, 14],
      'circle-color': color,
      'circle-opacity': 0.22,
      'circle-blur': 0.8,
    },
  });
  map.addLayer({
    id: HAZARD_LAYER,
    type: 'circle',
    source: HAZARD_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.6, 5, 4, 9, 6.5, 13, 8],
      // Relleno = oficial o satélite; anillo = reporte de la comunidad (no depende solo del color).
      'circle-color': ['case', isCommunity, '#0a0f1c', color],
      'circle-stroke-color': ['case', isCommunity, color, ['==', ['get', 'source'], 'eonet'], 'rgba(255,255,255,0.85)', 'rgba(5,7,13,0.9)'],
      'circle-stroke-width': ['case', isCommunity, 2.5, 1],
    },
  });
  map.addLayer({
    id: SELECTED,
    type: 'circle',
    source: SELECTED,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 9, 9, 13],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
}

function removeLayers(map: MapLibreMap) {
  for (const id of [SELECTED, HAZARD_LAYER, GLOW]) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of [SELECTED, HAZARD_SOURCE]) if (map.getSource(id)) map.removeSource(id);
}

/** Pide los eventos del periodo (presente o máquina del tiempo) y los dibuja en el globo. */
export function EventsLayer() {
  const map = useGlobeStore((s) => s.map);
  const sel = useTimeStore((s) => s.sel);
  const nonce = useEventsStore((s) => s.nonce);

  // Datos del periodo.
  useEffect(() => {
    const w = eventWindow(sel);
    const { data, setData } = useEventsStore.getState();
    if (data && data.from === w.from && useEventsStore.getState().status === 'ready') return;
    const ctrl = new AbortController();
    setData(data, 'loading');
    fetch(`/api/events?from=${w.from}&to=${w.to}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return EventsResponse.parse(await r.json());
      })
      .then((d) => useEventsStore.getState().setData(d, 'ready'))
      .catch(() => {
        if (!ctrl.signal.aborted) useEventsStore.getState().setData(null, 'error');
      });
    return () => ctrl.abort();
  }, [sel, nonce]);

  // Capa del mapa: se actualiza solo cuando cambian los datos o los filtros (nunca por frame).
  useEffect(() => {
    if (!map) return;
    ensureLayers(map);
    const byId = new Map<string, HazardEvent>();
    const draw = () => {
      const s = useEventsStore.getState();
      const events = visibleEvents(s);
      byId.clear();
      for (const e of events) byId.set(e.id, e);
      (map.getSource(HAZARD_SOURCE) as GeoJSONSource | undefined)?.setData(toGeoJSON(events));
    };
    const drawSelected = () => {
      const sel = useEventsStore.getState().selected;
      (map.getSource(SELECTED) as GeoJSONSource | undefined)?.setData(toGeoJSON(sel?.slice(0, 1) ?? []));
    };
    draw();
    drawSelected();
    const unsub = useEventsStore.subscribe((s, prev) => {
      if (s.data !== prev.data || s.mine !== prev.mine || s.kind !== prev.kind || s.hiddenSources !== prev.hiddenSources) draw();
      if (s.selected !== prev.selected) drawSelected();
    });

    const onClick = (e: MapMouseEvent) => {
      if (useFieldStore.getState().mode !== 'idle' || useEventsStore.getState().picking) return;
      // Una finca que vende está por encima de los eventos: su tarjeta gana el toque.
      if (listingHits(map, e.point).length) return;
      const hits = hazardHits(map, e.point);
      if (!hits.length) return;
      const ids = [...new Set(hits.map((f) => String(f.properties?.id)))];
      const events = ids
        .map((id) => byId.get(id))
        .filter((x): x is HazardEvent => Boolean(x))
        .sort((a, b) => b.date.localeCompare(a.date));
      if (events.length) useEventsStore.getState().select(events);
    };
    const canvas = map.getCanvas();
    const enter = () => (canvas.style.cursor = 'pointer');
    const leave = () => (canvas.style.cursor = '');
    map.on('click', onClick);
    map.on('mouseenter', HAZARD_LAYER, enter);
    map.on('mouseleave', HAZARD_LAYER, leave);
    return () => {
      unsub();
      map.off('click', onClick);
      map.off('mouseenter', HAZARD_LAYER, enter);
      map.off('mouseleave', HAZARD_LAYER, leave);
      canvas.style.cursor = '';
      removeLayers(map);
    };
  }, [map]);

  return null;
}
