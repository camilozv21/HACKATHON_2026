'use client';

import { BookMarked, CircleHelp, Hourglass, Table2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId } from 'react';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import type { Ranked } from '@/features/priorities/ranking';
import type { AnalysisResponse, RotationStrategy } from '@/lib/api/contract';
import type { OutlookResponse } from '@/lib/api/outlook';
import { seriesColor } from '../colors';
import { SeriesLegend, SeriesTable, Trajectory, type Series } from './charts';
import { HouseholdQuestions } from './HouseholdQuestions';
import { Fold, IndicatorPicker, PacePicker, toSeries, useIndicatorFormat } from './parts';
import { Cite, ReferencesProvider, SourcesList } from './Sources';
import { useOutlookStore } from './store';
import { useOutlook } from './useOutlook';

type Item = Ranked<RotationStrategy>;

/** La frase que resume la mejor opción en el tiempo: bache del primer año, suelo que se salva, materia orgánica. */
function Takeaway({ data, item, currentId }: { data: OutlookResponse; item: Item; currentId?: string }) {
  const t = useTranslations('rotations.outlook.takeaway');
  const format = useFormatter();
  const depth = useIndicatorFormat()('soilLost').fmt;
  const o = data.strategies.find((s) => s.strategyId === item.strategy.id);
  const cur = data.strategies.find((s) => s.strategyId === currentId);
  if (!o) return null;
  const name = item.strategy.name;
  const last = o.years.at(-1)!;
  const saved = cur ? cur.years.at(-1)!.soilLostMm - last.soilLostMm : 0;
  const from = data.baseline.soilOrganicMatterPct;
  const to = last.soilOrganicMatterPct.mid;
  const n = data.horizonYears;
  const pct = (v: number) => format.number(v, { maximumFractionDigits: 1 });
  const be = o.breakEvenYear;
  return (
    <div className="rounded-2xl bg-field-500/10 p-3 text-sm ring-1 ring-field-500/40">
      <p className="font-semibold">{t('title', { name })}</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 marker:text-field-300">
        <li>
          {be === 1 ? t('noDip') : be == null ? t('noRecover', { n }) : t('dip', { year: be })}
          <Cite ids={['sare-2019', 'pittelkow-2015-fcr']} />
        </li>
        {saved >= 0.5 && (
          <li>
            {t('soilSaved', { n, depth: depth(saved) })}
            <Cite ids={['montgomery-2007', 'bakker-2004']} />
          </li>
        )}
        {to - from >= 0.05 && (
          <li>
            {t('som', { from: pct(from), to: pct(to), n })}
            <Cite ids={['poeplau-don-2015']} />
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * "Tu finca en 10 años": la rotación en el tiempo, no solo en un ciclo. Una línea por opción (mismo color que en la
 * tabla), con el ritmo del cambio, las preguntas a la familia y las fuentes.
 */
export default function OutlookOverview({
  analysis,
  ranked,
  colorIndex,
}: {
  analysis: AnalysisResponse;
  ranked: Item[];
  colorIndex: Record<string, number>;
}) {
  const t = useTranslations('rotations.outlook');
  const id = useId();
  const q = useOutlook(analysis);
  const indicator = useOutlookStore((s) => s.indicator);
  const fmtOf = useIndicatorFormat();
  const { unit, fmt } = fmtOf(indicator);
  const data = q.data;
  const top = ranked.find((r) => !r.strategy.isCurrent);

  const series: Series[] = data
    ? ranked.flatMap((r) => {
        const o = data.strategies.find((s) => s.strategyId === r.strategy.id);
        if (!o) return [];
        const label = r.strategy.isCurrent ? t('todayLabel') : r.strategy.name;
        return [toSeries(o, indicator, data, { label, color: seriesColor(colorIndex[r.strategy.id] ?? 0) })];
      })
    : [];

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4 ring-1 ring-line">
      <div>
        <h4 id={`${id}-t`} className="flex items-center gap-2 text-base font-bold">
          <Hourglass aria-hidden className="size-5 text-field-300" />
          {t('title', { n: data?.horizonYears ?? 10 })}
        </h4>
        <p className="mt-0.5 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <IndicatorPicker />
      <PacePicker />

      {q.isError && !data && <p className="rounded-xl bg-risk-medium/10 p-3 text-sm ring-1 ring-risk-medium/40">{t('error')}</p>}
      {!data && !q.isError && <div aria-hidden className="shimmer h-56 rounded-2xl" />}

      {data && (
        <ReferencesProvider references={data.references} scope={`ov-${id.replace(/:/g, '')}`}>
          <div aria-busy={q.isFetching} className={q.isFetching ? 'opacity-70 transition-opacity' : undefined}>
            <p className="mb-1 text-xs text-ink-muted">
              {t(`indicatorHint.${indicator}`)}{' '}
              {indicator === 'som' && <GlossaryLink term="organic-matter" />}
              {indicator === 'soilLost' && <GlossaryLink term="soil-loss" />}
              {indicator === 'labor' && <GlossaryLink term="workday" />}
              {indicator === 'income' && <GlossaryLink term="break-even" />}
            </p>
            <Trajectory
              series={series}
              format={fmt}
              unit={unit}
              label={t('chartLabel', { indicator: t(`indicators.${indicator}`), n: data.horizonYears })}
              reference={indicator === 'income' ? 100 : undefined}
              includeZero={indicator === 'soilLost' || indicator === 'labor'}
            />
            <div className="mt-2">
              <SeriesLegend series={series} format={fmt} endLabel={t('inYears', { n: data.horizonYears })} />
            </div>
          </div>

          {top && <Takeaway data={data} item={top} currentId={ranked.find((r) => r.strategy.isCurrent)?.strategy.id} />}

          <details className="group rounded-2xl bg-black/20 ring-1 ring-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <Table2 aria-hidden className="size-4 text-ink-muted" />
              {t('seeData')}
            </summary>
            <div className="px-3 pb-3">
              <SeriesTable series={series} format={fmt} caption={t('chartLabel', { indicator: t(`indicators.${indicator}`), n: data.horizonYears })} />
            </div>
          </details>

          <HouseholdQuestions fieldId={analysis.field.id} />

          {data.context.facts.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {data.context.facts.map((f) => (
                <li key={f.id} className="rounded-xl bg-black/20 p-3 ring-1 ring-line">
                  {f.text}
                  <Cite ids={f.refIds} />
                </li>
              ))}
            </ul>
          )}

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
        </ReferencesProvider>
      )}
    </section>
  );
}
