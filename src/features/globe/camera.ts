import { clamp, haversineKm } from '@/lib/geo';
import { prefersReducedMotion } from '@/lib/hooks/useMediaQuery';
import { getMap, useGlobeStore } from './store';

export type CameraTarget = {
  lng: number;
  lat: number;
  zoom?: number;
  bearing?: number;
  pitch?: number;
};

type Listener = (target: CameraTarget) => void;
const flyListeners = new Set<Listener>();
/** Permite a otras piezas (p. ej. prefetch de tiles, auto-rotación) reaccionar al iniciar un vuelo. */
export function onFlyStart(fn: Listener) {
  flyListeners.add(fn);
  return () => flyListeners.delete(fn);
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Vuelo suave con duración proporcional a la distancia y al cambio de zoom. */
/** `maxMs` limita la duración (la intro cinematográfica no pasa de 4 s en total). */
export function flyTo(target: CameraTarget, opts: { instant?: boolean; maxMs?: number } = {}) {
  const map = getMap();
  if (!map) return;
  const zoom = target.zoom ?? map.getZoom();
  flyListeners.forEach((fn) => fn({ ...target, zoom }));

  const camera = {
    center: [target.lng, target.lat] as [number, number],
    zoom,
    bearing: target.bearing ?? 0,
    pitch: target.pitch ?? 0,
  };

  if (opts.instant || prefersReducedMotion()) {
    map.jumpTo(camera);
    return;
  }

  const from = map.getCenter();
  const distKm = haversineKm({ lng: from.lng, lat: from.lat }, target);
  const zoomDelta = Math.abs(map.getZoom() - zoom);
  const duration = clamp(700 + Math.sqrt(distKm) * 30 + zoomDelta * 220, 900, opts.maxMs ?? 6500);

  map.flyTo({ ...camera, duration, curve: 1.5, easing: easeInOutCubic, essential: true });
}

/** Encuadra unos límites [oeste, sur, este, norte] respetando el padding de los paneles. */
export function fitBounds(
  bbox: [number, number, number, number],
  opts: { maxZoom?: number; instant?: boolean } = {},
) {
  const map = getMap();
  if (!map) return;
  const [w, s, e, n] = bbox;
  const camera = map.cameraForBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 48, maxZoom: opts.maxZoom ?? 16.5 },
  );
  if (!camera?.center) return;
  const center = camera.center as { lng: number; lat: number };
  flyTo({ lng: center.lng, lat: center.lat, zoom: camera.zoom }, { instant: opts.instant });
}

export function zoomBy(delta: number) {
  const map = getMap();
  if (!map) return;
  map.easeTo({ zoom: map.getZoom() + delta, duration: prefersReducedMotion() ? 0 : 300 });
}

export function resetNorth() {
  const map = getMap();
  if (!map) return;
  map.easeTo({ bearing: 0, pitch: 0, duration: prefersReducedMotion() ? 0 : 500 });
}

/**
 * Ajusta el relleno del mapa para que el centro (la mira) quede fuera de los paneles.
 * Llamar ANTES de volar a algo que se mostrará con un panel abierto. Nunca interrumpe un vuelo en curso:
 * si la cámara se está moviendo, el cambio se aplica al terminar.
 */
export function setMapPadding(
  p: { top?: number; bottom?: number; right?: number },
  opts: { instant?: boolean } = {},
) {
  const store = useGlobeStore.getState();
  const next = { ...store.padding, ...p };
  store.setPaddingState(next);
  const root = document.documentElement;
  root.style.setProperty('--map-pad-top', `${next.top}px`);
  root.style.setProperty('--map-pad-bottom', `${next.bottom}px`);
  root.style.setProperty('--map-pad-right', `${next.right}px`);

  const map = getMap();
  if (!map) return;
  const padding = { top: next.top, bottom: next.bottom, right: next.right, left: 0 };
  const same = (c: { top?: number; bottom?: number; right?: number; left?: number }) =>
    (c.top ?? 0) === padding.top &&
    (c.bottom ?? 0) === padding.bottom &&
    (c.right ?? 0) === padding.right &&
    (c.left ?? 0) === 0;

  // Solo un cambio pendiente a la vez: el último pedido gana.
  if (pendingPadding) {
    map.off('moveend', pendingPadding);
    pendingPadding = null;
  }
  const apply = () => {
    if (same(map.getPadding())) return;
    if (opts.instant || prefersReducedMotion()) map.setPadding(padding);
    else map.easeTo({ padding, duration: 250 });
  };
  if (map.isMoving()) {
    pendingPadding = () => {
      pendingPadding = null;
      apply();
    };
    map.once('moveend', pendingPadding);
  } else {
    apply();
  }
}

let pendingPadding: (() => void) | null = null;
