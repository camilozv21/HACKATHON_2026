'use client';

import { Loader2, MapPin, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useGlobeStore } from '@/features/globe/store';
import { useLocateUser, useUserLocation } from './useUserLocation';

/**
 * Chip amable y no intrusivo para pedir la ubicación exacta solo cuando la persona lo toca.
 * Pedir el permiso sin contexto al cargar suele terminar en rechazo.
 */
export function PreciseLocationChip() {
  const t = useTranslations('location');
  const tc = useTranslations('common');
  const ready = useGlobeStore((s) => s.status === 'ready');
  const { permission, precise, status } = useUserLocation();
  const locate = useLocateUser();
  const [dismissed, setDismissed] = useState(false);

  if (!ready || dismissed || precise || permission !== 'prompt') return null;

  const locating = status === 'locating';

  return (
    <div className="glass pointer-events-auto flex items-center gap-1 rounded-full py-1 pr-1 pl-1 shadow-lg">
      <button
        type="button"
        onClick={() => void locate()}
        disabled={locating}
        aria-label={t('usePreciseHint')}
        title={t('usePreciseHint')}
        className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium hover:bg-white/10"
      >
        {locating ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <MapPin aria-hidden className="size-4 text-field-400" />
        )}
        {locating ? t('locating') : t('usePrecise')}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={tc('close')}
        className="grid size-11 place-items-center rounded-full text-ink-muted hover:bg-white/10"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
