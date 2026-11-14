/**
 * Ejecuta las acciones estructuradas que devuelve el agente sobre el globo, en orden:
 * primero el vuelo (espera a que termine), luego capas, luego abrir la región, etc.
 * Cada acción se valida con zod; las desconocidas o mal formadas se ignoran sin romper nada.
 */
import type { GeoJSONSource } from 'maplibre-gl';
import { toast } from '@/components/ui/toast';
import { useEventsStore } from '@/features/events/store';
import { reportHref } from '@/features/report/report';
import { useFarmDataStore } from '@/features/field/farmData';
import { useFieldStore } from '@/features/field/store';
import { fitBounds, flyTo } from '@/features/globe/camera';
import { getMap } from '@/features/globe/store';
import { snapDate } from '@/features/layers/dates';
import { LAYER_BY_ID } from '@/features/layers/layers.config';
import { useLayerStore } from '@/features/layers/store';
import { parseTimeParam, toTimeParam } from '@/features/time/period';
import { useTimeStore } from '@/features/time/store';
import { useRegionStore } from '@/features/region/store';
import { AgentAction } from '@/lib/api/contract';

const ORDER: Record<AgentAction['type'], number> = {
  flyTo: 0,
  fitBounds: 0,
  clearLayers: 1,
  // La fecha va antes de las capas: las que se activen después saltan a ese día.
  setTime: 1,
  setLayer: 2,
  highlightArea: 3,
  openRegion: 4,
  showStrategies: 5,
  askForData: 5,
  // Los eventos se muestran con la fecha ya puesta (van después de setTime).
  showEvents: 2,
  reportEvent: 6,
  agroReport: 7,
  playRadio: 6,
};

function waitMoveEnd(timeoutMs = 9000) {
  const map = getMap();
  return new Promise<void>((resolve) => {
    if (!map) return resolve();
    const t = setTimeout(resolve, timeoutMs);
    // Espera al moveend del vuelo que empieza justo después de suscribirse.
    requestAnimationFrame(() => {
      if (!map.isMoving()) {
        clearTimeout(t);
        return resolve();
      }
      map.once('moveend', () => {
        clearTimeout(t);
        resolve();
      });
    });
  });
}

function highlight(geojson: unknown) {
  const map = getMap();
  if (!map) return;
  const data = geojson as GeoJSON.GeoJSON;
  if (map.getSource('agent-highlight')) (map.getSource('agent-highlight') as GeoJSONSource).setData(data);
  else {
    map.addSource('agent-highlight', { type: 'geojson', data });
    map.addLayer({
      id: 'agent-highlight-glow',
      type: 'line',
      source: 'agent-highlight',
      paint: { 'line-color': '#7cc4ff', 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.6 },
    });
    map.addLayer({
      id: 'agent-highlight-line',
      type: 'line',
      source: 'agent-highlight',
      paint: { 'line-color': '#ffffff', 'line-width': 2 },
    });
  }
}

export type RunResult = {
  moved: boolean;
  previous?: { lng: number; lat: number; zoom: number };
  openedRegion: boolean;
  /** Informe agroclimático listo para abrir (el chat muestra el botón). */
  report?: string;
};

export async function runAgentActions(
  raw: unknown[],
  opts: { locale: string; onFlightStart?: () => void; onFlightEnd?: () => void; messages: { noField: string } },
): Promise<RunResult> {
  const actions = raw
    .map((r) => AgentAction.safeParse(r))
    .flatMap((p) => (p.success ? [p.data] : []))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDER[x.a.type] - ORDER[y.a.type] || x.i - y.i)
    .map(({ a }) => a);

  const map = getMap();
  const c = map?.getCenter();
  const previous = map && c ? { lng: c.lng, lat: c.lat, zoom: map.getZoom() } : undefined;
  let moved = false;
  let openedRegion = false;
  let report: string | undefined;

  for (const a of actions) {
    switch (a.type) {
      case 'flyTo': {
        let lat = a.lat;
        let lon = a.lon;
        if (lat == null || lon == null) {
          const { searchPlaces } = await import('@/lib/geocoding');
          const hit = (await searchPlaces(a.label ?? '', opts.locale).catch(() => []))[0];
          if (!hit) break;
          lat = hit.lat;
          lon = hit.lng;
        }
        opts.onFlightStart?.();
        flyTo({ lng: lon, lat, zoom: a.zoom ?? 7 });
        await waitMoveEnd();
        moved = true;
        break;
      }
      case 'fitBounds':
        opts.onFlightStart?.();
        fitBounds(a.bbox);
        await waitMoveEnd();
        moved = true;
        break;
      case 'clearLayers':
        useLayerStore.getState().clearLayers();
        break;
      case 'setTime': {
        // Va antes de las capas en el orden del agente, así las capas que se activen después saltan a esa fecha.
        const sel = a.when ? parseTimeParam(a.when) : null;
        if (a.when === null || sel) useTimeStore.getState().set(sel);
        break;
      }
      case 'setLayer': {
        const cfg = LAYER_BY_ID[a.layerId];
        useLayerStore.getState().setLayer(a.layerId, {
          date: a.date ? (snapDate(cfg, a.date) ?? undefined) : undefined,
          opacity: a.opacity,
        });
        break;
      }
      case 'highlightArea':
        highlight(a.geojson);
        break;
      case 'openRegion':
        useRegionStore.getState().openRegion({ lat: a.lat, lon: a.lon, name: a.name ?? null });
        openedRegion = true;
        moved = true;
        break;
      case 'showStrategies': {
        const field = useFieldStore.getState();
        if (field.field) field.setAnalyzing(true);
        else toast(opts.messages.noField, 'info');
        break;
      }
      case 'askForData': {
        // Abre las preguntas rápidas del análisis ("Faltan datos…") en el dato que pidió el agente.
        const field = useFieldStore.getState();
        if (!field.field) {
          toast(opts.messages.noField, 'info');
          break;
        }
        useFarmDataStore.getState().requestFocus(field.field.id, a.need ?? null);
        field.setPanelTab('conditions');
        field.setAnalyzing(true);
        break;
      }
      case 'showEvents': {
        const ev = useEventsStore.getState();
        ev.setKind(a.kind ?? null);
        ev.setVisible(a.on ?? true);
        break;
      }
      case 'agroReport': {
        // Sin lat/lon: la zona que se mira (después del vuelo). Sin fecha: la de la máquina del tiempo o los últimos 30 días.
        const center = getMap()?.getCenter();
        const lat = a.lat ?? center?.lat;
        const lon = a.lon ?? center?.lng;
        if (lat == null || lon == null) break;
        const sel = useTimeStore.getState().sel;
        const region = useRegionStore.getState().target;
        const name = a.name ?? (a.lat == null && region ? region.name : null);
        report = reportHref(opts.locale, { lat, lon, name, when: a.when !== undefined ? a.when : sel ? toTimeParam(sel) : null });
        break;
      }
      case 'reportEvent':
        // Solo abre el formulario: la persona lo revisa y decide si lo envía.
        useEventsStore.getState().openReport({ kind: a.kind, lat: a.lat, lon: a.lon });
        break;
      case 'playRadio': {
        const [{ radioEngine }, { useRadioStore }] = await Promise.all([
          import('@/features/radio/engine'),
          import('@/features/radio/store'),
        ]);
        if (a.stationId && a.stationId !== useRadioStore.getState().tunedId) {
          const res = await fetch(`/api/radio/stations/${encodeURIComponent(a.stationId)}/segments`).catch(() => null);
          const j = res?.ok ? await res.json() : null;
          if (j?.segments) useRadioStore.getState().tune(a.stationId, j.segments);
        }
        radioEngine.activate();
        void radioEngine.play();
        break;
      }
    }
  }
  opts.onFlightEnd?.();
  return { moved, previous, openedRegion, report };
}
