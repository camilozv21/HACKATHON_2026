'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { GlobeSkeleton } from './GlobeSkeleton';
import { isDebug } from './perf';
import { useGlobeStore } from './store';

const GlobeCanvas = dynamic(() => import('./GlobeCanvas'), { ssr: false, loading: () => null });
const DebugOverlay = dynamic(() => import('./DebugOverlay'), { ssr: false });
// Solo se ve sin WebGL o al perder el contexto: no va en el JS inicial.
const GlobeFallback = dynamic(() => import('./GlobeFallback').then((m) => m.GlobeFallback), { ssr: false });

const noop = () => () => {};

export function Globe() {
  const hideSkeleton = useGlobeStore((s) => s.status === 'ready' || s.status === 'no-webgl');
  const needsFallback = useGlobeStore((s) => s.status === 'no-webgl' || s.status === 'context-lost');
  const debug = useSyncExternalStore(noop, isDebug, () => false);
  return (
    <div className="starfield absolute inset-0 overflow-hidden">
      <GlobeSkeleton hidden={hideSkeleton} />
      <GlobeCanvas />
      {needsFallback && <GlobeFallback />}
      {debug && <DebugOverlay />}
    </div>
  );
}
