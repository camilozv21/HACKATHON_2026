'use client';

import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Map as MapIcon,
  Satellite,
  Store,
  ThumbsUp,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { CROPS } from '@/features/field/crops';
import type { Ranked } from '@/features/priorities/ranking';
import { TermIcon } from '@/features/glossary/GlossarySheet';
import type { GlossaryTerm } from '@/features/glossary/terms';
import type { CropId, RotationStrategy } from '@/lib/api/contract';
import { MarketSection } from '@/features/market/MarketSection';
import { showEvidenceOnMap } from './mapLink';
import { ConfidenceChip, Diff, ScoreBars, Timeline, useMonthNames } from './parts';

type Item = Ranked<RotationStrategy>;

const DEEP_ROOTS = new Set<CropId>(['alfalfa', 'radish', 'sunflower', 'sorghum', 'shade-trees', 'cassava']);
const DROUGHT_TOLERANT = new Set<CropId>(['sorghum', 'millet', 'cowpea', 'chickpea', 'mungbean', 'cassava']);

/** Explicaciones cortas que aplican a esta estrategia (leguminosa, cobertura, raíces profundas, tolerante a sequía). */
function conceptsFor(s: RotationStrategy): GlossaryTerm[] {
  const out: GlossaryTerm[] = [];
  const crops = s.seasons.map((x) => x.crop);
  if (crops.some((c) => CROPS[c].family === 'legume')) out.push('legume');
  if (s.seasons.some((x) => x.role === 'cover' || CROPS[x.crop].family === 'cover')) out.push('cover-crop');
  if (crops.some((c) => DEEP_ROOTS.has(c))) out.push('deep-roots');
  if (crops.some((c) => DROUGHT_TOLERANT.has(c))) out.push('drought-tolerant');
  return out;
}

function Section({
  title,
  icon: Icon,
  children,
  tone = 'default',
  open = true,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  tone?: 'default' | 'warn';
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className={clsx('group rounded-2xl ring-1', tone === 'warn' ? 'bg-risk-medium/10 ring-risk-medium/50' : 'bg-white/5 ring-line')}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-bold [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className={clsx('size-5 shrink-0', tone === 'warn' ? 'text-risk-medium' : 'text-field-300')} />
        <span className="flex-1">{title}</span>
        <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 text-sm">{children}</div>
    </details>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

/** Detalle de una estrategia (pantalla completa del sheet) con secciones plegables. */
export function StrategyDetail({
  item,
  current,
  onBack,
  timeSection,
}: {
  item: Item;
  current?: Item;
  onBack: () => void;
  /** La estrategia en el tiempo (10 años, contexto social y fuentes); se carga aparte. */
  timeSection?: ReactNode;
}) {
  const t = useTranslations('rotations');
  const tl = useTranslations('layers.items');
  const tg = useTranslations('glossary.terms');
  const months = useMonthNames();
  const s = item.strategy;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const concepts = conceptsFor(s);

  // El foco va al título del detalle (y vuelve al botón de la tarjeta al regresar, lo maneja la lista).
  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start' });
  }, [s.id]);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-11 items-center gap-1.5 self-start rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </button>

      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('rank', { rank: item.rank })}</p>
          <h3 ref={headingRef} tabIndex={-1} className="scroll-mt-4 text-xl leading-snug font-bold outline-none">
            {s.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            {s.isCurrent && <span className="font-semibold text-sky-glow">{t('current')}</span>}
            <ConfidenceChip confidence={s.confidence} />
            <span>{t(`confidenceWhy.${s.confidence}`)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl leading-none font-bold tabular-nums">{item.total}</p>
          <p className="text-[11px] text-ink-muted">{t('ofHundred')}</p>
          {current && !s.isCurrent && <Diff value={item.total - current.total} className="text-xs font-semibold" />}
        </div>
      </header>

      <Timeline strategy={s} />
      <p className="text-sm">{s.rationale}</p>
      <div className="lite:hidden">
        <ScoreBars scores={s.scores} base={s.isCurrent ? undefined : current?.strategy.scores} />
      </div>
      {timeSection}

      {s.benefits.length > 0 && (
        <Section title={t('sections.benefits')} icon={ThumbsUp}>
          <Bullets items={s.benefits} />
        </Section>
      )}

      {s.market && (
        <Section title={t('sections.market')} icon={Store}>
          <MarketSection market={s.market} />
        </Section>
      )}

      {s.evidence.length > 0 && (
        <Section title={t('sections.evidence')} icon={Satellite}>
          <p className="mb-2 text-xs text-ink-muted">{t('evidenceHint')}</p>
          <ul className="flex flex-col gap-2">
            {s.evidence.map((e) => (
              <li key={e.id} className="rounded-xl bg-black/20 p-3 ring-1 ring-line">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-sky-glow/15 px-2 py-0.5 font-semibold text-sky-glow">{e.source}</span>
                  {e.months && e.months.length > 0 && (
                    <span className="text-ink-faint">{e.months.map((m) => months[m - 1]).join(', ')}</span>
                  )}
                </div>
                <p className="mt-1.5">{e.statement}</p>
                {e.rule && (
                  <p className="mt-1 flex items-start gap-1.5 text-ink-muted lite:hidden">
                    <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-field-300" />
                    <span>
                      <span className="sr-only">{t('ruleLabel')}: </span>
                      {e.rule}
                    </span>
                  </p>
                )}
                {e.layerId && (
                  <button
                    type="button"
                    onClick={() => showEvidenceOnMap(e.layerId!, e.date)}
                    className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-sky-glow/15 px-3.5 text-sm font-semibold text-sky-glow ring-1 ring-sky-glow/40 hover:bg-sky-glow/25"
                  >
                    <MapIcon aria-hidden className="size-4" />
                    {t('seeOnMap', { layer: tl(`${e.layerId}.name`) })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(s.risks.length > 0 || s.needsLocalReview.length > 0) && (
        <Section title={t('sections.risks')} icon={AlertTriangle} tone="warn">
          {s.risks.length > 0 && <Bullets items={s.risks} />}
          {s.needsLocalReview.length > 0 && (
            <div className="mt-3 rounded-xl bg-black/20 p-3">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <UserRound aria-hidden className="size-4 text-risk-medium" />
                {t('localReview')}
              </p>
              <Bullets items={s.needsLocalReview} />
            </div>
          )}
        </Section>
      )}

      {s.dataGaps.length > 0 && (
        <Section title={t('sections.gaps')} icon={CircleHelp}>
          <p className="mb-2 text-xs text-ink-muted">{t('gapsHint')}</p>
          <Bullets items={s.dataGaps} />
        </Section>
      )}

      {concepts.length > 0 && (
        <Section title={t('sections.concepts')} icon={BookOpen} open={false}>
          <ul className="flex flex-col gap-2">
            {concepts.map((c) => (
              <li key={c} className="flex gap-3 rounded-xl bg-black/20 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-field-500/15 text-field-300">
                  <TermIcon term={c} className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{tg(`${c}.title`)}</p>
                  <p className="text-ink-muted">{tg(`${c}.simple`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
