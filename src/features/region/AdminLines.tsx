'use client';

import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect } from 'react';
import { isAutoRotateEvent } from '@/features/globe/autoRotate';
import { getDeviceProfile } from '@/features/globe/perf';
import { useGlobeStore } from '@/features/globe/store';
import { ADMIN_CO_LINES, firstOverlayId, MPIO_LINE_PAINT } from '@/features/globe/style';
import { ADMIN_ATTRIBUTION, CO_BBOX, loadAdmin, type AdminIndex } from './admin';

const SRC = 'admin-co';

/** ¿Colombia está (al menos en parte) en pantalla? */
function viewTouchesColombia(map: MapLibreMap) {
  const b = map.getBounds();
  const [w, s, e, n] = CO_BBOX;
  return !(b.getEast() < w || b.getWest() > e || b.getNorth() < s || b.getSouth() > n);
}

function addLines(map: MapLibreMap, index: AdminIndex) {
  if (!index.lines || map.getSource(SRC)) return;
  map.addSource(SRC, {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: index.lines },
    // La capa solo se ve hasta zoom 9: no hace falta teselar más fino.
    maxzoom: 9,
    attribution: ADMIN_ATTRIBUTION,
  });
  map.addLayer(
    {
      id: ADMIN_CO_LINES,
      type: 'line',
      source: SRC,
      minzoom: 5.5,
      // Desde zoom 9 las teselas OSM traen los municipios (labels-admin2, mismo trazo).
      maxzoom: 9,
      layout: {
        visibility: useGlobeStore.getState().showBoundaries ? 'visible' : 'none',
        'line-join': 'round',
      },
      paint: { ...MPIO_LINE_PAINT, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 6.5, 1] },
    },
    firstOverlayId(map, ADMIN_CO_LINES),
  );
}

/**
 * Límites de Colombia bajo demanda: al mirar Colombia se precargan los departamentos (28 KB) y, al acercarse,
 * los municipios (~220 KB), que además pintan las líneas entre municipios antes de zoom 9. Con ahorro de datos
 * no se precarga nada: los límites llegan solo si la persona toca Colombia.
 */
export function AdminLines() {
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');

  useEffect(() => {
    if (!map || !ready || getDeviceProfile().saveData) return;
    let alive = true;
    const check = () => {
      const zoom = map.getZoom();
      if (zoom < 3 || !viewTouchesColombia(map)) return;
      void loadAdmin('dpto').catch(() => undefined);
      if (zoom >= 5) {
        void loadAdmin('mpio')
          .then((index) => alive && addLines(map, index))
          .catch(() => undefined);
      }
    };
    const onMoveEnd = (e: object) => {
      if (!isAutoRotateEvent(e)) check();
    };
    check();
    map.on('moveend', onMoveEnd);
    return () => {
      alive = false;
      map.off('moveend', onMoveEnd);
    };
  }, [map, ready]);

  return null;
}
