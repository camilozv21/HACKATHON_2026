/**
 * Sintonía de la radio. La emisora es la que está bajo la mira:
 *  - una emisora fija cercana (radio que se achica al acercarse), o
 *  - la emisora de la zona (src/features/radio/local.ts) cuando se mira un lugar con nombre y no hay una fija, o
 *  - la nacional con el globo entero a la vista (o sobre el mar).
 * Las emisoras de la zona usan como relleno los segmentos grabados de la nacional; su programa del día llega aparte.
 */
import { getMap } from '@/features/globe/store';
import { RadioSegmentsResponse, type RadioStation } from '@/lib/api/contract';
import { haversineKm } from '@/lib/geo';
import { radioEngine } from './engine';
import { useRadioLive } from './live';
import { LOCAL_MIN_ZOOM, localStation } from './local';
import { cancelProgram } from './programClient';
import { useRadioStore } from './store';

/** Radio de sintonía según el zoom: con el globo entero se "escucha" lejos; de cerca, solo lo local. */
export const tuneRadiusKm = (zoom: number) =>
  zoom >= LOCAL_MIN_ZOOM ? Math.max(35, 2200 / 2 ** (zoom - 3)) : Math.max(250, 4500 / 2 ** Math.max(0, zoom - 2));

export function nearestFixed(stations: readonly RadioStation[], lng: number, lat: number, zoom: number) {
  let best: RadioStation | null = null;
  let bestD = Infinity;
  for (const s of stations) {
    if (s.lat == null || s.lon == null) continue;
    const d = haversineKm({ lng, lat }, { lng: s.lon, lat: s.lat });
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best && bestD <= tuneRadiusKm(zoom) ? best : null;
}

export const nationalStation = (stations: readonly RadioStation[]) => stations.find((s) => s.lat == null) ?? null;

type Center = { lng: number; lat: number; zoom: number; label: string | null; labelStatus: 'idle' | 'loading' | 'done' | 'none' };

/** Emisora para lo que está bajo la mira; 'wait' mientras llega el nombre del lugar. */
export function stationFor(stations: readonly RadioStation[], c: Center, locale: 'es' | 'en'): RadioStation | 'wait' | null {
  const fixed = nearestFixed(stations, c.lng, c.lat, c.zoom);
  if (fixed) return fixed;
  if (c.zoom >= LOCAL_MIN_ZOOM) {
    if (c.labelStatus === 'loading') return 'wait';
    if (c.label) return localStation(c.lat, c.lng, c.label, locale);
  }
  return nationalStation(stations) ?? stations[0] ?? null;
}

export async function loadSegments(id: string) {
  const res = await fetch(`/api/radio/stations/${encodeURIComponent(id)}/segments`);
  if (!res.ok) throw new Error(String(res.status));
  return RadioSegmentsResponse.parse(await res.json()).segments;
}

export function markTuned(id: string) {
  document.querySelectorAll<HTMLElement>('.radio-marker').forEach((m) => m.classList.toggle('is-tuned', m.dataset.stationId === id));
}

let seq = 0;

/** Cambia de emisora. Si la radio sonaba, hace estática y la nueva empieza sola (identificación + programa). */
export async function tuneTo(station: RadioStation, opts: { resume: boolean }) {
  const my = ++seq;
  cancelProgram();
  if (opts.resume) {
    radioEngine.pause();
    await radioEngine.staticBurst();
  }
  try {
    const stations = useRadioStore.getState().stations;
    const fillerId = station.local ? (nationalStation(stations)?.id ?? null) : station.id;
    const segments = fillerId ? await loadSegments(fillerId) : [];
    if (my !== seq) return;
    useRadioStore.getState().tune(station, segments);
    useRadioLive.getState().resetFor(station.id);
    radioEngine.resetStation();
    markTuned(station.id);
    if (opts.resume && useRadioStore.getState().activated) radioEngine.startStation();
    else useRadioStore.getState().setStatus(segments.length || station.lat != null ? 'paused' : 'empty');
  } catch {
    if (my === seq) useRadioStore.getState().setStatus('error');
  }
}

/** El asistente pidió el boletín de un lugar: sintoniza su emisora (si no es la actual) y la pone a sonar. */
export async function playPlace(lat: number, lon: number, name: string | null | undefined, locale: 'es' | 'en') {
  const s = useRadioStore.getState();
  // Con el zoom de la cámara (el vuelo del asistente va antes): la misma emisora que elegiría la sintonía.
  const zoom = Math.max(LOCAL_MIN_ZOOM, getMap()?.getZoom() ?? 9);
  const station = nearestFixed(s.stations, lon, lat, zoom) ?? localStation(lat, lon, name?.trim() || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, locale);
  if (s.tunedId !== station.id) await tuneTo(station, { resume: false });
  radioEngine.activate();
  if (!radioEngine.isPlaying()) radioEngine.startStation();
}
