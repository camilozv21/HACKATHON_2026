'use client';

import clsx from 'clsx';
import { Check, Lightbulb, Plus, Search, Shapes, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { CropIcon } from '@/features/field/panel/RotationForm';
import type { CropId } from '@/lib/api/contract';
import { bestWindow } from './climate';
import { bestAdditions, evaluateMix, type AdditionWhy, type Member, type MixContext } from './planner';
import { DimBars, RelationList, Score, useCropThe, useReasonText } from './parts';
import { useMixedStore } from './store';
import { StrataDiagram } from './StrataDiagram';
import { canSupport, PLANNER_CROPS, traitsOf } from './traits';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Trepadores y rastreros van ~3 semanas después si hay una planta alta que los sostenga o cubra. */
export function toMembers(crops: readonly CropId[]): Member[] {
  const tall = crops.some((c) => canSupport(traitsOf(c)!));
  return crops.map((crop) => {
    const h = traitsOf(crop)!.habit;
    return { crop, sowWeek: tall && (h === 'climber' || h === 'creeper') ? 3 : 0 };
  });
}

function useWhyText() {
  const t = useTranslations('mixed.builder.why');
  const the = useCropThe();
  const reason = useReasonText();
  return (crop: CropId, why: AdditionWhy) =>
    'niche' in why ? t(why.niche, { crop: the(crop) }) : 'reason' in why ? reason(why.reason) : t('climate', { crop: the(crop) });
}

export function MixBuilder({ ctx, initial }: { ctx: MixContext; initial: CropId[] }) {
  const t = useTranslations('mixed.builder');
  const tm = useTranslations('mixed');
  const tc = useTranslations('crops');
  const stored = useMixedStore((s) => s.builder);
  const setBuilder = useMixedStore((s) => s.setBuilder);
  const crops = stored ?? initial;
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const whyText = useWhyText();

  const members = useMemo(() => toMembers(crops), [crops]);
  const e = useMemo(() => (crops.length ? evaluateMix(members, ctx) : null), [members, ctx, crops.length]);
  const suggestion = useMemo(() => (crops.length && crops.length < 4 ? bestAdditions(members, ctx, 1)[0] : undefined), [members, ctx, crops.length]);
  const fits = useMemo(
    () => Object.fromEntries(PLANNER_CROPS.map((c) => [c, ctx.climate ? Math.round(bestWindow(traitsOf(c)!, ctx.climate, ctx.water).score * 100) : null])),
    [ctx],
  );

  const toggle = (c: CropId) => setBuilder(crops.includes(c) ? crops.filter((x) => x !== c) : [...crops, c]);
  const list = PLANNER_CROPS.filter((c) => !q || norm(tc(c)).includes(norm(q)));
  const full = crops.length >= 4;

  return (
    <section aria-labelledby="mix-builder" className="flex flex-col gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <div>
        <h4 id="mix-builder" className="flex items-center gap-2 font-bold">
          <Shapes aria-hidden className="size-5 text-field-300" />
          {t('title')}
        </h4>
        <p className="text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <ul className="flex flex-wrap gap-1.5" aria-label={t('selected')}>
        {crops.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => toggle(c)}
              aria-label={t('remove', { crop: tc(c) })}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-field-500/15 py-1 pr-3 pl-1.5 text-sm font-semibold ring-1 ring-field-400"
            >
              <CropIcon crop={c} className="size-6" />
              {tc(c)}
              <X aria-hidden className="size-4" />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            disabled={full && !picking}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-semibold ring-1 ring-line hover:bg-white/15 disabled:opacity-50"
          >
            <Plus aria-hidden className="size-4" />
            {full ? t('full') : t('add')}
          </button>
        </li>
      </ul>

      {picking && (
        <div className="rounded-2xl bg-space-2/80 p-2 ring-1 ring-line">
          <label className="flex h-11 items-center gap-2 rounded-xl bg-white/5 px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-field-400">
            <Search aria-hidden className="size-4 text-ink-muted" />
            <span className="sr-only">{t('search')}</span>
            <input
              autoFocus
              value={q}
              onChange={(ev) => setQ(ev.target.value)}
              onKeyDown={(ev) => ev.key === 'Escape' && setPicking(false)}
              placeholder={t('search')}
              className="min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </label>
          <ul className="mt-2 grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
            {list.map((c) => {
              const on = crops.includes(c);
              const fit = fits[c];
              return (
                <li key={c}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={!on && full}
                    onClick={() => toggle(c)}
                    className={clsx(
                      'relative flex min-h-18 w-full flex-col items-center justify-center gap-0.5 rounded-xl p-1.5 text-center text-xs ring-1 disabled:opacity-40',
                      on ? 'bg-field-500/20 font-semibold ring-2 ring-field-400' : 'ring-line hover:bg-white/5',
                    )}
                  >
                    {on && <Check aria-hidden className="absolute top-1 right-1 size-3.5 text-field-300" />}
                    <CropIcon crop={c} className="size-6" />
                    <span className="leading-tight">{tc(c)}</span>
                    {fit != null && (
                      <span className={clsx('text-[10px]', fit >= 60 ? 'text-field-300' : fit >= 45 ? 'text-ink-muted' : 'text-risk-medium')}>
                        {t(fit >= 60 ? 'fitGood' : fit >= 45 ? 'fitSoso' : 'fitBad')}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {crops.length < 2 && <p className="text-sm text-ink-muted">{t('pickTwo')}</p>}

      {e && (
        <>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DimBars e={e} />
            </div>
            <Score value={e.total} />
          </div>
          <p className="sr-only" aria-live="polite">
            {t('live', { score: e.total })}
          </p>
          {!e.viable && (
            <p className="rounded-xl bg-risk-medium/10 p-2.5 text-sm ring-1 ring-risk-medium/40">{tm('notViable')}</p>
          )}
          <StrataDiagram space={e.space} title={t('diagramTitle')} />
          {crops.length >= 2 && <RelationList pairs={e.pairs} />}
        </>
      )}

      {suggestion && suggestion.gain > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-sun/10 p-3 ring-1 ring-sun/40">
          <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-sun" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('suggest', { crop: tc(suggestion.crop) })}</p>
            <p className="text-sm text-ink-muted">{whyText(suggestion.crop, suggestion.why)}</p>
            <button
              type="button"
              onClick={() => setBuilder([...crops, suggestion.crop])}
              className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-sun px-4 text-sm font-bold text-black"
            >
              <Plus aria-hidden className="size-4" />
              {t('addSuggested', { crop: tc(suggestion.crop) })}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
