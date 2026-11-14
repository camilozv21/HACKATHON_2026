'use client';

import clsx from 'clsx';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCoords } from '@/lib/geo';
import { useGlobeStore } from './store';

/** Nombre del lugar que se está mirando (centro del mapa), discreto en la zona superior. */
export function PlacePill() {
  const t = useTranslations('globe');
  const center = useGlobeStore((s) => s.center);
  const autoRotating = useGlobeStore((s) => s.autoRotating);
  const ready = useGlobeStore((s) => s.status === 'ready');
  if (!ready) return null;

  const label =
    center.label ?? (center.labelStatus === 'loading' || center.labelStatus === 'idle' ? '…' : t('unnamedPlace'));

  return (
    <div
      aria-live="polite"
      className="glass pointer-events-none flex max-w-[min(78vw,26rem)] items-center gap-2 rounded-full px-3 py-1 shadow-lg"
    >
      {autoRotating ? (
        <p className="text-xs font-medium whitespace-nowrap text-ink-muted">{t('exploreHint')}</p>
      ) : (
        <>
          <MapPin aria-hidden className="size-3.5 shrink-0 text-field-400" />
          <p className={clsx('min-w-0 truncate text-xs font-semibold', center.labelStatus === 'loading' && 'opacity-70')}>
            {label}
            <span className="ml-2 font-normal whitespace-nowrap text-ink-muted tabular-nums">{formatCoords(center, 2)}</span>
          </p>
        </>
      )}
    </div>
  );
}
