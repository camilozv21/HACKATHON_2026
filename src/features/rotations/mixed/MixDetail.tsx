'use client';

import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Handshake,
  Layers,
  Shovel,
  ThumbsUp,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { CropIcon } from '@/features/field/panel/RotationForm';
import type { CoverPlan, GapId, Candidate } from './planner';
import { calendarRows, DimBars, NoteList, RelationList, RoleBadge, Score, SowCalendar, useCropList, useMixCrops, useMixName, useMonths } from './parts';
import { StrataDiagram } from './StrataDiagram';

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
    <details open={open} className={clsx('group rounded-2xl ring-1', tone === 'warn' ? 'bg-risk-medium/10 ring-risk-medium/50' : 'bg-white/5 ring-line')}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-bold [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className={clsx('size-5 shrink-0', tone === 'warn' ? 'text-risk-medium' : 'text-field-300')} />
        <span className="flex-1">{title}</span>
        <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 text-sm">{children}</div>
    </details>
  );
}

/** Orden de siembra: "Primero: maíz (mayo) · 3 semanas después: frijol y calabaza". */
function SowOrder({ c }: { c: Candidate }) {
  const t = useTranslations('mixed.calendar');
  const list = useCropList();
  const months = useMonths('long');
  const groups = new Map<number, Candidate['eval']['members']>();
  for (const m of c.eval.members) {
    if (m.perennial) continue;
    groups.set(m.sowWeek, [...(groups.get(m.sowWeek) ?? []), m]);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  if (!ordered.length) return <p>{t('perennialOnly')}</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {ordered.map(([week, ms]) => (
        <li key={week} className="flex items-start gap-2">
          <span className="mt-0.5 flex shrink-0 -space-x-1">
            {ms.map((m) => (
              <CropIcon key={m.crop} crop={m.crop} className="size-5" />
            ))}
          </span>
          <span>
            <span className="font-semibold">{week === 0 ? t('first') : t('weeksAfter', { n: week })}:</span> {list(ms.map((m) => m.crop))}
            {ms[0]?.window && <span className="text-ink-muted"> · {t('sowIn', { month: months[ms[0].window.sow - 1]! })}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MixDetail({
  candidate: c,
  kicker,
  cover,
  gaps,
  onBack,
}: {
  candidate: Candidate;
  kicker: string;
  cover?: CoverPlan | null;
  gaps: GapId[];
  onBack: () => void;
}) {
  const t = useTranslations('mixed');
  const tr = useTranslations('rotations');
  const name = useMixName();
  const cropsLine = useMixCrops();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const e = c.eval;
  const good = e.notes.filter((n) => n.tone === 'good');
  const warn = e.notes.filter((n) => n.tone === 'warn');

  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start' });
  }, [c]);

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
          <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{kicker}</p>
          <h3 ref={headingRef} tabIndex={-1} className="scroll-mt-4 text-xl leading-snug font-bold outline-none">
            {name(c)}
          </h3>
          {c.guild && <p className="text-sm text-ink-muted">{cropsLine(c)}</p>}
        </div>
        <Score value={e.total} />
      </header>

      {c.guild && <p className="text-sm">{t(`guilds.items.${c.guild.id}.story`)}</p>}
      {c.guild && (
        <ul className="flex flex-wrap gap-1.5">
          {c.guild.members.map((m) => (
            <li key={m.crop} className="flex items-center gap-1 rounded-full bg-white/5 py-0.5 pr-1.5 pl-1 text-xs ring-1 ring-line">
              <CropIcon crop={m.crop} className="size-4" />
              <RoleBadge role={m.role} />
            </li>
          ))}
        </ul>
      )}

      <Section title={t('strata.title')} icon={Layers}>
        <p className="mb-2 text-xs text-ink-muted">{t('strata.hint')}</p>
        <StrataDiagram space={e.space} title={t('strata.diagramTitle', { name: name(c) })} list />
        <p className="mt-2 text-xs text-ink-faint">{t('strata.typical')}</p>
      </Section>

      <Section title={t('calendar.title')} icon={CalendarDays}>
        <SowOrder c={c} />
        {e.climateKnown && (
          <div className="mt-3">
            <SowCalendar rows={calendarRows(e, cover)} label={t('calendar.title')} />
            <p className="mt-1 text-xs text-ink-faint">{t('calendar.source')}</p>
          </div>
        )}
      </Section>

      <Section title={t('howTo')} icon={Shovel}>
        <p>{c.guild ? t(`guilds.items.${c.guild.id}.layout`) : t('howToGeneric')}</p>
      </Section>

      <Section title={t('relations.title')} icon={Handshake}>
        <RelationList pairs={e.pairs} />
      </Section>

      <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
        <p className="mb-2 text-xs font-semibold text-ink-muted">{t('dimsTitle')}</p>
        <DimBars e={e} glossary />
      </div>

      {good.length > 0 && (
        <Section title={t('whyTitle')} icon={ThumbsUp}>
          <NoteList notes={good} />
        </Section>
      )}

      <Section title={t('careTitle')} icon={AlertTriangle} tone="warn">
        {warn.length > 0 ? <NoteList notes={warn} /> : <p>{t('careNone')}</p>}
        <div className="mt-3 rounded-xl bg-black/20 p-3">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <UserRound aria-hidden className="size-4 text-risk-medium" />
            {tr('localReview')}
          </p>
          <p>{t('localReview')}</p>
        </div>
      </Section>

      {gaps.length > 0 && (
        <Section title={tr('sections.gaps')} icon={CircleHelp}>
          <p className="mb-2 text-xs text-ink-muted">{tr('gapsHint')}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
            {gaps.map((g) => (
              <li key={g}>{t(`gaps.${g}`)}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
