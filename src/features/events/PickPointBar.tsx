'use client';

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { getMap } from '@/features/globe/store';
import { reverseGeocode } from '@/lib/geocoding';
import { useEventsStore } from './store';

/** Elegir el punto del reporte: la mira queda fija en el centro y la persona mueve el mapa debajo. */
export function PickPointBar() {
  const t = useTranslations('events.pick');
  const locale = useLocale();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useEventsStore.getState().setPicking(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const confirm = () => {
    const c = getMap()?.getCenter();
    const s = useEventsStore.getState();
    if (c) {
      s.updateReport({ lat: c.lat, lon: c.lng, place: null });
      void reverseGeocode({ lng: c.lng, lat: c.lat, zoom: 12 }, locale)
        .then((place) => useEventsStore.getState().setReportPlace(c.lat, c.lng, place))
        .catch(() => undefined);
    }
    s.setPicking(false);
  };

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-30">
        <div className="map-center">
          <svg width="56" height="56" viewBox="0 0 56 56" className="drop-shadow-[0_0_6px_rgb(0_0_0/0.8)]">
            <circle cx="28" cy="28" r="14" fill="none" stroke="#ffd166" strokeWidth="2" />
            <circle cx="28" cy="28" r="2.5" fill="#ffd166" />
            <path d="M28 4v10M28 42v10M4 28h10M42 28h10" stroke="#ffd166" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <section
        role="region"
        aria-label={t('hint')}
        className="panel pointer-events-auto fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.75rem)] z-40 mx-auto flex max-w-md flex-col gap-2 rounded-3xl p-4 shadow-2xl"
      >
        <p className="text-sm font-medium" aria-live="polite">
          {t('hint')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => useEventsStore.getState().setPicking(false)}
            className="min-h-12 flex-1 rounded-full bg-white/5 px-4 font-semibold ring-1 ring-line hover:bg-white/10"
          >
            {t('cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={confirm}
            className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-bold text-black hover:bg-field-400"
          >
            <Check aria-hidden className="size-5" />
            {t('use')}
          </button>
        </div>
      </section>
    </>
  );
}
