'use client';

import { History, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { periodLabel } from './period';
import { useTimeStore } from './store';

/**
 * Dentro del panel de la finca (en móvil la pastilla de arriba queda tapada por el sheet): botón "Revisar una
 * fecha pasada" o, si ya se está viendo una, la fecha con "cambiar" y "volver a hoy".
 */
export function TimeBanner() {
  const t = useTranslations('time');
  const locale = useLocale();
  const sel = useTimeStore((s) => s.sel);
  const { setPickerOpen, set } = useTimeStore.getState();

  if (!sel) {
    return (
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-2 self-start rounded-full bg-white/5 px-3.5 text-sm font-semibold ring-1 ring-line hover:bg-white/10"
      >
        <History aria-hidden className="size-4 text-sun" />
        {t('reviewPast')}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-2xl bg-sun py-1 pr-1 pl-3 text-space">
      <History aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-bold">{t('viewing', { period: periodLabel(sel, locale) })}</p>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('changeDate')}
        className="min-h-11 rounded-full px-3 text-sm font-semibold underline underline-offset-2"
      >
        {t('change')}
      </button>
      <button type="button" onClick={() => set(null)} aria-label={t('backToToday')} className="grid size-11 place-items-center rounded-full hover:bg-black/10">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
