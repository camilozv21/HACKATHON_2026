'use client';

import { addProtocol, AttributionControl, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { configureTileCache, GIBS_PROTOCOL, loadGibsTile } from '@/features/layers/tileCache';
import { env } from '@/lib/env';
import { clamp } from '@/lib/geo';
import { whenIdle } from '@/lib/idle';
import { prefersReducedMotion } from '@/lib/hooks/useMediaQuery';
import { AutoRotator } from './autoRotate';
import { onFlyStart } from './camera';
import { attachCenterTracker } from './centerTracker';
import { gibsTileUrl, resolveTrueColor } from './gibs';
import { getDeviceProfile, hasWebGL } from './perf';
import { prefetchDestination } from './prefetch';
import { globeRuntime } from './runtime';
import { getMap, useGlobeStore } from './store';
import {
  buildBaseStyle,
  CROSSFADE,
  firstOverlayId,
  LABEL_LAYER_IDS,
  LABELS_SOURCE,
  labelLayers,
  LAYER,
  nameField,
  SOURCE,
} from './style';

setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());
// Teselas NASA GIBS de las capas de datos (gibs://…): caché en memoria, GIBS no deja cachear al navegador.
addProtocol(GIBS_PROTOCOL, loadGibsTile);

/** Zoom con el que el globo completo ocupa ~72 % del lado menor de la pantalla. */
function fitGlobeZoom(w: number, h: number) {
  // Diámetro del globo en px ≈ 512·2^z / π
  return clamp(Math.log2((0.72 * Math.min(w, h) * Math.PI) / 512), 0, 2.2);
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export default function GlobeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const t = useTranslations('globe');
  const localeRef = useRef(locale);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const container: HTMLDivElement = host;
    const store = useGlobeStore.getState();

    if (!hasWebGL()) {
      store.setStatus('no-webgl');
      return;
    }

    store.setStatus('loading');
    let teardown: (() => void) | null = null;
    // El mapa se crea cuando el navegador está ocioso: primero se pinta el HTML (skeleton + textos).
    const cancelIdle = whenIdle(() => {
      teardown = createMap();
    }, 1200);
    return () => {
      cancelIdle();
      teardown?.();
    };

    function createMap(): (() => void) | null {
      const abort = new AbortController();
      const { clientWidth: w, clientHeight: h } = container;
      const initial = store.center;
      const profile = getDeviceProfile();
      configureTileCache({ maxBytes: (profile.lowEnd ? 8 : 16) * 1024 * 1024 });

      let map: MapLibreMap;
      try {
        map = new MapLibreMap({
          container,
          style: buildBaseStyle({
            maptilerKey: env.maptilerKey,
            locale: localeRef.current,
            trueColor: null,
            baseImagery: store.baseImagery,
            showLabels: store.showLabels,
            saveData: profile.saveData,
            includeLabels: false,
          }),
          center: [initial.lng, initial.lat],
          zoom: fitGlobeZoom(w, h),
          minZoom: 0,
          maxZoom: 19.5,
          maxPitch: 60,
          attributionControl: false,
          // Rendimiento: menos píxeles en pantallas muy densas, caché acotada y fundidos cortos.
          pixelRatio: profile.pixelRatio,
          maxTileCacheSize: profile.maxTileCacheSize,
          fadeDuration: 100,
          cancelPendingTileRequestsWhileZooming: true,
          reduceMotion: prefersReducedMotion(),
          // Gestos: inercia suave, pinch-zoom y rotación con dos dedos; sin pitch accidental.
          touchPitch: false,
          dragPan: { linearity: 0.22, easing: easeOutCubic, maxSpeed: 1600, deceleration: 2400 },
          canvasContextAttributes: {
            antialias: false,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
          },
          validateStyle: process.env.NODE_ENV !== 'production',
        });
      } catch {
        store.setStatus('no-webgl');
        return null;
      }

      map.addControl(new AttributionControl({ compact: true }), 'bottom-left');
      const canvas = map.getCanvas();
      canvas.setAttribute('aria-label', t('canvasLabel'));
      canvas.setAttribute('role', 'application');

      // Los errores de tiles (p. ej. 404 de un día sin datos) no deben llenar la consola.
      map.on('error', (e) => {
        const err = e as unknown as { sourceId?: string; error?: { message?: string } };
        if (err.sourceId) return;
        console.warn('[globe]', err.error?.message ?? e);
      });

      // Pérdida de contexto WebGL (frecuente en móviles con poca memoria): MapLibre lo restaura solo.
      const onContextLost = () => useGlobeStore.getState().setStatus('context-lost');
      const onContextRestored = () => useGlobeStore.getState().setStatus('ready');
      map.on('webglcontextlost', onContextLost);
      map.on('webglcontextrestored', onContextRestored);

      const rotator = new AutoRotator(map);
      globeRuntime.setRotator(rotator);
      const detachTracker = attachCenterTracker(map, () => localeRef.current);

      // Al iniciar un vuelo: detener la rotación y precargar los tiles del destino.
      const offFly = onFlyStart((target) => {
        rotator.interrupt();
        if (!profile.saveData && target.zoom != null) {
          prefetchDestination(
            { ...target, zoom: target.zoom },
            { w: container.clientWidth, h: container.clientHeight },
          );
        }
      });

      // Pestaña oculta: sin rotación (y por tanto sin render continuo).
      const onVisibility = () => globeRuntime.setPaused('hidden', document.hidden);
      document.addEventListener('visibilitychange', onVisibility);

      map.once('load', () => {
        // La atribución compacta arranca desplegada y en móvil tapaba la zona inferior: queda el botón (i).
        container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        useGlobeStore.getState().setStatus('ready');
        const c = map.getCenter();
        useGlobeStore.getState().setCenter({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
      });

      // Tras el primer render completo: etiquetas, rotación y color real de ayer, en tiempo ocioso.
      map.once('idle', () => {
        whenIdle(() => {
          if (abort.signal.aborted) return;
          if (!map.getSource(SOURCE.labels)) {
            map.addSource(SOURCE.labels, LABELS_SOURCE);
            const { showLabels, showBoundaries } = useGlobeStore.getState();
            for (const layer of labelLayers(localeRef.current, showLabels, showBoundaries)) map.addLayer(layer);
          }
          rotator.spin();
        }, 800);

        // Color real de ayer (VIIRS): se añade cuando sabemos qué fecha tiene datos.
        resolveTrueColor(abort.signal)
          .then(({ layer, date }) => {
            if (abort.signal.aborted || map.getSource(SOURCE.trueColor)) return;
            map.addSource(SOURCE.trueColor, {
              type: 'raster',
              tiles: [gibsTileUrl(layer, date)],
              tileSize: 256,
              maxzoom: layer.level,
              attribution: `<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> · VIIRS ${date}`,
            });
            const visible = useGlobeStore.getState().baseImagery === 'truecolor';
            map.addLayer(
              {
                id: LAYER.trueColor,
                type: 'raster',
                source: SOURCE.trueColor,
                maxzoom: profile.saveData ? 24 : CROSSFADE.end + 0.5,
                layout: { visibility: visible ? 'visible' : 'none' },
                paint: {
                  'raster-opacity': profile.saveData
                    ? 1
                    : ['interpolate', ['linear'], ['zoom'], CROSSFADE.start, 1, CROSSFADE.end, 0],
                  'raster-fade-duration': 120,
                },
              },
              map.getLayer(LAYER.satellite) ? LAYER.satellite : firstOverlayId(map),
            );
            useGlobeStore.getState().setTrueColorDate(date);
          })
          .catch(() => undefined);
      });

      useGlobeStore.getState().setMap(map);
      // Gancho para pruebas e2e y depuración (no expone datos sensibles).
      (window as unknown as { __fieldShiftMap?: MapLibreMap }).__fieldShiftMap = map;

      return () => {
        delete (window as unknown as { __fieldShiftMap?: MapLibreMap }).__fieldShiftMap;
        abort.abort();
        offFly();
        detachTracker();
        document.removeEventListener('visibilitychange', onVisibility);
        rotator.dispose();
        globeRuntime.setRotator(null);
        useGlobeStore.getState().setMap(null);
        useGlobeStore.getState().setStatus('idle');
        map.remove();
      };
    }
    // El mapa se crea una sola vez; el idioma de las etiquetas se actualiza en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambio de idioma: solo se reescribe el campo de texto de las etiquetas.
  useEffect(() => {
    const map = getMap();
    if (!map || !map.isStyleLoaded()) return;
    const field = nameField(locale);
    for (const id of LABEL_LAYER_IDS) {
      if (map.getLayer(id) && map.getLayer(id)?.type === 'symbol')
        map.setLayoutProperty(id, 'text-field', field);
    }
  }, [locale]);

  // maplibre-gl.css fuerza position:relative en el contenedor del mapa, por eso va dentro de un wrapper absoluto.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" data-testid="globe" />
    </div>
  );
}
