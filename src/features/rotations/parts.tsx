'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, SignalHigh, SignalLow, SignalMedium, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { CropIcon } from '@/features/field/panel/RotationForm';
import { CROPS, rotationRows } from '@/features/field/crops';
import { SCORE_KEYS, type Confidence, type CropSeason, type RotationStrategy, type ScoreKey } from '@/lib/api/contract';

type Scores = RotationStrategy['scores'];

/** Nombres cortos de los meses (ene, feb…) según el idioma. */
export function useMonthNames() {
  const format = useFormatter();
  return Array.from({ length: 12 }, (_, i) => format.dateTime(new Date(2024, i, 15), { month: 'short' }).replace('.', ''));
}

/** Diferencia frente a lo de hoy: flecha + signo + número (no depende solo del color). */
export function Diff({ value, className }: { value: number; className?: string }) {
  const t = useTranslations('rotations');
  if (value === 0) return <span className={clsx('text-ink-faint', className)}>{t('diffSame')}</span>;
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 tabular-nums', up ? 'text-field-300' : 'text-risk-medium', className)}>
      <Icon aria-hidden className="size-3" />
      <span aria-hidden>
        {up ? '+' : '−'}
        {Math.abs(value)}
      </span>
      <span className="sr-only">{t(up ? 'diffUp' : 'diffDown', { n: Math.abs(value) })}</span>
    </span>
  );
}

/** Las 7 barras (agua, materia orgánica, nitrógeno, erosión, plagas, ingresos, forraje) con diferencia vs. hoy. */
export function ScoreBars({ scores, base }: { scores: Scores; base?: Scores }) {
  const t = useTranslations('rotations.scores');
  return (
    <dl className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto_auto] items-center gap-x-2 gap-y-1.5 text-xs">
      {SCORE_KEYS.map((k: ScoreKey) => (
        <Fragment key={k}>
          <dt className="truncate text-ink-muted">{t(k)}</dt>
          <dd aria-hidden className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-field-400 transition-[width] duration-300" style={{ width: `${scores[k]}%` }} />
          </dd>
          <dd className="w-7 text-right font-semibold tabular-nums">{scores[k]}</dd>
          <dd className="w-10 text-right">{base ? <Diff value={scores[k] - base[k]} /> : null}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

const CONF_ICON: Record<Confidence, LucideIcon> = { high: SignalHigh, medium: SignalMedium, low: SignalLow };

export function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  const t = useTranslations('rotations.confidence');
  const Icon = CONF_ICON[confidence];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        confidence === 'high' ? 'bg-field-500/15 text-field-300' : confidence === 'medium' ? 'bg-white/10 text-ink' : 'bg-risk-medium/15 text-risk-medium',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(confidence)}
    </span>
  );
}

/** Texto para lector de pantalla: "Año 1: Maíz de may a oct; sin cultivo nov–abr". */
function describeYear(row: (CropSeason | null)[], months: string[], cropName: (s: CropSeason) => string, bare: string) {
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= 12; i++) {
    if (i < 12 && row[i]?.crop === row[start]?.crop && Boolean(row[i]) === Boolean(row[start])) continue;
    const label = row[start] ? cropName(row[start]!) : bare;
    runs.push(`${label} ${months[start]}–${months[i - 1]}`);
    start = i;
  }
  return runs.join('; ');
}

/** Línea de tiempo de 12–36 meses: una fila por año, color + ícono por cultivo y rayas en el suelo sin cultivo. */
export function Timeline({ strategy, compact = false }: { strategy: Pick<RotationStrategy, 'seasons' | 'durationMonths'>; compact?: boolean }) {
  const t = useTranslations('rotations');
  const tc = useTranslations('crops');
  const months = useMonthNames();
  const years = Math.max(1, Math.round(strategy.durationMonths / 12));
  const rows = rotationRows(strategy.seasons, years);
  const cropName = (s: CropSeason) => tc(s.crop);

  return (
    <div>
      <ul className="sr-only">
        {rows.map((row, y) => (
          <li key={y}>
            {t('timeline.year', { n: y + 1 })}: {describeYear(row, months, cropName, t('timeline.bare'))}
          </li>
        ))}
      </ul>
      <div aria-hidden className="flex flex-col gap-1">
        {rows.map((row, y) => (
          <div key={y} className="flex items-center gap-1.5">
            {years > 1 && <span className="w-6 shrink-0 text-[10px] font-semibold text-ink-faint">{t('timeline.yearShort', { n: y + 1 })}</span>}
            <div className={clsx('grid flex-1 grid-cols-12 gap-px overflow-hidden rounded-lg', compact ? 'h-6' : 'h-8')}>
              {row.map((s, m) => {
                const startsRun = s && (m === 0 || row[m - 1]?.crop !== s.crop);
                const runLen = s ? row.slice(m).findIndex((x) => x?.crop !== s.crop) : 0;
                const long = runLen === -1 || runLen >= 2;
                return (
                  <div
                    key={m}
                    className={clsx('relative flex items-center justify-start overflow-visible', !s && 'pattern-hatch text-white/15')}
                    style={s ? { background: `${CROPS[s.crop].color}${s.role === 'cover' ? '55' : '99'}` } : undefined}
                  >
                    {startsRun && long && (
                      <span className="absolute left-0.5 z-10 grid place-items-center rounded-full bg-space/70 p-0.5">
                        <CropIcon crop={s.crop} className={compact ? 'size-3.5' : 'size-4'} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex gap-1.5">
          {years > 1 && <span className="w-6 shrink-0" />}
          <div className="grid flex-1 grid-cols-12 text-center text-[9px] text-ink-faint uppercase">
            {months.map((m, i) => (
              <span key={i}>{m.charAt(0)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Lista corta de cultivos de la rotación (para la tarjeta). */
export function CropSequence({ seasons }: { seasons: CropSeason[] }) {
  const tc = useTranslations('crops');
  const t = useTranslations('rotations');
  const seen = new Set<string>();
  const items = seasons.filter((s) => s.role !== 'fallow' && !seen.has(s.crop) && seen.add(s.crop));
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {items.map((s) => (
        <li key={s.crop} className="flex items-center gap-1 rounded-full bg-white/5 py-0.5 pr-2 pl-1 text-xs ring-1 ring-line">
          <CropIcon crop={s.crop} className="size-4" />
          {tc(s.crop)}
          {s.role === 'cover' && <span className="text-ink-faint">· {t('timeline.cover')}</span>}
        </li>
      ))}
    </ul>
  );
}
