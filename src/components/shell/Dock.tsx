'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, type ReactNode } from 'react';
import { useAgentStore } from '@/features/agent/store';
import { useFieldStore } from '@/features/field/store';
import { useGlobeStore } from '@/features/globe/store';
import { useLayerStore } from '@/features/layers/store';
import { useRadioStore } from '@/features/radio/store';
import { useRegionStore } from '@/features/region/store';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';

const RadioMini = dynamic(() => import('@/features/radio/RadioMini'), { ssr: false });

/**
 * Dock inferior (abajo al centro): mini reproductor de radio encima de la barra del chat.
 * Publica su altura en --dock-h para que los demás controles se apilen encima sin superponerse.
 * En móvil se oculta mientras otro panel ocupa la parte de abajo (finca, región, catálogo, dibujo).
 */
export function Dock({ chat }: { chat?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const ready = useGlobeStore((s) => s.status === 'ready');
  const fieldMode = useFieldStore((s) => s.mode);
  const sheetOpen = useFieldStore((s) => s.sheet !== null);
  const regionOpen = useRegionStore((s) => s.target !== null);
  const catalogOpen = useLayerStore((s) => s.catalogOpen);
  const hasStation = useRadioStore((s) => s.tunedId !== null);
  const chatOpen = useAgentStore((s) => s.expanded && !s.flying);
  const hidden = chatOpen || fieldMode !== 'idle' || (!isDesktop && (sheetOpen || regionOpen || catalogOpen));

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || hidden) {
      root.style.setProperty('--dock-h', '0px');
      return;
    }
    const ro = new ResizeObserver(() => root.style.setProperty('--dock-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hidden]);

  return (
    <div
      ref={ref}
      hidden={hidden}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pr-[calc(var(--map-pad-right,0px)+0.75rem)] pb-[calc(var(--safe-bottom)+0.5rem)] pl-3"
    >
      <div className="flex w-full max-w-xl flex-col gap-2">
        {ready && hasStation && <RadioMini />}
        {chat}
      </div>
    </div>
  );
}
