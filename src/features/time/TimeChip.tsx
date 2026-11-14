'use client';

import { History, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { periodLabel } from './period';
import { useTimeStore } from './store';

/**
 * Pastilla de la máquina del tiempo (arriba al centro). Discreta en "hoy"; destacada cuando se está viendo
 * una fecha pasada, para que nunca se confunda con los datos actuales.
 */
export function TimeChip() {
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
        className="glass pointer-events-auto flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-muted shadow-lg hover:text-ink"
      >
        <History aria-hidden className="size-4" />
        {t('chip')}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto flex items-center rounded-full bg-sun text-space shadow-lg ring-2 ring-sun/40">
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-1.5 rounded-l-full pr-1 pl-3 text-sm font-bold"
      >
        <History aria-hidden className="size-4" />
        {t('viewing', { period: periodLabel(sel, locale) })}
      </button>
      <button
        type="button"
        onClick={() => set(null)}
        aria-label={t('backToToday')}
        className="grid size-11 place-items-center rounded-r-full hover:bg-black/10"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
