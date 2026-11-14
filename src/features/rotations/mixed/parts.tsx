'use client';

import clsx from 'clsx';
import { AlertTriangle, Handshake, Minus, ThumbsUp, type LucideIcon } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { CropIcon } from '@/features/field/panel/RotationForm';
import { CROPS } from '@/features/field/crops';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import type { CropId } from '@/lib/api/contract';
import { useUnits } from '@/lib/units';
import { shiftMonth } from './climate';
import type { GuildRole } from './guilds';
import { DIM_KEYS, mainCrop, type Candidate, type DimKey, type MixEval, type Note } from './planner';
import type { PairRelation, Reason } from './relations';

/** Nombres cortos de los meses (ene, feb…). */
export function useMonths(style: 'short' | 'long' = 'short') {
  const format = useFormatter();
  return Array.from({ length: 12 }, (_, i) => format.dateTime(new Date(2024, i, 15), { month: style }).replace('.', ''));
}

/** Nombre de cultivo en minúscula para usar dentro de una frase ("con frijol y calabaza"). */
export function useCropWord() {
  const tc = useTranslations('crops');
  const locale = useLocale();
  return (c: CropId) => tc(c).toLocaleLowerCase(locale);
}

/** Cultivo con artículo para usar dentro de una frase ("el maíz", "la calabaza"; en inglés "the maize"). */
export function useCropThe() {
  const t = useTranslations('mixed.article');
  const word = useCropWord();
  return (c: CropId) => `${t(c)} ${word(c)}`.trim();
}

/** Lista "maíz, frijol y calabaza". */
export function useCropList() {
  const word = useCropWord();
  const format = useFormatter();
  return (crops: readonly CropId[]) => format.list(crops.map(word), { type: 'conjunction' });
}

/** Nombre de una mezcla: el de la asociación conocida o "Maíz con frijol y calabaza". */
export function useMixName() {
  const t = useTranslations('mixed');
  const tc = useTranslations('crops');
  const list = useCropList();
  return (c: Candidate) => {
    if (c.guild) return t(`guilds.items.${c.guild.id}.name`);
    const main = mainCrop(c);
    const others = c.eval.crops.filter((x) => x !== main);
    return others.length ? t('mixName', { main: tc(main), others: list(others) }) : tc(main);
  };
}

/** "Maíz con frijol y calabaza" (siempre con los cultivos, aunque la mezcla tenga nombre propio). */
export function useMixCrops() {
  const t = useTranslations('mixed');
  const tc = useTranslations('crops');
  const list = useCropList();
  return (c: Candidate) => {
    const main = mainCrop(c);
    const others = c.eval.crops.filter((x) => x !== main);
    return others.length ? t('mixName', { main: tc(main), others: list(others) }) : tc(main);
  };
}

export function CropRow({ crops, size = 'md' }: { crops: readonly CropId[]; size?: 'md' | 'lg' }) {
  const tc = useTranslations('crops');
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {crops.map((c) => (
        <li
          key={c}
          className={clsx(
            'flex items-center gap-1.5 rounded-full bg-white/5 ring-1 ring-line',
            size === 'lg' ? 'py-1 pr-3 pl-1.5 text-sm font-semibold' : 'py-0.5 pr-2 pl-1 text-xs',
          )}
        >
          <span className="grid place-items-center rounded-full" style={{ background: `${CROPS[c].color}22` }}>
            <CropIcon crop={c} className={size === 'lg' ? 'size-6' : 'size-4'} />
          </span>
          {tc(c)}
        </li>
      ))}
    </ul>
  );
}

const DIM_GLOSSARY: Partial<Record<DimKey, 'strata' | 'intercropping'>> = { space: 'strata', synergy: 'intercropping' };

/** Las 5 dimensiones con barra y número (el número y el texto no dependen del color). */
export function DimBars({ e, glossary = false }: { e: MixEval; glossary?: boolean }) {
  const t = useTranslations('mixed.dims');
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs">
      {DIM_KEYS.map((k) => (
        <Fragment key={k}>
          <dt className="truncate text-ink-muted">
            {glossary && DIM_GLOSSARY[k] ? <GlossaryLink term={DIM_GLOSSARY[k]!}>{t(k)}</GlossaryLink> : t(k)}
          </dt>
          <dd aria-hidden className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-field-400 transition-[width] duration-300" style={{ width: `${e.dims[k]}%` }} />
          </dd>
          <dd className="w-7 text-right font-semibold tabular-nums">{e.dims[k]}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function Score({ value, className }: { value: number; className?: string }) {
  const t = useTranslations('mixed');
  return (
    <div className={clsx('shrink-0 text-right', className)}>
      <p className="text-3xl leading-none font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-ink-muted">{t('ofHundred')}</p>
    </div>
  );
}

/** Texto de una nota (por qué sí / qué cuidar), con los cultivos y la unidad elegida. */
export function useNoteText() {
  const t = useTranslations('mixed.notes');
  const list = useCropList();
  const u = useUnits();
  return (n: Note) =>
    t(n.id, {
      crops: list(n.crops),
      pct: n.pct ?? 0,
      height: u.length(n.meters ?? 0),
      depth: u.length(n.meters ?? 0),
    });
}

export function NoteList({ notes, max }: { notes: Note[]; max?: number }) {
  const text = useNoteText();
  const t = useTranslations('mixed');
  const shown = max ? notes.slice(0, max) : notes;
  if (!shown.length) return null;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {shown.map((n, i) => {
        const Icon = n.tone === 'good' ? ThumbsUp : AlertTriangle;
        return (
          <li key={`${n.id}-${i}`} className="flex items-start gap-2">
            <Icon aria-hidden className={clsx('mt-0.5 size-4 shrink-0', n.tone === 'good' ? 'text-field-300' : 'text-risk-medium')} />
            <span className="min-w-0 flex-1">
              <span className="sr-only">{t(n.tone === 'good' ? 'goodLabel' : 'warnLabel')}: </span>
              {text(n)}{' '}
              <span className="ml-0.5 inline-block rounded-full bg-sky-glow/15 px-1.5 text-[11px] font-semibold text-sky-glow">
                {n.source === 'Dato local' ? t('sourceYou') : n.source === 'Modelo agronómico' ? t('sourceModel') : n.source}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Frase de una razón entre dos cultivos ("Tutor: el frijol trepa por el maíz."). */
export function useReasonText() {
  const t = useTranslations('mixed.reasons');
  const the = useCropThe();
  return (r: Reason) => t(r.id, { a: the(r.from), b: the(r.to) });
}

const KIND_ICON: Record<PairRelation['kind'], LucideIcon> = { helps: Handshake, careful: AlertTriangle, neutral: Minus };

export function RelationList({ pairs }: { pairs: PairRelation[] }) {
  const t = useTranslations('mixed.relations');
  const tc = useTranslations('crops');
  const reason = useReasonText();
  if (!pairs.length) return <p className="text-sm text-ink-muted">{t('single')}</p>;
  const sorted = [...pairs].sort((a, b) => b.value - a.value);
  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((p) => {
        const Icon = KIND_ICON[p.kind];
        return (
          <li key={`${p.a}|${p.b}`} className="rounded-xl bg-black/20 p-3 ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 font-semibold">
                <CropIcon crop={p.a} className="size-5" />
                {tc(p.a)}
                <span aria-hidden className="text-ink-faint">+</span>
                <span className="sr-only">{t('and')}</span>
                <CropIcon crop={p.b} className="size-5" />
                {tc(p.b)}
              </span>
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                  p.kind === 'helps' ? 'bg-field-500/15 text-field-300' : p.kind === 'careful' ? 'bg-risk-medium/15 text-risk-medium' : 'bg-white/10 text-ink-muted',
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {t(p.kind)}
              </span>
              {p.curated && <span className="text-xs text-ink-faint">{t('known')}</span>}
            </div>
            {p.reasons.length > 0 ? (
              <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                {p.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {r.kind === 'helps' ? (
                      <ThumbsUp aria-hidden className="mt-0.5 size-3.5 shrink-0 text-field-300" />
                    ) : (
                      <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-risk-medium" />
                    )}
                    <span>{reason(r)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">{t('noReasons')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RoleBadge({ role }: { role: GuildRole }) {
  const t = useTranslations('mixed.roles');
  return <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] text-ink-muted">{t(role)}</span>;
}

export type CalendarRow = { crop: CropId; months: number[]; sow: number; end: number; kind: 'crop' | 'cover'; note?: string };

/** Calendario de 12 meses: una fila por cultivo con su siembra y cosecha (no depende solo del color). */
export function SowCalendar({ rows, label }: { rows: CalendarRow[]; label: string }) {
  const t = useTranslations('mixed.calendar');
  const tc = useTranslations('crops');
  const short = useMonths('short');
  const long = useMonths('long');
  return (
    <div>
      <ul className="sr-only" aria-label={label}>
        {rows.map((r) => (
          <li key={`${r.kind}-${r.crop}`}>
            {r.months.length === 12
              ? t('a11yAllYear', { crop: tc(r.crop) })
              : t(r.kind === 'cover' ? 'a11yCover' : 'a11yRow', { crop: tc(r.crop), sow: long[r.sow - 1]!, harvest: long[r.end - 1]! })}
          </li>
        ))}
      </ul>
      <div aria-hidden className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={`${r.kind}-${r.crop}`} className="flex items-center gap-2">
            <span className="flex w-24 shrink-0 items-center gap-1 truncate text-xs">
              <CropIcon crop={r.crop} className="size-4 shrink-0" />
              <span className="truncate">{tc(r.crop)}</span>
            </span>
            <div className="grid h-6 flex-1 grid-cols-12 gap-px overflow-hidden rounded-md bg-white/5">
              {Array.from({ length: 12 }, (_, i) => {
                const m = i + 1;
                const on = r.months.includes(m);
                return (
                  <div
                    key={m}
                    className={clsx('relative', on && r.kind === 'cover' && 'pattern-hatch')}
                    style={on ? { background: `${CROPS[r.crop].color}${r.kind === 'cover' ? '66' : 'bb'}` } : undefined}
                  >
                    {on && m === r.sow && r.months.length < 12 && (
                      <span className="absolute inset-y-0 left-0 w-0.5 bg-white/80" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <span className="w-24 shrink-0" />
          <div className="grid flex-1 grid-cols-12 text-center text-[9px] text-ink-faint uppercase">
            {short.map((m, i) => (
              <span key={i}>{m.charAt(0)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Filas del calendario de una mezcla (+ cobertura entre cosechas). */
export function calendarRows(e: MixEval, cover?: { crop: CropId; sow: number; end: number } | null): CalendarRow[] {
  const rows: CalendarRow[] = e.members
    .filter((m) => m.window)
    .map((m) => ({ crop: m.crop, months: m.window!.months, sow: m.window!.sow, end: m.window!.harvest, kind: 'crop' }));
  if (cover) {
    const months: number[] = [];
    for (let k = 0; k < 12; k++) {
      const m = shiftMonth(cover.sow, k);
      months.push(m);
      if (m === cover.end) break;
    }
    rows.push({ crop: cover.crop, months, sow: cover.sow, end: cover.end, kind: 'cover' });
  }
  return rows;
}
