'use client';

import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { levelOf } from '@/lib/points';
import { LevelIcon } from './LevelIcon';
import { shownPoints, usePointsStore } from './store';

/** Fila "Puntaje de tu finca" en el resumen de Mi finca: abre "Tu puntaje" (crear cuenta, cómo ganar puntos). */
export function MyFarmScore() {
  const t = useTranslations('points');
  const locale = useLocale();
  const points = usePointsStore(shownPoints);
  const signedIn = usePointsStore((s) => s.account !== null);
  const level = levelOf(points).id;
  const n = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO').format(points);
  return (
    <button
      type="button"
      onClick={() => usePointsStore.getState().setDialogOpen(true)}
      aria-haspopup="dialog"
      className="flex min-h-12 items-center gap-3 rounded-2xl bg-sun/10 px-3 py-2 text-left ring-1 ring-sun/40 hover:bg-sun/15"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sun/20 text-sun">
        <LevelIcon level={level} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {signedIn ? t('myFarm.title', { points: n, level: t(`levels.${level}`) }) : t('myFarm.guestTitle', { points: n })}
        </span>
        <span className="block text-xs text-ink-muted">{signedIn ? t('myFarm.hint') : t('myFarm.guestHint')}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
    </button>
  );
}
