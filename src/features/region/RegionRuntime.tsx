'use client';

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useLocale } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useRef } from 'react';
import { hazardHits } from '@/features/events/hit';
import { listingHits } from '@/features/listings/hit';
import { useEventsStore } from '@/features/events/store';
import { getDemo } from '@/features/field/demoFarms';
import { useFieldStore } from '@/features/field/store';
import { flyTo, setMapPadding, type CameraTarget } from '@/features/globe/camera';
import { setGlobeOccluded } from '@/features/globe/runtime';
import { useGlobeStore } from '@/features/globe/store';
import { reverseGeocode } from '@/lib/geocoding';
import { fitBBox, inBBox, unionBBox, type BBox } from '@/lib/bbox';
import { clamp } from '@/lib/geo';
import { prefersReducedMotion } from '@/lib/hooks/useMediaQuery';
import { urlOptions } from '@/lib/urlState';
import { UrlStateProvider } from '@/lib/url/UrlStateProvider';
import {
  adminParam,
  adminTarget,
  CO_BBOX,
  findAdminAt,
  getAdmin,
  loadAdmin,
  MPIO_MIN_ZOOM,
  parseAdminParam,
  type AdminArea,
  type AdminLevel,
} from './admin';
import { AdminLines } from './AdminLines';
import { defaultCellBBox, drawerWidth, useRegionStore, type RegionTarget } from './store';

const SRC = 'region';
/** Departamento del municipio elegido y recuadro de los datos. */
const CTX = 'region-context';
const GLOW = '#9ff0b8';
/** De abajo arriba: contexto (departamento, recuadro) y encima el área elegida. */
const LAYER_ORDER = ['region-dpto-fill', 'region-dpto-line', 'region-cell-line', 'region-fill', 'region-glow', 'region-line'];

const FULL_LINE: ExpressionSpecification = ['interpolate', ['linear'], ['line-progress'], 0, '#ffffff', 1, '#ffffff'];

const ring = ([w, s, e, n]: BBox): [number, number][] => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
  [w, n],
];

function regionSquare(t: RegionTarget): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(defaultCellBBox(t)) } };
}

/** Departamento al que pertenece un municipio (el código DIVIPOLA del municipio empieza por el suyo). */
const parentDpto = (admin: RegionTarget['admin']) =>
  admin?.level === 'mpio' ? (getAdmin('dpto')?.byCode.get(admin.code.slice(0, 2)) ?? null) : null;

/**
 * Contexto del área elegida: el departamento entero (si es un municipio) y el recuadro punteado de donde vienen
 * los datos. Usa lo que ya esté cargado; se vuelve a llamar cuando llegan el departamento o el `bbox` del resumen.
 */
function drawContext(map: MapLibreMap) {
  const src = map.getSource(CTX) as GeoJSONSource | undefined;
  if (!src) return;
  const { target, cell } = useRegionStore.getState();
  const features: GeoJSON.Feature[] = [];
  if (target?.admin) {
    const dpto = parentDpto(target.admin);
    if (dpto) {
      features.push({
        type: 'Feature',
        properties: { kind: 'dpto' },
        geometry: { type: 'MultiPolygon', coordinates: dpto.polygons },
      });
    }
    features.push({
      type: 'Feature',
      properties: { kind: 'cell' },
      geometry: { type: 'LineString', coordinates: ring(cell ?? defaultCellBBox(target)) },
    });
  }
  src.setData({ type: 'FeatureCollection', features });
}

/** Borde real (todos los anillos, también los huecos: Cundinamarca rodea a Bogotá) y relleno de un área. */
function adminShapes(area: AdminArea) {
  return {
    line: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: area.polygons.flat() },
    } satisfies GeoJSON.Feature<GeoJSON.MultiLineString>,
    fill: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: area.polygons },
    } satisfies GeoJSON.Feature<GeoJSON.MultiPolygon>,
  };
}

const ZOOM_RANGE = { dpto: [4, 8.5], mpio: [6, 11.5] } as const;

/**
 * Encuadre de una caja en la parte del mapa que queda a la vista: libres la búsqueda (arriba) y la radio con el chat
 * (abajo). El drawer ya está en el padding del mapa; en móvil tapa casi todo, así que se encuadra para cuando cierre.
 */
function fitCamera(map: MapLibreMap, bbox: BBox, [min, max]: readonly [number, number]): Required<Pick<CameraTarget, 'lng' | 'lat' | 'zoom'>> {
  const host = map.getContainer();
  const right = window.matchMedia('(min-width: 640px)').matches ? drawerWidth() : 0;
  const fit = fitBBox(bbox, host.clientWidth - right, host.clientHeight, { top: 88, bottom: 160, left: 40, right: 40 });
  return { lng: fit.lng, lat: fit.lat, zoom: clamp(fit.zoom, min, max) };
}

/** El área elegida: un municipio con su recuadro de datos, o un departamento entero. */
function areaCamera(map: MapLibreMap, area: AdminArea, target: RegionTarget, cell: BBox | null) {
  return area.level === 'mpio'
    ? fitCamera(map, unionBBox(area.bbox, cell ?? defaultCellBBox(target)), ZOOM_RANGE.mpio)
    : fitCamera(map, area.bbox, ZOOM_RANGE.dpto);
}

/**
 * Vuelo por tramos (departamento → municipio). Cada tramo empieza cuando termina el anterior, con una pausa corta.
 * Si la persona mueve el mapa a mitad de camino, el vuelo se detiene: no se le quita el control.
 */
function flyThrough(map: MapLibreMap, legs: Required<Pick<CameraTarget, 'lng' | 'lat' | 'zoom'>>[]) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let off: (() => void) | undefined;
  const run = (i: number) => {
    const leg = legs[i];
    if (cancelled || !leg) return;
    if (i < legs.length - 1) {
      const onEnd = () => {
        off = undefined;
        const c = map.getCenter();
        const arrived =
          Math.abs(c.lng - leg.lng) < 0.05 && Math.abs(c.lat - leg.lat) < 0.05 && Math.abs(map.getZoom() - leg.zoom) < 0.1;
        if (!cancelled && arrived) timer = setTimeout(() => run(i + 1), 350);
      };
      // Antes de volar: si el vuelo no tiene nada que hacer, MapLibre puede emitir moveend en el acto.
      map.once('moveend', onEnd);
      off = () => map.off('moveend', onEnd);
    }
    flyTo(leg, { maxMs: 1400 });
  };
  run(0);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    off?.();
  };
}

const findLoaded = (admin: RegionTarget['admin']) =>
  admin ? (getAdmin(admin.level)?.byCode.get(admin.code) ?? null) : null;

function ensureLayers(map: MapLibreMap) {
  if (map.getSource(SRC)) return;
  map.addSource(CTX, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // Departamento: tinte muy suave y línea fina continua. Recuadro de los datos: punteado. Área elegida: brillo.
  // Se distinguen por el trazo, no solo por el color.
  map.addLayer({
    id: 'region-dpto-fill',
    type: 'fill',
    source: CTX,
    filter: ['==', ['get', 'kind'], 'dpto'],
    paint: { 'fill-color': GLOW, 'fill-opacity': 0.06 },
  });
  map.addLayer({
    id: 'region-dpto-line',
    type: 'line',
    source: CTX,
    filter: ['==', ['get', 'kind'], 'dpto'],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': GLOW,
      'line-opacity': 0.85,
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 8, 2, 12, 2.6],
    },
  });
  map.addLayer({
    id: 'region-cell-line',
    type: 'line',
    source: CTX,
    filter: ['==', ['get', 'kind'], 'cell'],
    paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': 1.6, 'line-dasharray': [2.5, 2] },
  });
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, lineMetrics: true });
  map.addSource(`${SRC}-fill`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'region-fill',
    type: 'fill',
    source: `${SRC}-fill`,
    paint: { 'fill-color': GLOW, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 420 } },
  });
  map.addLayer({
    id: 'region-glow',
    type: 'line',
    source: SRC,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': GLOW, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.55 },
  });
  map.addLayer({
    id: 'region-line',
    type: 'line',
    source: SRC,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-width': 2.5, 'line-gradient': FULL_LINE },
  });
}

/** Trazo del borde que se "dibuja" (700 ms) y brillo del relleno que pulsa una vez. */
function animateHighlight(map: MapLibreMap, onDone: () => void) {
  if (prefersReducedMotion()) {
    map.setPaintProperty('region-fill', 'fill-opacity', 0.12);
    onDone();
    return () => {};
  }
  const start = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / 700);
    map.setPaintProperty('region-line', 'line-gradient', [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      '#ffffff',
      Math.max(0.0001, p),
      '#ffffff',
      Math.min(1, p + 0.0002),
      'rgba(255,255,255,0)',
    ]);
    if (p < 1) raf = requestAnimationFrame(step);
    else {
      // Trazo completo: sin el corte (dos paradas en 1 harían la expresión inválida y quedaría el cuadro anterior).
      map.setPaintProperty('region-line', 'line-gradient', FULL_LINE);
      onDone();
    }
  };
  raf = requestAnimationFrame(step);
  map.setPaintProperty('region-fill', 'fill-opacity', 0.35);
  const t = setTimeout(() => map.setPaintProperty('region-fill', 'fill-opacity', 0.1), 450);
  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(t);
  };
}

function MapSync() {
  const locale = useLocale();
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const target = useRegionStore((s) => s.target);
  const keyRef = useRef<string | null>(null);

  // Tocar el globo (sin estar dibujando ni poniendo un pin) abre la región.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }) => {
      if (useFieldStore.getState().mode !== 'idle' || useEventsStore.getState().picking) return;
      // Un toque sobre un evento abre el evento, no la región.
      if (hazardHits(map, e.point).length || listingHits(map, e.point).length) return;
      const { lng, lat } = e.lngLat;
      const tap = { x: e.point.x, y: e.point.y };
      const region = useRegionStore.getState();

      // En Colombia: el departamento (lejos) o el municipio (cerca) que contiene el punto.
      const level: AdminLevel = map.getZoom() < MPIO_MIN_ZOOM ? 'dpto' : 'mpio';
      const inColombia = inBBox(CO_BBOX, lng, lat);
      const index = inColombia ? getAdmin(level) : null;
      const area = index && findAdminAt(index, lng, lat);
      if (area) {
        region.openRegion({ ...adminTarget(area, { lat, lon: lng }), tap });
        return;
      }

      region.openRegion({ lat, lon: lng, tap });
      void reverseGeocode({ lng, lat, zoom: 9 }, locale)
        .then((name) => {
          const cur = useRegionStore.getState().target;
          if (cur && cur.lat === lat && cur.lon === lng && !cur.admin) useRegionStore.getState().setRegionName(name);
        })
        .catch(() => undefined);

      // Los límites aún no habían llegado: cuando lleguen, el punto pasa a ser su municipio o departamento.
      if (inColombia && !index) {
        void loadAdmin(level)
          .then((idx) => {
            const cur = useRegionStore.getState().target;
            if (!cur || cur.lat !== lat || cur.lon !== lng || cur.admin) return;
            const found = findAdminAt(idx, lng, lat);
            if (found) useRegionStore.getState().openRegion({ ...adminTarget(found, { lat, lon: lng }), tap: cur.tap });
          })
          .catch(() => undefined);
      }
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, locale]);

  // Resaltar + volar dejando espacio al drawer.
  useEffect(() => {
    if (!map || !ready) return;
    ensureLayers(map);
    for (const id of LAYER_ORDER) map.moveLayer(id);
    if (!target) {
      keyRef.current = null;
      drawContext(map);
      (map.getSource(SRC) as GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
      (map.getSource(`${SRC}-fill`) as GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
      map.setPaintProperty('region-fill', 'fill-opacity', 0);
      if (!useFieldStore.getState().sheet) setMapPadding({ right: 0 });
      setGlobeOccluded('region', false);
      return;
    }
    const key = `${target.lat},${target.lon},${target.demoId ?? ''},${target.admin?.code ?? ''}`;
    if (keyRef.current === key) return;
    keyRef.current = key;

    const area = findLoaded(target.admin);
    if (area) {
      const { line, fill } = adminShapes(area);
      (map.getSource(SRC) as GeoJSONSource).setData(line);
      (map.getSource(`${SRC}-fill`) as GeoJSONSource).setData(fill);
    } else {
      const line = regionSquare(target);
      (map.getSource(SRC) as GeoJSONSource).setData(line);
      (map.getSource(`${SRC}-fill`) as GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [line.geometry.coordinates] },
      });
    }
    drawContext(map);
    // El municipio llegó antes que su departamento (p. ej. un enlace co:05001): se dibuja cuando llegue.
    if (target.admin?.level === 'mpio' && !getAdmin('dpto')) {
      void loadAdmin('dpto')
        .then(() => useRegionStore.getState().target === target && drawContext(map))
        .catch(() => undefined);
    }

    if (map.isMoving()) map.stop();
    setMapPadding({ right: drawerWidth(), bottom: 0 }, { instant: true });
    let stopFlight = () => {};
    if (area?.level === 'mpio') {
      // El municipio y su recuadro de datos; antes, si el departamento no se ve, un vistazo al departamento entero.
      const final = areaCamera(map, area, target, useRegionStore.getState().cell);
      const dpto = parentDpto(target.admin);
      const overview = dpto && fitCamera(map, dpto.bbox, ZOOM_RANGE.dpto);
      const showOverview =
        overview && !prefersReducedMotion() && map.getZoom() > overview.zoom + 0.75 && final.zoom - overview.zoom > 1.5;
      stopFlight = flyThrough(map, showOverview ? [overview, final] : [final]);
    } else if (area) {
      flyTo(areaCamera(map, area, target, null));
    } else {
      flyTo({ lng: target.lon, lat: target.lat, zoom: target.demoId ? 8.2 : Math.max(map.getZoom(), 8.8) });
    }
    // Con el drawer abierto y sin tocar el globo no hace falta que gire.
    setGlobeOccluded('region', true);
    const stopHighlight = animateHighlight(map, () => undefined);
    return () => {
      stopFlight();
      stopHighlight();
    };
  }, [map, ready, target]);

  // Llega el `bbox` del resumen: el recuadro pasa a ser el que dice la API. La leyenda del drawer pide encuadres.
  useEffect(() => {
    if (!map) return;
    return useRegionStore.subscribe((s, prev) => {
      if (s.cell !== prev.cell) drawContext(map);
      const area = s.focus && s.focus !== prev.focus ? findLoaded(s.target?.admin) : null;
      if (!area || !s.target || !s.focus) return;
      const dpto = s.focus.kind === 'dpto' ? (area.level === 'dpto' ? area : parentDpto(s.target.admin)) : null;
      flyTo(dpto ? fitCamera(map, dpto.bbox, ZOOM_RANGE.dpto) : areaCamera(map, area, s.target, s.cell));
    });
  }, [map]);

  // El drawer de región y el panel de la finca comparten el lado derecho: uno cierra al otro.
  useEffect(
    () =>
      useFieldStore.subscribe((s, prev) => {
        if (s.sheet && !prev.sheet) useRegionStore.getState().closeRegion();
      }),
    [],
  );
  useEffect(
    () =>
      useRegionStore.subscribe((s, prev) => {
        if (s.target && !prev.target && useFieldStore.getState().sheet) useFieldStore.getState().setSheet(null);
      }),
    [],
  );

  return null;
}

/** ?region=<lat>,<lon> | demo:<id> | co:<DIVIPOLA> (co:05 departamento, co:05001 municipio) */
function RegionUrlSync() {
  const [params, setParams] = useQueryStates({ region: parseAsString }, urlOptions);
  const initial = useRef(params.region);

  useEffect(() => {
    const r = initial.current;
    if (!r) return;
    const admin = parseAdminParam(r);
    if (admin) {
      void loadAdmin(admin.level)
        .then((index) => {
          const area = index.byCode.get(admin.code);
          if (area && !useRegionStore.getState().target) useRegionStore.getState().openRegion(adminTarget(area));
        })
        .catch(() => undefined);
    } else if (r.startsWith('demo:')) {
      const demo = getDemo(r.slice(5));
      if (demo) useRegionStore.getState().openRegion({ lat: demo.center[1], lon: demo.center[0], demoId: demo.id });
    } else {
      const [lat, lon] = r.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) useRegionStore.getState().openRegion({ lat: lat!, lon: lon! });
    }
  }, []);

  useEffect(
    () =>
      useRegionStore.subscribe((s, prev) => {
        if (s.target === prev.target) return;
        const t = s.target;
        void setParams({
          region: t
            ? t.demoId
              ? `demo:${t.demoId}`
              : t.admin
                ? adminParam(t.admin.code)
                : `${t.lat.toFixed(4)},${t.lon.toFixed(4)}`
            : null,
        });
      }),
    [setParams],
  );
  return null;
}

export default function RegionRuntime() {
  return (
    <>
      <UrlStateProvider>
        <RegionUrlSync />
      </UrlStateProvider>
      <MapSync />
      <AdminLines />
    </>
  );
}
