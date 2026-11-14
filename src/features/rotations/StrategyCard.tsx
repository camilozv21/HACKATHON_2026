'use client';

import clsx from 'clsx';
import { ChevronRight, Home, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RotationStrategy } from '@/lib/api/contract';
import type { Ranked } from '@/features/priorities/ranking';
import { ConfidenceChip, CropSequence, Diff, ScoreBars, Timeline } from './parts';

type Item = Ranked<RotationStrategy>;

/** Tarjeta de una estrategia: nombre, línea de tiempo, puntaje según TUS prioridades, 7 barras, por qué y confianza. */
export function StrategyCard({ item, current, onDetail }: { item: Item; current?: Item; onDetail: () => void }) {
  const t = useTranslations('rotations');
  const s = item.strategy;
  const isCurrent = s.isCurrent;
  const diff = current && !isCurrent ? item.total - current.total : null;

  return (
    <article
      aria-labelledby={`card-${s.id}`}
      className={clsx(
        'flex h-full flex-col gap-3 rounded-3xl p-4 ring-1',
        item.rank === 1 ? 'bg-field-500/10 ring-field-500/60' : isCurrent ? 'bg-sky-glow/5 ring-sky-glow/40' : 'bg-white/5 ring-line',
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={clsx(
            'grid size-9 shrink-0 place-items-center rounded-full text-base font-bold tabular-nums',
            item.rank === 1 ? 'bg-field-500 text-black' : 'bg-white/10',
          )}
        >
          <span className="sr-only">{t('rank', { rank: item.rank })}</span>
          <span aria-hidden>{item.rank}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h4 id={`card-${s.id}`} className="leading-snug font-bold">
            {s.name}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {isCurrent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-glow/15 px-2 py-0.5 text-xs font-semibold text-sky-glow">
                <Home aria-hidden className="size-3.5" />
                {t('current')}
              </span>
            )}
            {item.rank === 1 && !isCurrent && (
              <span className="rounded-full bg-field-500/20 px-2 py-0.5 text-xs font-semibold text-field-300">{t('bestMatch')}</span>
            )}
            <span className="text-xs text-ink-faint">{t('months', { n: s.durationMonths })}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl leading-none font-bold tabular-nums">{item.total}</p>
          <p className="text-[11px] text-ink-muted">{t('ofHundred')}</p>
          {diff != null && <Diff value={diff} className="text-xs font-semibold" />}
        </div>
      </header>

      <CropSequence seasons={s.seasons} />
      <Timeline strategy={s} compact />

      <div className="lite:hidden">
        <p className="mb-1.5 text-xs font-semibold text-ink-muted">{isCurrent ? t('scoresTitleCurrent') : t('scoresTitle')}</p>
        <ScoreBars scores={s.scores} base={isCurrent ? undefined : current?.strategy.scores} />
      </div>

      <div className="text-sm">
        <p className="font-semibold">{isCurrent ? t('whyCurrent') : t('why')}</p>
        <p className="mt-0.5 text-ink-muted">{s.rationale}</p>
      </div>

      {s.market && (
        <p className="flex items-start gap-2 rounded-xl bg-white/5 p-2.5 text-sm ring-1 ring-line">
          <Store aria-hidden className="mt-0.5 size-4 shrink-0 text-field-300" />
          <span>
            <span className="font-semibold">{t('marketChip')}: </span>
            {s.market.summary}
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <ConfidenceChip confidence={s.confidence} />
        <span>{t(`confidenceWhy.${s.confidence}`)}</span>
      </div>

      <button
        type="button"
        onClick={onDetail}
        data-detail-btn={s.id}
        aria-label={t('detailFor', { name: s.name })}
        className="mt-auto flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line hover:bg-white/15"
      >
        {t('detail')}
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </article>
  );
}
