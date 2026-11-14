'use client';

import clsx from 'clsx';
import {
  AlertTriangle,
  Bug,
  CircleCheck,
  Coins,
  Eye,
  Expand,
  FlaskConical,
  Hammer,
  Mountain,
  Repeat,
  Shovel,
  Sprout,
  TestTube,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';
import { haToAc, mmToIn } from '@/lib/units';
import { usePrefsStore } from '@/lib/prefs';
import type { MilestoneKind, OutlookResponse, SocialFactor, StrategyOutlook } from '@/lib/api/outlook';
import { INDICATORS, useOutlookStore, type Indicator } from './store';
import type { Series } from './charts';

export const INDICATOR_ICON: Record<Indicator, LucideIcon> = {
  income: TrendingUp,
  som: Sprout,
  soilLost: Mountain,
  labor: Hammer,
};

export const MILESTONE_ICON: Record<MilestoneKind, LucideIcon> = {
  trial: FlaskConical,
  'full-adoption': Expand,
  'first-harvest': Sprout,
  'first-cycle': Repeat,
  'pest-break': Bug,
  'break-even': Coins,
  'soil-visible': Shovel,
  'soil-test': TestTube,
};

const STATUS: Record<SocialFactor['status'], { icon: LucideIcon; cls: string }> = {
  good: { icon: CircleCheck, cls: 'text-risk-low' },
  watch: { icon: Eye, cls: 'text-sky-glow' },
  alert: { icon: AlertTriangle, cls: 'text-risk-medium' },
};

export function StatusBadge({ status }: { status: SocialFactor['status'] }) {
  const t = useTranslations('rotations.outlook.status');
  const s = STATUS[status];
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold', s.cls)}>
      <s.icon aria-hidden className="size-4" />
      {t(status)}
    </span>
  );
}

/** Selector de lo que muestra la gráfica (radio de 4 opciones, objetivos de 44 px). */
export function IndicatorPicker() {
  const t = useTranslations('rotations.outlook.indicators');
  const value = useOutlookStore((s) => s.indicator);
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-l`}
      className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1 ring-1 ring-line sm:grid-cols-4"
    >
      <span id={`${id}-l`} className="sr-only">
        {t('label')}
      </span>
      {INDICATORS.map((k) => {
        const Icon = INDICATOR_ICON[k];
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            onClick={() => useOutlookStore.getState().setIndicator(k)}
            className={clsx(
              'flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold',
              value === k ? 'bg-field-500 text-black' : 'text-ink-muted hover:bg-white/5',
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            {t(k)}
          </button>
        );
      })}
    </div>
  );
}

/** ¿Todo de una vez o poco a poco? Cambia la proyección (la pide de nuevo). */
export function PacePicker() {
  const t = useTranslations('rotations.outlook.pace');
  const value = useOutlookStore((s) => s.pace);
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <span id={`${id}-l`} className="text-xs font-semibold text-ink-muted">
        {t('label')}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-l`}
        className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1 ring-1 ring-line"
      >
        {(['all', 'gradual'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => useOutlookStore.getState().setPace(p)}
            className={clsx(
              'flex min-h-11 flex-col items-center justify-center rounded-xl px-2 py-1 text-center text-xs font-semibold',
              value === p ? 'bg-field-500 text-black' : 'text-ink-muted hover:bg-white/5',
            )}
          >
            {t(p)}
            <span
              className={clsx('text-[11px] font-normal', value === p ? 'text-black/75' : 'text-ink-faint')}
            >
              {t(`${p}Hint`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Sección plegable (como las del detalle de la estrategia). */
export function Fold({
  title,
  icon: Icon,
  children,
  open = true,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group rounded-2xl bg-white/5 ring-1 ring-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-bold [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className="size-5 shrink-0 text-field-300" />
        <span className="flex-1">{title}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3 text-sm">{children}</div>
    </details>
  );
}

/** Formato y unidad de cada indicador (respeta métrico/imperial para la capa de suelo perdida). */
export function useIndicatorFormat() {
  const format = useFormatter();
  const t = useTranslations('rotations.outlook');
  const imperial = usePrefsStore((s) => s.units) === 'imperial';
  return (k: Indicator) => {
    switch (k) {
      case 'income':
        return {
          unit: t('units.income'),
          fmt: (v: number) => format.number(v, { maximumFractionDigits: 0 }),
        };
      case 'som':
        return {
          unit: t('units.som'),
          fmt: (v: number) => `${format.number(v, { maximumFractionDigits: 2 })} %`,
        };
      case 'soilLost':
        return imperial
          ? {
              unit: t('units.soilLostIn'),
              fmt: (v: number) => `${format.number(mmToIn(v), { maximumFractionDigits: 2 })} in`,
            }
          : {
              unit: t('units.soilLostMm'),
              fmt: (v: number) => `${format.number(v, { maximumFractionDigits: 1 })} mm`,
            };
      case 'labor':
        // Los datos llegan por hectárea; en imperial se muestran por acre.
        return imperial
          ? {
              unit: t('units.laborAc'),
              fmt: (v: number) => format.number(v / haToAc(1), { maximumFractionDigits: 0 }),
            }
          : { unit: t('units.labor'), fmt: (v: number) => format.number(v, { maximumFractionDigits: 0 }) };
    }
  };
}

/** Valores de 0 (hoy) a N años de un indicador para una estrategia. Hoy es igual para todas: lo de hoy. */
export function seriesValues(o: StrategyOutlook, k: Indicator, data: OutlookResponse) {
  const today = {
    income: 100,
    som: data.baseline.soilOrganicMatterPct,
    soilLost: 0,
    labor: data.baseline.laborDaysHa,
  }[k];
  const pick = (y: StrategyOutlook['years'][number]) =>
    ({
      income: y.incomeIndex.mid,
      som: y.soilOrganicMatterPct.mid,
      soilLost: y.soilLostMm,
      labor: y.laborDaysHa,
    })[k];
  const band = (y: StrategyOutlook['years'][number]): [number, number] | null =>
    k === 'income'
      ? [y.incomeIndex.low, y.incomeIndex.high]
      : k === 'som'
        ? [y.soilOrganicMatterPct.low, y.soilOrganicMatterPct.high]
        : null;
  const values = [today, ...o.years.map(pick)];
  const b = o.years.map(band);
  return {
    values,
    band: b.every(Boolean)
      ? ([[today, today], ...(b as [number, number][])] as [number, number][])
      : undefined,
  };
}

export function toSeries(
  o: StrategyOutlook,
  k: Indicator,
  data: OutlookResponse,
  meta: { label: string; color: string },
  withBand = false,
): Series {
  const v = seriesValues(o, k, data);
  return {
    id: o.strategyId,
    label: meta.label,
    color: meta.color,
    values: v.values,
    band: withBand ? v.band : undefined,
  };
}
