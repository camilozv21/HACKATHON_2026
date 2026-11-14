'use client';

import { AlertTriangle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { periodLabel } from '@/features/time/period';
import { useTimeStore } from '@/features/time/store';
import { useEventsStore, visibleEvents } from './store';

/** Aviso arriba al centro con los eventos activos: cuántos y de qué periodo. Abre la lista. */
export function EventsChip() {
  const t = useTranslations('events');
  const locale = useLocale();
  const visible = useEventsStore((s) => s.visible);
  const status = useEventsStore((s) => s.status);
  const count = useEventsStore((s) => visibleEvents(s).length);
  const sel = useTimeStore((s) => s.sel);
  if (!visible) return null;
  const period = sel ? periodLabel(sel, locale) : t('recent');
  return (
    <button
      type="button"
      onClick={() => useEventsStore.getState().setListOpen(true)}
      aria-label={`${t('chipAria')}: ${t('chip', { count, period })}`}
      className="glass pointer-events-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg"
    >
      <AlertTriangle aria-hidden className="size-4 text-sun" />
      {status === 'loading' && !count ? t('loading') : status === 'error' ? t('error') : t('chip', { count, period })}
    </button>
  );
}
