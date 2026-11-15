'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleHelp, Map as MapIcon, RefreshCw, Table2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import { useLayerStore } from '@/features/layers/store';
import type { Level } from '@/lib/api/contract';
import { dptoOf, fetchTerrainDetail, fetchTerrainIndex, terrainKeys, type TerrainIndex, type TerrainItem } from '@/lib/api/terrain';
import { useUnits } from '@/lib/units';
import { MarkovDiagram, MatrixTable, StateBars, StateLegend, StateTrend, TrendTable } from './charts';
import { HAZARDS, LAND_STATES, type Hazard, type RiskKind } from './kinds';
import { fromJoint, normalize, pct, project, stationary, summarize } from './markov';
import { RISK_ICON, LevelSwatch } from './RiskLegend';
import { scoreTerrain, type Evidence, type IndicatorId } from './score';
import { useRiskStore } from './store';

const LEVEL_STYLE = {
  low: { Icon: CheckCircle2, cls: 'text-risk-low bg-risk-low/15' },
  medium: { Icon: AlertTriangle, cls: 'text-risk-medium bg-risk-medium/15' },
  high: { Icon: AlertOctagon, cls: 'text-risk-high bg-risk-high/15' },
  none: { Icon: CircleHelp, cls: 'text-ink-muted bg-white/10' },
} as const;

/** Nivel con ícono, texto y el mismo patrón que en el mapa (no depende solo del color). */
function LevelChip({ level }: { level: Level | null }) {
  const t = useTranslations('terrain');
  const key = level ?? 'none';
  const { Icon, cls } = LEVEL_STYLE[key];
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', cls)}>
      <Icon aria-hidden className="size-3.5" />
      {t(`levels.${key}`)}
      <LevelSwatch level={key} className="size-3" />
    </span>
  );
}

type T = ReturnType<typeof useTranslations>;
type Fmt = ReturnType<typeof useFormatter>;
type Units = ReturnType<typeof useUnits>;

/** Frase corta de evidencia para cada indicador, con su unidad. */
function evidenceText(e: Evidence, item: TerrainItem, t: T, u: Units, format: Fmt): string {
  const n = (v: number, d = 0) => format.number(Math.abs(v), { maximumFractionDigits: d });
  const v = e.value;
  switch (e.id) {
    case 'smAnom':
      return t(v < 0 ? 'evidence.smAnomDown' : 'evidence.smAnomUp', { n: n(v) });
    case 'pAnom':
      return t(v < 0 ? 'evidence.pAnomDown' : 'evidence.pAnomUp', { n: n(v) });
    case 'etRatio':
      return t('evidence.etRatio', { n: n(v * 100) });
    case 'gwTrend':
      return t(v < 0 ? 'evidence.gwDown' : 'evidence.gwUp', { amount: u.rain(Math.abs(v) * 10) });
    case 'pHeavy':
      return t('evidence.pHeavy', { n: n(v, 1), rain: u.rain(50) });
    case 'smWet':
      return t('evidence.smWet', { n: n(v) });
    case 'flat':
      return t('evidence.flat', { n: n(v) });
    case 'waterShare':
      return t('evidence.waterShare', { n: n(v) });
    case 'lstHot':
      return t('evidence.lstHot', { n: n(v), temp: u.temp(35) });
    case 'lstAnom':
      return t(v >= 0 ? 'evidence.lstWarmer' : 'evidence.lstCooler', { amount: u.tempDelta(Math.abs(v)) });
    case 'toBare':
      return t('evidence.toBare', { n: n(v, 1) });
    case 'ndviTrend':
      return t(v < 0 ? 'evidence.ndviDown' : 'evidence.ndviUp', { n: n(v, 2) });
    case 'mfi':
      return t('evidence.mfi', { n: n(v), slope: n(item.i.slope ?? 0) });
    case 'slope':
      return t('evidence.slope', { n: n(v) });
  }
}

function useTerrainData(code: string) {
  const dpto = dptoOf(code);
  const index = useQuery({ queryKey: terrainKeys.index, queryFn: fetchTerrainIndex, staleTime: Infinity });
  const detail = useQuery({
    queryKey: terrainKeys.detail(dpto),
    queryFn: ({ signal }) => fetchTerrainDetail(dpto, signal),
    staleTime: Infinity,
  });
  return { index, detail };
}

/**
 * Sección del drawer de región (municipio o departamento de Colombia): zonas de riesgo con su evidencia, y cómo
 * ha cambiado el terreno (estado inicial → estado final, cadena de Markov y tendencia).
 */
export default function TerrainSection({ code, onSeeOnMap }: { code: string; onSeeOnMap?: () => void }) {
  const t = useTranslations('terrain');
  const { index, detail } = useTerrainData(code);

  if (index.isPending || (detail.isPending && !detail.isError)) {
    return <div aria-label={t('loading')} className="shimmer h-48 rounded-2xl" />;
  }
  if (index.isError || detail.isError) {
    return (
      <div className="rounded-2xl bg-white/5 p-4 text-sm ring-1 ring-line">
        <p>{t('error')}</p>
        <button
          type="button"
          onClick={() => {
            void index.refetch();
            void detail.refetch();
          }}
          className="mt-2 flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 font-semibold hover:bg-white/15"
        >
          <RefreshCw aria-hidden className="size-4" />
          {t('retry')}
        </button>
      </div>
    );
  }
  const item = index.data.items[code];
  const markov = detail.data.items[code];
  if (!item) return <p className="rounded-2xl bg-white/5 p-4 text-sm text-ink-muted ring-1 ring-line">{t('noData')}</p>;

  return (
    <div className="flex flex-col gap-2">
      <RiskCard item={item} index={index.data} onSeeOnMap={onSeeOnMap} />
      {markov && <ChangeCard t16={markov.t} years={index.data.periods.years} y={markov.y} periods={index.data.periods} synthetic={index.data.source !== 'gee'} />}
    </div>
  );
}

function RiskCard({ item, index, onSeeOnMap }: { item: TerrainItem; index: TerrainIndex; onSeeOnMap?: () => void }) {
  const t = useTranslations('terrain');
  const tr = useTranslations('region');
  const format = useFormatter();
  const units = useUnits();
  const synthetic = index.source !== 'gee';
  const risk = useMemo(() => scoreTerrain(item, { synthetic }), [item, synthetic]);

  const seeOnMap = (kind: RiskKind) => {
    useRiskStore.getState().setKind(kind);
    useLayerStore.getState().setLayer('risk');
    onSeeOnMap?.();
  };

  const missing = Array.from(new Set(HAZARDS.flatMap((h) => risk.hazards[h].missing))) as IndicatorId[];

  return (
    <section aria-labelledby="terrain-risk-title" className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="terrain-risk-title" className="flex-1 font-bold">
          {t('riskTitle')}
        </h3>
        {synthetic && <span className="rounded-full bg-sun/15 px-2 py-0.5 text-xs font-semibold text-sun">{t('simulated')}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {t('riskIntro', { initial: index.periods.initial.label, final: index.periods.final.label })}{' '}
        <GlossaryLink term="risk-zone">{t('whatIsRisk')}</GlossaryLink>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t('kinds.all')}:</span>
        <LevelChip level={risk.all.level} />
        {risk.all.top && risk.all.level !== 'low' && (
          <span className="text-sm text-ink-muted">{t('mostly', { hazard: t(`kinds.${risk.all.top}`).toLowerCase() })}</span>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {HAZARDS.map((h: Hazard) => {
          const r = risk.hazards[h];
          const Icon = RISK_ICON[h];
          const shown = r.evidence.filter((e) => e.points > 0).slice(0, 2);
          const lines = shown.length ? shown : r.evidence.slice(0, 1);
          return (
            <li key={h} className="rounded-xl bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <Icon aria-hidden className="size-5 shrink-0 text-ink-muted" />
                <p className="flex-1 font-semibold">{t(`kinds.${h}`)}</p>
                <LevelChip level={r.level} />
              </div>
              {lines.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                  {lines.map((e, k) => (
                    <li key={e.id} className={clsx('flex gap-1.5', k > 0 && 'lite:hidden')}>
                      <span aria-hidden className="text-ink-faint">
                        ·
                      </span>
                      <span>
                        {evidenceText(e, item, t, units, format)} <span className="text-xs text-ink-faint lite:hidden">({e.source})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => seeOnMap(h)}
                className="mt-1 -ml-1 flex min-h-11 items-center gap-1.5 rounded-full px-2 text-left text-sm font-semibold text-sky-glow hover:bg-white/10"
              >
                <MapIcon aria-hidden className="size-4 shrink-0" />
                {t('seeOnMap', { hazard: t(`kinds.${h}`).toLowerCase() })}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-sm">
        <GlossaryLink term="confidence">{tr(`confidence.${risk.confidence}`)}</GlossaryLink>
      </p>
      <div className="mt-2 rounded-xl bg-white/5 p-3 text-sm ring-1 ring-line">
        <p className="font-semibold">{t('gaps.title')}</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-ink-muted">
          {synthetic && <li>{t('gaps.synthetic')}</li>}
          <li>{t('gaps.valid', { n: pct(item.v) })}</li>
          <li>{t('gaps.grace')}</li>
          {!synthetic && <li>{t('gaps.lstDrift')}</li>}
          {missing.length > 0 && <li>{t('gaps.missing', { list: missing.map((m) => t(`indicators.${m}`)).join(', ') })}</li>}
          <li>{t('gaps.average')}</li>
        </ul>
      </div>
    </section>
  );
}

function ChangeCard({
  t16,
  years,
  y,
  periods,
  synthetic,
}: {
  t16: number[];
  years: number[];
  y: number[][];
  periods: TerrainIndex['periods'];
  synthetic: boolean;
}) {
  const t = useTranslations('terrain');
  const [table, setTable] = useState(false);
  const { P, p0, p1 } = useMemo(() => fromJoint(t16), [t16]);
  const s = useMemo(() => summarize(p0, p1, P), [p0, p1, P]);
  const series = useMemo(() => y.map((row) => normalize(row)), [y]);
  const finalCenter = Math.round((periods.final.years[0] + periods.final.years[1]) / 2);
  const projYear = finalCenter + periods.stepYears;
  const proj = useMemo(() => project(p1, P, 1), [p1, P]);
  const longRun = useMemo(() => stationary(P), [P]);
  const lower = (st: (typeof LAND_STATES)[number]) => t(`states.${st}.lower`);
  const TrendIcon = s.trend === 'improving' ? TrendingUp : s.trend === 'worsening' ? TrendingDown : Minus;
  const periodsLabel = `${periods.initial.label} → ${periods.final.label}`;

  return (
    <section aria-labelledby="terrain-change-title" className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="terrain-change-title" className="flex-1 font-bold">
          {t('changeTitle')}
        </h3>
        {synthetic && <span className="rounded-full bg-sun/15 px-2 py-0.5 text-xs font-semibold text-sun">{t('simulated')}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {t('changeIntro')} <GlossaryLink term="land-state">{t('whatAreStates')}</GlossaryLink>
      </p>

      <p className="mt-3 flex items-start gap-2 font-semibold">
        <TrendIcon
          aria-hidden
          className={clsx(
            'mt-0.5 size-5 shrink-0',
            s.trend === 'improving' ? 'text-risk-low' : s.trend === 'worsening' ? 'text-risk-high' : 'text-ink-muted',
          )}
        />
        <span>{t(`change.trend.${s.trend}`)}</span>
      </p>
      <p className="mt-1 text-sm">
        {t('change.biggest', { state: lower(s.biggest.state), from: pct(s.biggest.from), to: pct(s.biggest.to) })}
        {s.mainFlow && <> {t('change.mainFlow', { n: pct(s.mainFlow.share), from: lower(s.mainFlow.from), to: lower(s.mainFlow.to) })}</>}
      </p>

      <h4 className="mt-4 text-xs font-semibold tracking-wider text-ink-faint uppercase">{t('initialFinal')}</h4>
      <div className="mt-2">
        <StateBars
          rows={[
            { label: periods.initial.label, p: p0 },
            { label: periods.final.label, p: p1 },
          ]}
        />
      </div>
      <div className="mt-2">
        <StateLegend p0={p0} p1={p1} />
      </div>

      <div className="lite:hidden">
        <h4 className="mt-4 flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-faint uppercase">
          {t('diagramTitle')}
          <GlossaryLink term="markov">
            <span className="normal-case">{t('whatIsMarkov')}</span>
          </GlossaryLink>
        </h4>
        <p className="mt-1 text-xs text-ink-muted">{t('diagramHint')}</p>
        <div className="mt-2">
          <MarkovDiagram P={P} p0={p0} p1={p1} periods={periodsLabel} />
        </div>

        <h4 className="mt-4 text-xs font-semibold tracking-wider text-ink-faint uppercase">{t('trendTitle')}</h4>
        <div className="mt-2">
          <StateTrend years={years} series={series} projection={{ year: projYear, p: proj }} />
        </div>
        <button
          type="button"
          aria-expanded={table}
          onClick={() => setTable((v) => !v)}
          className="mt-1 -ml-1 flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold hover:bg-white/10"
        >
          <Table2 aria-hidden className="size-4" />
          {table ? t('table.hide') : t('table.show')}
        </button>
        {table && (
          <div className="mt-1 flex flex-col gap-3">
            <MatrixTable P={P} caption={t('table.matrixCaption', { periods: periodsLabel })} />
            <TrendTable years={years} series={series} caption={t('table.trendCaption')} />
            <p className="text-xs text-ink-muted">
              {t('change.longRun', { list: LAND_STATES.map((st, i) => `${t(`states.${st}.lower`)} ${pct(longRun[i] ?? 0)} %`).join(', ') })}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 rounded-xl bg-sky-glow/10 p-3 text-sm ring-1 ring-sky-glow/30">
        {t('change.projection', {
          year: projYear,
          healthy: pct(proj[0] ?? 0),
          stressed: pct(proj[1] ?? 0),
          bare: pct(proj[2] ?? 0),
          water: pct(proj[3] ?? 0),
        })}
      </p>
      <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-xs text-ink-muted">
        <li>{t('notes.average')}</li>
        <li>{t('notes.projection')}</li>
        <li className="font-semibold text-ink">{t('notes.support')}</li>
      </ul>
    </section>
  );
}
