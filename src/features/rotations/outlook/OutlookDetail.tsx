'use client';

import { BookMarked, CalendarRange, CircleHelp, HeartHandshake, Table2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import { CropIcon } from '@/features/field/panel/RotationForm';
import type { AnalysisResponse, CropId, RotationStrategy } from '@/lib/api/contract';
import type { OutlookResponse, StrategyOutlook } from '@/lib/api/outlook';
import { seriesColor } from '../colors';
import { useMonthNames } from '../parts';
import {
  LaborChart,
  MonthStrip,
  RotationWheel,
  SeriesLegend,
  SeriesTable,
  Trajectory,
  YearStrip,
} from './charts';
import { HouseholdQuestions } from './HouseholdQuestions';
import {
  Fold,
  IndicatorPicker,
  MILESTONE_ICON,
  PacePicker,
  StatusBadge,
  toSeries,
  useIndicatorFormat,
} from './parts';
import { Cite, ReferencesProvider, SourcesList } from './Sources';
import { useOutlookStore } from './store';
import { useUnits } from '@/lib/units';
import { useOutlook } from './useOutlook';

/** Cultivos de la vuelta, en orden, con sus meses (la rueda dicha con palabras). */
function CycleList({ o }: { o: StrategyOutlook }) {
  const t = useTranslations('rotations.outlook');
  const tc = useTranslations('crops');
  const months = useMonthNames();
  const flat = o.years.slice(0, o.cycleYears).flatMap((y) => y.months);
  const runs: { crop: CropId; start: number; len: number }[] = [];
  flat.forEach((c, i) => {
    const last = runs.at(-1);
    if (c && last?.crop === c && last.start + last.len === i) last.len++;
    else if (c) runs.push({ crop: c, start: i, len: 1 });
  });
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {runs.map((r) => (
        <li key={r.start} className="flex items-center gap-2">
          <CropIcon crop={r.crop} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{tc(r.crop)}</span>
          <span className="shrink-0 text-xs text-ink-muted">
            {o.cycleYears > 1 && `${t('yearShort', { n: Math.floor(r.start / 12) + 1 })} · `}
            {months[r.start % 12]}–{months[(r.start + r.len - 1) % 12]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SocialSection({
  data,
  o,
  base,
  color,
  baseColor,
  fieldId,
}: {
  data: OutlookResponse;
  o: StrategyOutlook;
  base?: StrategyOutlook;
  color: string;
  baseColor: string;
  fieldId: string;
}) {
  const t = useTranslations('rotations.outlook');
  const u = useUnits();
  const isCurrent = !base || base.strategyId === o.strategyId;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {o.social.map((f) => (
          <li key={f.kind} className="rounded-xl bg-black/20 p-3 ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{f.title}</p>
              <StatusBadge status={f.status} />
            </div>
            <p className="mt-1">
              {f.text}
              <Cite ids={f.refIds} />
            </p>
          </li>
        ))}
      </ul>

      <div>
        <p className="font-semibold">
          {t('laborTitle')} <GlossaryLink term="workday" />
        </p>
        <p className="mb-1 text-xs text-ink-muted">
          {t('laborHint', { area: u.area(data.baseline.areaHa), workers: data.baseline.workers })}
          {(data.baseline.areaAssumed || data.baseline.workersAssumed) && ` ${t('assumedMark')}`}
        </p>
        <LaborChart
          need={o.labor.farmByMonth}
          base={isCurrent ? undefined : base?.labor.farmByMonth}
          capacity={o.labor.familyPerMonth}
          color={color}
          baseColor={baseColor}
          labels={{
            need: isCurrent ? t('todayLabel') : t('thisOption'),
            base: t('todayLabel'),
            capacity: t('familyCapacity', { n: o.labor.familyPerMonth }),
            chart: t('laborChart', {
              peak: Math.round(Math.max(...o.labor.farmByMonth)),
              family: o.labor.familyPerMonth,
            }),
          }}
        />
        <ul aria-hidden className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {!isCurrent && (
            <li className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm" style={{ background: baseColor }} />
              {t('todayLabel')}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: color }} />
            {isCurrent ? t('todayLabel') : t('thisOption')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-current" />
            {t('familyLegend')}
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-semibold">{t('foodTitle')}</p>
        {!isCurrent && base && <MonthStrip months={base.food.months} label={t('todayLabel')} tone="food" />}
        <MonthStrip
          months={o.food.months}
          label={isCurrent ? t('todayLabel') : t('thisOption')}
          tone="food"
        />
        <p className="mt-1 font-semibold">{t('cashTitle')}</p>
        {!isCurrent && base && <MonthStrip months={base.cash.months} label={t('todayLabel')} tone="cash" />}
        <MonthStrip
          months={o.cash.months}
          label={isCurrent ? t('todayLabel') : t('thisOption')}
          tone="cash"
        />
        <p className="text-xs text-ink-muted">{t('stripLegend')}</p>
      </div>

      <HouseholdQuestions fieldId={fieldId} />

      {data.context.facts.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">
            {data.context.region === 'co' ? t('contextCo') : t('contextGlobal')}
          </p>
          <ul className="flex flex-col gap-1.5">
            {data.context.facts.map((f) => (
              <li key={f.id} className="rounded-xl bg-black/20 p-3 ring-1 ring-line">
                {f.text}
                <Cite ids={f.refIds} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.context.questions.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">{t('talkAbout')}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
            {data.context.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * Detalle de una estrategia en el tiempo: la rueda del ciclo, los 10 años por fases con sus hitos, la trayectoria
 * frente a lo de hoy (con el rango de años buenos y malos), el contexto social y las fuentes.
 */
export default function OutlookDetail({
  analysis,
  strategy,
  colorIndex,
}: {
  analysis: AnalysisResponse;
  strategy: RotationStrategy;
  colorIndex: Record<string, number>;
}) {
  const t = useTranslations('rotations.outlook');
  const id = useId().replace(/:/g, '');
  const q = useOutlook(analysis);
  const indicator = useOutlookStore((s) => s.indicator);
  const { unit, fmt } = useIndicatorFormat()(indicator);
  const data = q.data;
  const o = data?.strategies.find((s) => s.strategyId === strategy.id);
  const currentId = analysis.strategies.find((s) => s.isCurrent)?.id;
  const base = data?.strategies.find((s) => s.strategyId === currentId);
  const color = seriesColor(colorIndex[strategy.id] ?? 0);
  const baseColor = seriesColor(colorIndex[currentId ?? ''] ?? 0);

  if (!data || !o) {
    return q.isError ? (
      <p className="rounded-xl bg-risk-medium/10 p-3 text-sm ring-1 ring-risk-medium/40">{t('error')}</p>
    ) : (
      <div aria-hidden className="shimmer h-64 rounded-2xl" />
    );
  }

  const isCurrent = strategy.isCurrent;
  const series = [
    ...(isCurrent || !base
      ? []
      : [toSeries(base, indicator, data, { label: t('todayLabel'), color: baseColor })]),
    toSeries(o, indicator, data, { label: isCurrent ? t('todayLabel') : strategy.name, color }, true),
  ];
  const transitionEnd = o.years.filter((y) => y.phase === 'transition').at(-1)?.year ?? 0;
  const be = o.breakEvenYear;
  const chartLabel = t('chartLabel', { indicator: t(`indicators.${indicator}`), n: data.horizonYears });

  return (
    <ReferencesProvider references={data.references} scope={`dt-${id}`}>
      <div
        className={q.isFetching ? 'flex flex-col gap-4 opacity-70 transition-opacity' : 'flex flex-col gap-4'}
        aria-busy={q.isFetching}
      >
        <Fold title={t('detailTitle', { n: data.horizonYears })} icon={CalendarRange}>
          <p className="text-ink-muted">{t('detailHint')}</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <RotationWheel
              months={o.years.slice(0, o.cycleYears).flatMap((y) => y.months)}
              cycleYears={o.cycleYears}
            />
            <div className="w-full min-w-0 flex-1">
              <p className="mb-1 font-semibold">{t('cycleTitle', { years: o.cycleYears })}</p>
              <CycleList o={o} />
            </div>
          </div>

          {!isCurrent && <PacePicker />}

          {!isCurrent && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-line">
                <p className="text-xs text-ink-muted">
                  {t('breakEven')} <GlossaryLink term="break-even" />
                </p>
                <p className="text-xl font-bold">
                  {be === 1 ? t('noDipShort') : be == null ? t('notInHorizon') : t('yearN', { n: be })}
                </p>
              </div>
              <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-line">
                <p className="text-xs text-ink-muted">{t('soilSavedLabel', { n: data.horizonYears })}</p>
                <p className="text-xl font-bold">
                  {base ? <SoilDepth mm={base.years.at(-1)!.soilLostMm - o.years.at(-1)!.soilLostMm} /> : '—'}
                </p>
              </div>
            </div>
          )}

          <YearsBlock o={o} />

          <div>
            <IndicatorPicker />
            <p className="mt-2 mb-1 text-xs text-ink-muted">{t(`indicatorHint.${indicator}`)}</p>
            <Trajectory
              series={series}
              format={fmt}
              unit={unit}
              label={chartLabel}
              reference={indicator === 'income' ? 100 : undefined}
              includeZero={indicator === 'soilLost' || indicator === 'labor'}
              shade={
                !isCurrent && transitionEnd > 0
                  ? { to: transitionEnd, label: t('phase.transition') }
                  : undefined
              }
              marker={
                !isCurrent && indicator === 'income' && be != null && be > 1
                  ? { year: be, seriesId: o.strategyId, label: t('breakEven') }
                  : undefined
              }
            />
            <div className="mt-2">
              <SeriesLegend series={series} format={fmt} endLabel={t('inYears', { n: data.horizonYears })} />
            </div>
            {(indicator === 'income' || indicator === 'som') && (
              <p className="mt-1 text-xs text-ink-muted">{t('bandNote')}</p>
            )}
            {!isCurrent && indicator === 'income' && be != null && be > 1 && (
              <p className="mt-1 text-xs text-ink-muted">{t('markerNote')}</p>
            )}
            <details className="mt-2 rounded-2xl bg-black/20 ring-1 ring-line">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <Table2 aria-hidden className="size-4 text-ink-muted" />
                {t('seeData')}
              </summary>
              <div className="px-3 pb-3">
                <SeriesTable series={series} format={fmt} caption={chartLabel} />
              </div>
            </details>
          </div>
        </Fold>

        <Fold title={t('socialTitle')} icon={HeartHandshake} open={false}>
          <p className="text-ink-muted">{t('socialHint')}</p>
          <SocialSection
            data={data}
            o={o}
            base={base}
            color={color}
            baseColor={baseColor}
            fieldId={analysis.field.id}
          />
        </Fold>

        <Fold title={t('assumptions')} icon={CircleHelp} open={false}>
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
            {data.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Fold>
        <Fold title={t('sources', { n: data.references.length })} icon={BookMarked} open={false}>
          <SourcesList references={data.references} />
        </Fold>
        <p className="text-xs text-ink-muted">{data.disclaimer}</p>
      </div>
    </ReferencesProvider>
  );
}

/** Los años por fase y la lista de hitos con su fuente. */
function YearsBlock({ o }: { o: StrategyOutlook }) {
  const t = useTranslations('rotations.outlook');
  return (
    <div className="flex flex-col gap-3">
      <YearStrip years={o.years} milestones={o.milestones} />
      {o.milestones.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">{t('milestones')}</p>
          <ol className="flex flex-col gap-1.5">
            {o.milestones.map((m, i) => {
              const Icon = MILESTONE_ICON[m.kind];
              return (
                <li key={i} className="flex gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sun/15 text-sun">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <p className="min-w-0 flex-1">
                    <span className="font-semibold">{t('yearN', { n: m.year })}:</span> {m.text}
                    <Cite ids={m.refIds} />
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

/** El suelo salvado se muestra en la unidad de profundidad elegida, aunque la gráfica muestre otro indicador. */
function SoilDepth({ mm }: { mm: number }) {
  const { fmt } = useIndicatorFormat()('soilLost');
  return <>{fmt(Math.max(0, mm))}</>;
}
