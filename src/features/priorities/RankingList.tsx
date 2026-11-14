'use client';

import clsx from 'clsx';
import { Calculator, ChevronDown, Home } from 'lucide-react';
import { motion, MotionConfig } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { RotationStrategy } from '@/lib/api/contract';
import { PriorityIcon } from './PriorityIcon';
import type { Ranked } from './ranking';

type Item = Ranked<RotationStrategy>;

/**
 * Lista de opciones ordenadas por el puntaje según las prioridades. Al cambiar prioridades se reordena con una
 * animación de posición (Motion `layout`; sin animación si la persona pide menos movimiento).
 */
export function RankingList({ ranked }: { ranked: Item[] }) {
  const t = useTranslations('priorities.ranking');
  const current = ranked.find((r) => r.strategy.isCurrent);

  return (
    <MotionConfig reducedMotion="user">
      <ol className="flex flex-col gap-2">
        {ranked.map((r) => {
          const diff = current && !r.strategy.isCurrent ? r.total - current.total : null;
          return (
            <motion.li
              key={r.strategy.id}
              layout="position"
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              className={clsx(
                'flex items-center gap-3 rounded-2xl p-3 ring-1',
                r.rank === 1 ? 'bg-field-500/10 ring-field-500/50' : 'bg-white/5 ring-line',
              )}
            >
              <span
                className={clsx(
                  'grid size-9 shrink-0 place-items-center rounded-full text-base font-bold tabular-nums',
                  r.rank === 1 ? 'bg-field-500 text-black' : 'bg-white/10',
                )}
              >
                <span className="sr-only">{t('rank', { rank: r.rank })}</span>
                <span aria-hidden>{r.rank}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="leading-snug font-semibold">{r.strategy.name}</p>
                {r.strategy.isCurrent && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-sky-glow">
                    <Home aria-hidden className="size-3.5" />
                    {t('current')}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <div aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-field-400"
                      initial={false}
                      animate={{ width: `${r.total}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{t('points', { total: r.total })}</span>
                </div>
                {diff != null && diff !== 0 && (
                  <p className={clsx('mt-0.5 text-xs tabular-nums', diff > 0 ? 'text-field-300' : 'text-ink-muted')}>
                    {t('vsCurrent', { sign: diff > 0 ? '+' : '−', diff: Math.abs(diff) })}
                  </p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </MotionConfig>
  );
}

/** Anuncia al lector de pantalla cuando cambia la primera opción (no en cada render). */
export function RankingAnnouncer({ ranked }: { ranked: Item[] }) {
  const t = useTranslations('priorities.ranking');
  const top = ranked[0];
  const [msg, setMsg] = useState('');
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!top) return;
    const key = `${top.strategy.id}:${top.total}`;
    if (prev.current !== null && prev.current !== key) {
      const id = setTimeout(() => setMsg(t('live', { name: top.strategy.name, total: top.total })), 0);
      prev.current = key;
      return () => clearTimeout(id);
    }
    prev.current = key;
  }, [top, t]);

  return (
    <p className="sr-only" aria-live="polite">
      {msg}
    </p>
  );
}

/** "Así calculamos el orden": la fórmula en palabras y la cuenta real de la primera opción. */
export function FormulaExplainer({ top }: { top?: Item }) {
  const t = useTranslations('priorities.formula');
  const tk = useTranslations('priorities.keys');

  return (
    <details className="group rounded-2xl bg-white/5 ring-1 ring-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
        <Calculator aria-hidden className="size-5 text-field-300" />
        <span className="flex-1">{t('title')}</span>
        <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3 text-sm">
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
        </ol>
        <p className="rounded-xl bg-black/30 px-3 py-2 text-center font-mono text-[0.8rem]">{t('equation')}</p>
        <p className="text-ink-muted">{t('notes')}</p>
        {top && (
          <div>
            <p className="mb-1 font-semibold">{t('example', { name: top.strategy.name })}</p>
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="py-1 font-medium">
                    {t('cols.priority')}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {t('cols.weight')}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {t('cols.score')}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {t('cols.points')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {top.parts.map((p) => (
                  <tr key={p.key} className="border-t border-line">
                    <th scope="row" className="py-1.5 font-normal">
                      <span className="flex items-center gap-1.5">
                        <PriorityIcon id={p.key} className="size-3.5 shrink-0 text-ink-muted" />
                        {tk(`${p.key}.title`)}
                      </span>
                    </th>
                    <td className="py-1.5 text-right">{p.weight}</td>
                    <td className="py-1.5 text-right">{p.score}</td>
                    <td className="py-1.5 text-right">{p.points.toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line font-semibold">
                  <th scope="row" className="py-1.5">
                    {t('total')}
                  </th>
                  <td colSpan={3} className="py-1.5 text-right">
                    {top.total}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-ink-muted">{t('local')}</p>
      </div>
    </details>
  );
}
