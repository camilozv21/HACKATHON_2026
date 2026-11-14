'use client';

import { Map as MapLibreMap } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { gibsTileUrl } from '@/features/globe/gibs';
import { getDeviceProfile } from '@/features/globe/perf';
import { useGlobeStore } from '@/features/globe/store';
import { buildBaseStyle } from '@/features/globe/style';
import { env } from '@/lib/env';
import { prefersReducedMotion } from '@/lib/hooks/useMediaQuery';
import { latestDate } from './dates';
import { LAYER_BY_ID } from './layers.config';
import { RasterSwap } from './rasterSwap';
import { useLayerStore } from './store';
import { cachedTileUrl } from './tileCache';

/**
 * Comparación de 2 capas en desktop con cortina deslizable. La segunda capa vive en un segundo mapa
 * no interactivo que copia la cámara del principal y se recorta con clip-path (sin tocar el mapa principal).
 */
export default function CompareCurtain() {
  const t = useTranslations('layers');
  const locale = useLocale();
  const main = useGlobeStore((s) => s.map);
  const [leftId, rightId] = useLayerStore((s) => s.active);
  const rightDate = useLayerStore((s) => (rightId ? s.dates[rightId] : undefined));
  const curtain = useLayerStore((s) => s.curtain);
  const setCurtain = useLayerStore((s) => s.setCurtain);
  const hostRef = useRef<HTMLDivElement>(null);
  const [second, setSecond] = useState<MapLibreMap | null>(null);
  const swapRef = useRef<RasterSwap | null>(null);

  // Segundo mapa (una sola vez) sincronizado con la cámara del principal.
  useEffect(() => {
    if (!main || !hostRef.current) return;
    const m = new MapLibreMap({
      container: hostRef.current,
      style: buildBaseStyle({
        maptilerKey: env.maptilerKey,
        locale,
        trueColor: null,
        baseImagery: 'bluemarble',
        showLabels: false,
        includeLabels: false,
      }),
      interactive: false,
      attributionControl: false,
      pixelRatio: getDeviceProfile().pixelRatio,
      fadeDuration: 0,
      center: main.getCenter(),
      zoom: main.getZoom(),
      bearing: main.getBearing(),
      pitch: main.getPitch(),
    });
    const sync = () =>
      m.jumpTo({
        center: main.getCenter(),
        zoom: main.getZoom(),
        bearing: main.getBearing(),
        pitch: main.getPitch(),
        padding: main.getPadding(),
      });
    sync();
    main.on('move', sync);
    m.once('load', () => setSecond(m));
    return () => {
      main.off('move', sync);
      setSecond(null);
      m.remove();
    };
  }, [main, locale]);

  // Capa de comparación en el segundo mapa (misma caché y mismo cruce entre fechas que la principal).
  useEffect(() => {
    if (!second) return;
    const swap = new RasterSwap(second);
    swapRef.current = swap;
    return () => {
      swapRef.current = null;
      // El mapa puede estar ya destruido (su efecto limpia antes que este).
      try {
        swap.clear();
      } catch {
        /* nada que quitar */
      }
    };
  }, [second]);

  useEffect(() => {
    const swap = swapRef.current;
    if (!second || !swap) return;
    const cfg = rightId ? LAYER_BY_ID[rightId] : null;
    if (!rightId || !cfg || cfg.kind !== 'gibs' || !cfg.gibs) {
      swap.clear();
      return;
    }
    const date = rightDate ?? latestDate(cfg);
    if (!date) return;
    if (!rightDate) useLayerStore.getState().setDate(rightId, date);
    swap.show({
      key: `cmp-${rightId}`,
      url: cachedTileUrl(gibsTileUrl({ id: cfg.gibs.id, level: cfg.gibs.level, format: cfg.gibs.format }, date)),
      opacity: cfg.defaultOpacity,
      maxzoom: cfg.gibs.level,
      fadeMs: prefersReducedMotion() ? 0 : 300,
    });
  }, [second, rightId, rightDate]);

  const drag = (clientX: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCurtain(Math.min(0.95, Math.max(0.05, (clientX - rect.left) / rect.width)));
  };

  if (!leftId || !rightId) return null;
  const pct = `${Math.round(curtain * 100)}%`;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[5]" style={{ clipPath: `inset(0 0 0 ${pct})` }}>
        <div ref={hostRef} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 z-[6] w-0" style={{ left: pct }}>
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white/80 shadow-[0_0_8px_rgb(0_0_0/0.8)]" />
        <span className="glass absolute top-24 right-3 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap">
          {t(`items.${leftId}.name`)}
        </span>
        <span className="glass absolute top-24 left-3 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap">
          {t(`items.${rightId}.name`)}
        </span>
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('curtain')}
          aria-valuemin={5}
          aria-valuemax={95}
          aria-valuenow={Math.round(curtain * 100)}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && drag(e.clientX)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setCurtain(Math.max(0.05, curtain - 0.05));
            if (e.key === 'ArrowRight') setCurtain(Math.min(0.95, curtain + 0.05));
          }}
          className="pointer-events-auto absolute top-1/2 -left-6 grid size-12 -translate-y-1/2 cursor-ew-resize touch-none place-items-center rounded-full bg-white text-black shadow-xl"
        >
          <span aria-hidden className="text-lg font-bold">
            ⇆
          </span>
        </div>
      </div>
    </>
  );
}
