'use client';

import { useEffect, useRef } from 'react';
import { tileCacheStats } from '@/features/layers/tileCache';
import { useGlobeStore } from './store';

const TILE_HOSTS = /gibs\.earthdata|arcgisonline|maptiler|openfreemap|elevation-tiles/;

type PerfWindow = Window & {
  __fieldShiftPerf?: {
    measureFps: (ms?: number) => Promise<{ avg: number; p95FrameMs: number; frames: number }>;
    tileCache: typeof tileCacheStats;
  };
};

/** Mide fps durante `ms` milisegundos con requestAnimationFrame. */
export function measureFps(ms = 3000): Promise<{ avg: number; p95FrameMs: number; frames: number }> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let last = performance.now();
    const start = last;
    const tick = (now: number) => {
      deltas.push(now - last);
      last = now;
      if (now - start < ms) requestAnimationFrame(tick);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        resolve({
          avg: Math.round((deltas.length / (now - start)) * 1000 * 10) / 10,
          p95FrameMs: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
          frames: deltas.length,
        });
      }
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Modo ?debug=1: fps, tiles pedidos por red (y KB), tiles listos en el mapa, caché GIBS, memoria JS, pixelRatio y zoom.
 * Escribe directamente en el DOM cada 500 ms: no provoca re-renders de React.
 */
export default function DebugOverlay() {
  const map = useGlobeStore((s) => s.map);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    (window as PerfWindow).__fieldShiftPerf = { measureFps, tileCache: tileCacheStats };
    let frames = 0;
    let lastFpsAt = performance.now();
    let fps = 0;
    let raf = 0;
    let netTiles = 0;
    let netKB = 0;
    let readyTiles = 0;
    let tileErrors = 0;

    const loop = (now: number) => {
      frames++;
      if (now - lastFpsAt >= 500) {
        fps = (frames * 1000) / (now - lastFpsAt);
        frames = 0;
        lastFpsAt = now;
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        const tc = tileCacheStats();
        if (ref.current) {
          ref.current.textContent = [
            `fps        ${fps.toFixed(0)}`,
            `tiles red  ${netTiles} (${(netKB / 1024).toFixed(1)} MB)`,
            `tiles ok   ${readyTiles}  err ${tileErrors}`,
            `caché GIBS ${tc.tiles} (${(tc.bytes / 1048576).toFixed(1)}/${(tc.maxBytes / 1048576).toFixed(0)} MB) aciertos ${tc.hits}/${tc.hits + tc.misses}`,
            `heap JS    ${mem ? (mem.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/d'}`,
            `pixelRatio ${map?.getPixelRatio().toFixed(2) ?? '-'}`,
            `zoom       ${map?.getZoom().toFixed(2) ?? '-'}`,
          ].join('\n');
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        if (!TILE_HOSTS.test(e.name)) continue;
        netTiles++;
        netKB += (e.transferSize || e.encodedBodySize || 0) / 1024;
      }
    });
    po.observe({ type: 'resource', buffered: true });

    const onData = (e: object) => {
      const d = e as { dataType?: string; tile?: unknown };
      if (d.dataType === 'source' && d.tile) readyTiles++;
    };
    const onError = (e: object) => {
      if ((e as { sourceId?: string }).sourceId) tileErrors++;
    };
    map?.on('data', onData);
    map?.on('error', onError);

    return () => {
      cancelAnimationFrame(raf);
      po.disconnect();
      map?.off('data', onData);
      map?.off('error', onError);
    };
  }, [map]);

  return (
    <pre
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-[calc(var(--safe-top)+4rem)] left-2 z-[70] rounded-lg bg-black/75 px-3 py-2 font-mono text-[11px] leading-4 text-field-300"
    />
  );
}
