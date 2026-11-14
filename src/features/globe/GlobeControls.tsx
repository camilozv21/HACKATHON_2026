'use client';

import { LocateFixed, Loader2, Minus, Navigation2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { useFinePointer } from '@/lib/hooks/useMediaQuery';
import { resetNorth, zoomBy } from './camera';
import { useGlobeStore } from './store';

/** Controles flotantes abajo a la derecha: mi ubicación, brújula y zoom (+/- solo con puntero fino). */
export function GlobeControls({ onLocate }: { onLocate: () => Promise<unknown> }) {
  const t = useTranslations('globe');
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const finePointer = useFinePointer();
  const compassRef = useRef<SVGSVGElement>(null);
  const [locating, setLocating] = useState(false);

  // La brújula gira con el mapa tocando el DOM directamente (sin re-render de React).
  useEffect(() => {
    if (!map) return;
    const update = () => {
      if (compassRef.current) compassRef.current.style.transform = `rotate(${-map.getBearing()}deg)`;
    };
    update();
    map.on('rotate', update);
    return () => {
      map.off('rotate', update);
    };
  }, [map]);

  const locate = async () => {
    setLocating(true);
    try {
      await onLocate();
    } finally {
      setLocating(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      {finePointer && (
        <div className="flex flex-col gap-2">
          <IconButton label={t('zoomIn')} onClick={() => zoomBy(1)}>
            <Plus aria-hidden className="size-5" />
          </IconButton>
          <IconButton label={t('zoomOut')} onClick={() => zoomBy(-1)}>
            <Minus aria-hidden className="size-5" />
          </IconButton>
        </div>
      )}
      <IconButton label={t('resetNorth')} onClick={resetNorth}>
        <Navigation2 ref={compassRef} aria-hidden className="size-5 fill-current text-risk-high" />
      </IconButton>
      <IconButton label={t('locateMe')} onClick={locate} disabled={locating}>
        {locating ? (
          <Loader2 aria-hidden className="size-5 animate-spin" />
        ) : (
          <LocateFixed aria-hidden className="size-5" />
        )}
      </IconButton>
    </div>
  );
}
