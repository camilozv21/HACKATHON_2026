import type { Map as MapLibreMap } from 'maplibre-gl';
import { reverseGeocode } from '@/lib/geocoding';
import { isAutoRotateEvent } from './autoRotate';
import { useGlobeStore } from './store';

/**
 * Actualiza "lo que hay bajo la mira" solo al terminar un movimiento (moveend), nunca durante,
 * y pide el nombre del lugar con debounce. Ignora los pasos de la rotación automática.
 */
export function attachCenterTracker(map: MapLibreMap, getLocale: () => string, debounceMs = 650) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ctrl: AbortController | null = null;

  const onMoveEnd = (e: object) => {
    if (isAutoRotateEvent(e)) return;
    const c = map.getCenter();
    const zoom = map.getZoom();
    const store = useGlobeStore.getState();
    store.setCenter({ lng: c.lng, lat: c.lat, zoom, labelStatus: 'loading' });

    if (timer) clearTimeout(timer);
    ctrl?.abort();
    timer = setTimeout(async () => {
      const current = new AbortController();
      ctrl = current;
      try {
        const label = await reverseGeocode({ lng: c.lng, lat: c.lat, zoom }, getLocale(), current.signal);
        if (!current.signal.aborted) {
          useGlobeStore.getState().setCenter({ label, labelStatus: label ? 'done' : 'none' });
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          useGlobeStore.getState().setCenter({ label: null, labelStatus: 'none' });
        }
      }
    }, debounceMs);
  };

  map.on('moveend', onMoveEnd);
  return () => {
    map.off('moveend', onMoveEnd);
    if (timer) clearTimeout(timer);
    ctrl?.abort();
  };
}
