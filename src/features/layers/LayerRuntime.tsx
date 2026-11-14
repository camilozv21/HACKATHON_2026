'use client';

import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useRef } from 'react';
import { gibsTileUrl } from '@/features/globe/gibs';
import { useGlobeStore } from '@/features/globe/store';
import { firstOverlayId } from '@/features/globe/style';
import { useRiskStore } from '@/features/terrain/store';
import { prefersReducedMotion, useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { riskParams, urlOptions } from '@/lib/urlState';
import { UrlStateProvider } from '@/lib/url/UrlStateProvider';
import { entryValue, loadColormap, lookupColor, readGibsPixel } from './colormap';
import { latestDate, monthOptions, snapDate } from './dates';
import { LAYER_IDS, type LayerId } from './ids';
import { LAYER_BY_ID, type LayerConfig } from './layers.config';
import { RasterSwap } from './rasterSwap';
import { useLayerStore } from './store';
import { cachedTileUrl } from './tileCache';

const lyrId = (id: LayerId) => `data-${id}`;
const frameId = (id: LayerId, i: number) => `data-${id}-f${i}`;

/** Capas de datos debajo de la finca, de los límites y de las etiquetas. */
function beforeId(map: MapLibreMap) {
  return map.getLayer('field-fill') ? 'field-fill' : firstOverlayId(map);
}

/** URL gibs://… para que MapLibre pase por la caché en memoria (src/features/layers/tileCache.ts). */
function tileUrl(cfg: LayerConfig, date: string) {
  return cachedTileUrl(gibsTileUrl({ id: cfg.gibs!.id, level: cfg.gibs!.level, format: cfg.gibs!.format }, date));
}

/** Cruce entre la fecha (o capa) anterior y la nueva. */
const crossfadeMs = () => (prefersReducedMotion() ? 0 : 300);

function removeData(map: MapLibreMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

/** Fuente de la capa de zonas de riesgo (src/features/terrain/riskLayer.ts, que se carga solo si hace falta). */
const RISK_SOURCE_ID = 'data-risk';
const loadRiskLayer = () => import('@/features/terrain/riskLayer');

function hideRiskIfShown(map: MapLibreMap) {
  if (map.getSource(RISK_SOURCE_ID)) void loadRiskLayer().then((m) => m.hideRisk(map));
}

/** Mantiene el mapa igual al store de capas (fuente única de verdad: useLayerStore). */
function MapSync() {
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const active = useLayerStore((s) => s.active);
  const dates = useLayerStore((s) => s.dates);
  const opacity = useLayerStore((s) => s.opacity);
  const playing = useLayerStore((s) => s.playing);
  const isDesktop = useIsDesktop();
  const mainId = active[0];
  const riskKind = useRiskStore((s) => s.kind);
  const riskRelief = useRiskStore((s) => s.relief);
  const riskOn = Boolean(mainId && LAYER_BY_ID[mainId].kind === 'vector');
  const riskOpacity = mainId && riskOn ? (opacity[mainId] ?? LAYER_BY_ID[mainId].defaultOpacity) : 0;
  // Capa raster principal con doble búfer: cambiar de fecha o de capa cruza las imágenes en vez de parchearlas.
  const swapRef = useRef<RasterSwap | null>(null);

  useEffect(() => {
    if (!map) return;
    const swap = new RasterSwap(map);
    swapRef.current = swap;
    return () => {
      swap.clear();
      swapRef.current = null;
      for (const id of LAYER_IDS) if (LAYER_BY_ID[id].kind === 'hillshade') removeData(map, lyrId(id));
      hideRiskIfShown(map);
    };
  }, [map]);

  // Zonas de riesgo (polígonos por municipio + relieve). Cambiar de riesgo solo cambia la pintura.
  useEffect(() => {
    if (!map || !ready) return;
    if (!riskOn) {
      hideRiskIfShown(map);
      return;
    }
    let current = true;
    void loadRiskLayer().then((m) => {
      if (!current) return;
      return m.showRisk(map, {
        kind: riskKind,
        relief: riskRelief,
        opacity: riskOpacity,
        beforeId: beforeId(map),
        isCurrent: () => current,
      });
    });
    return () => {
      current = false;
    };
  }, [map, ready, riskOn, riskKind, riskRelief, riskOpacity]);

  // Capa principal (la de comparación la dibuja la cortina en desktop).
  useEffect(() => {
    const swap = swapRef.current;
    if (!map || !ready || !swap) return;
    for (const id of LAYER_IDS) if (id !== mainId && LAYER_BY_ID[id].kind === 'hillshade') removeData(map, lyrId(id));
    if (!mainId) {
      swap.clear();
      return;
    }
    const cfg = LAYER_BY_ID[mainId];
    const op = opacity[mainId] ?? cfg.defaultOpacity;

    // Polígonos propios: los dibuja el efecto de zonas de riesgo.
    if (cfg.kind === 'vector') {
      swap.clear();
      return;
    }

    if (cfg.kind === 'hillshade') {
      swap.clear();
      if (!map.getSource('dem')) {
        useLayerStore.getState().setTileError(mainId, true);
        return;
      }
      if (!map.getLayer(lyrId(mainId))) {
        map.addLayer(
          {
            id: lyrId(mainId),
            type: 'hillshade',
            source: 'dem',
            paint: {
              'hillshade-exaggeration': 0.75,
              'hillshade-shadow-color': '#000000',
              'hillshade-highlight-color': '#ffffff',
              'hillshade-accent-color': '#1b2a3a',
            },
          },
          beforeId(map),
        );
      }
      map.setPaintProperty(lyrId(mainId), 'hillshade-exaggeration', Math.max(0.1, op));
      return;
    }

    const date = dates[mainId] ?? latestDate(cfg);
    if (!date) return;
    if (!dates[mainId]) useLayerStore.getState().setDate(mainId, date);
    swap.show({
      key: mainId,
      url: tileUrl(cfg, date),
      opacity: op,
      maxzoom: cfg.gibs!.level,
      attribution: `<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> · ${cfg.mission}`,
      beforeId: beforeId(map),
      fadeMs: crossfadeMs(),
    });
  }, [map, ready, mainId, dates, opacity, isDesktop]);

  // Errores por tesela: varios errores sin ninguna tesela buena → "sin datos este día".
  useEffect(() => {
    if (!map || !mainId || LAYER_BY_ID[mainId].kind !== 'gibs') return;
    let errors = 0;
    let loaded = 0;
    // La fuente que cuenta es la de la fecha pedida (la nueva mientras se cruza con la anterior).
    const isTarget = (sourceId?: string) => Boolean(sourceId) && sourceId === swapRef.current?.targetSourceId;
    const onError = (e: object) => {
      if (!isTarget((e as { sourceId?: string }).sourceId)) return;
      errors++;
      if (errors >= 3 && loaded === 0) useLayerStore.getState().setTileError(mainId, true);
    };
    const onData = (e: object) => {
      const d = e as { sourceId?: string; tile?: unknown };
      if (isTarget(d.sourceId) && d.tile) {
        loaded++;
        useLayerStore.getState().setTileError(mainId, false);
      }
    };
    map.on('error', onError);
    map.on('sourcedata', onData);
    return () => {
      map.off('error', onError);
      map.off('sourcedata', onData);
    };
  }, [map, mainId, dates]);

  // Animación de los últimos 12 meses: se precargan todos los fotogramas (opacidad 0) y se alternan.
  useEffect(() => {
    if (!map || !playing || !mainId) return;
    const cfg = LAYER_BY_ID[mainId];
    if (cfg.kind !== 'gibs') return;
    const frames = monthOptions(cfg, 12)
      .map((o) => o.date)
      .filter((d): d is string => Boolean(d));
    if (frames.length < 2) return;
    const op = useLayerStore.getState().opacity[mainId] ?? cfg.defaultOpacity;
    swapRef.current?.setVisible(false);
    frames.forEach((date, i) => {
      map.addSource(frameId(mainId, i), { type: 'raster', tiles: [tileUrl(cfg, date)], tileSize: 256, maxzoom: cfg.gibs!.level });
      map.addLayer(
        {
          id: frameId(mainId, i),
          type: 'raster',
          source: frameId(mainId, i),
          paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-opacity-transition': { duration: 350 } },
        },
        beforeId(map),
      );
    });

    let i = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const show = (k: number) => {
      frames.forEach((_, j) => map.setPaintProperty(frameId(mainId, j), 'raster-opacity', j === k ? op : 0));
      useLayerStore.getState().setPlayFrame(frames[k]!);
    };
    const start = () => {
      show(0);
      timer = setInterval(() => {
        i = (i + 1) % frames.length;
        show(i);
      }, 1000);
    };
    // Esperar a que carguen los fotogramas (o 2.5 s como máximo) antes de animar.
    const fallback = setTimeout(start, 2500);
    map.once('idle', () => {
      clearTimeout(fallback);
      if (!timer) start();
    });

    return () => {
      clearTimeout(fallback);
      if (timer) clearInterval(timer);
      frames.forEach((_, j) => removeData(map, frameId(mainId, j)));
      swapRef.current?.setVisible(true);
      const last = useLayerStore.getState().playFrame;
      if (last) useLayerStore.getState().setDate(mainId, last);
    };
  }, [map, playing, mainId]);

  return null;
}

/** Tocar el mapa con una capa activa: valor aproximado leyendo el color del píxel (sin backend). */
function Probe() {
  const map = useGlobeStore((s) => s.map);
  const mainId = useLayerStore((s) => s.active[0]);
  const probe = useLayerStore((s) => s.probe);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!map || !mainId) return;
    const cfg = LAYER_BY_ID[mainId];
    if (cfg.kind !== 'gibs' || !cfg.legend) return;
    let seq = 0;
    const onClick = async (e: { lngLat: { lng: number; lat: number } }) => {
      const id = ++seq;
      const { lng, lat } = e.lngLat;
      const store = useLayerStore.getState();
      const date = store.playFrame ?? store.dates[mainId] ?? latestDate(cfg);
      if (!date) return;
      store.setProbe({ layerId: mainId, lng, lat, status: 'loading' });
      try {
        const [px, cm] = await Promise.all([readGibsPixel(cfg, date, lng, lat), loadColormap(cfg.legend!.colormap)]);
        if (id !== seq) return;
        if (!px || px.rgba[3] < 16 || !cm) return store.setProbe({ layerId: mainId, lng, lat, status: 'nodata' });
        const entry = lookupColor(cm, [px.rgba[0], px.rgba[1], px.rgba[2]]);
        if (!entry) return store.setProbe({ layerId: mainId, lng, lat, status: 'nodata' });
        store.setProbe({
          layerId: mainId,
          lng,
          lat,
          status: 'value',
          value: entryValue(entry),
          color: [entry[0], entry[1], entry[2]],
        });
      } catch {
        if (id === seq) store.setProbe({ layerId: mainId, lng, lat, status: 'error' });
      }
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, mainId]);

  // Marca del punto consultado.
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    (async () => {
      if (!probe) {
        markerRef.current?.remove();
        return;
      }
      const { Marker } = await import('maplibre-gl');
      if (cancelled) return;
      if (!markerRef.current) {
        const el = document.createElement('div');
        el.className = 'probe-marker';
        el.setAttribute('aria-hidden', 'true');
        markerRef.current = new Marker({ element: el, anchor: 'center' });
      }
      markerRef.current.setLngLat([probe.lng, probe.lat]).addTo(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [map, probe]);

  return null;
}

/** ?layer=<id>&ldate=YYYY-MM-DD (&risk=<tipo> con zonas de riesgo) para compartir lo que se está viendo. */
function LayerUrlSync() {
  const [params, setParams] = useQueryStates({ layer: parseAsString, ldate: parseAsString, ...riskParams }, urlOptions);
  const restored = useRef(false);
  const initial = useRef(params);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const { layer, ldate, risk } = initial.current;
    if (layer && (LAYER_IDS as readonly string[]).includes(layer)) {
      const cfg = LAYER_BY_ID[layer as LayerId];
      if (cfg.kind === 'vector' && risk) useRiskStore.getState().setKind(risk);
      useLayerStore.getState().setLayer(cfg.id, { date: snapDate(cfg, ldate) ?? undefined });
    }
  }, []);

  useEffect(() => {
    // El combinado es el valor por defecto: no se escribe en la URL.
    const riskOf = (id: LayerId | undefined) => {
      const kind = useRiskStore.getState().kind;
      return id && LAYER_BY_ID[id].kind === 'vector' && kind !== 'all' ? kind : null;
    };
    const offLayers = useLayerStore.subscribe((s, prev) => {
      const id = s.active[0];
      const date = id ? s.dates[id] : undefined;
      if (id === prev.active[0] && date === (id ? prev.dates[id] : undefined)) return;
      void setParams({
        layer: id ?? null,
        ldate: id && LAYER_BY_ID[id].kind === 'gibs' ? (date ?? null) : null,
        risk: riskOf(id),
      });
    });
    const offRisk = useRiskStore.subscribe((s, prev) => {
      if (s.kind === prev.kind) return;
      void setParams({ risk: riskOf(useLayerStore.getState().active[0]) });
    });
    return () => {
      offLayers();
      offRisk();
    };
  }, [setParams]);
  return null;
}

export default function LayerRuntime() {
  return (
    <>
      <UrlStateProvider>
        <LayerUrlSync />
      </UrlStateProvider>
      <MapSync />
      <Probe />
    </>
  );
}
