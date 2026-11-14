'use client';

import { curveMonotoneX } from '@visx/curve';
import { useUnits } from '@/lib/units';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar, Line, LinePath } from '@visx/shape';
import clsx from 'clsx';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Mountain,
  Snowflake,
  Thermometer,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import type { GlossaryTerm } from '@/features/glossary/terms';
import type { ClimateProfile, Confidence, DataSource, FieldInsights, Level } from '@/lib/api/contract';

type Status = 'good' | 'watch' | 'alert';
const STATUS: Record<Status, { Icon: LucideIcon; cls: string; pattern: string }> = {
  good: { Icon: CheckCircle2, cls: 'text-risk-low', pattern: '' },
  watch: { Icon: AlertTriangle, cls: 'text-risk-medium', pattern: 'pattern-dots' },
  alert: { Icon: AlertOctagon, cls: 'text-risk-high', pattern: 'pattern-hatch' },
};
const levelStatus = (l: Level): Status => (l === 'high' ? 'alert' : l === 'medium' ? 'watch' : 'good');

export function StatusChip({ status }: { status: Status }) {
  const t = useTranslations('panel');
  const s = STATUS[status];
  return (
    <span className={clsx('relative inline-flex items-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-xs font-bold', s.cls)}>
      <span aria-hidden className={clsx('absolute inset-0 opacity-25', s.pattern || 'bg-current')} />
      <span aria-hidden className="absolute inset-0 bg-current opacity-10" />
      <s.Icon aria-hidden className="relative size-3.5" />
      <span className="relative">{t(`status.${status}`)}</span>
    </span>
  );
}

type Card = {
  icon: LucideIcon;
  title: string;
  text: string;
  status: Status;
  source: DataSource | string;
  confidence: Confidence;
  term?: GlossaryTerm;
};

/** 3–4 tarjetas grandes: semáforo con ícono + texto (no solo color), fuente NASA y confianza. */
export function SummaryCards({ climate, insights }: { climate: ClimateProfile; insights?: FieldInsights }) {
  const t = useTranslations('panel');
  const u = useUnits();
  const s = climate.summary;
  const frostDays = climate.months.reduce((a, m) => a + (m.frostDays.value ?? 0), 0);
  const cards: Card[] = [];

  if (s.precipChangePct != null) {
    const p = s.precipChangePct;
    cards.push({
      icon: CloudRain,
      title: t('summary.rain'),
      text: Math.abs(p) < 5 ? t('summary.rainSame') : p < 0 ? t('summary.rainLess', { pct: Math.abs(p) }) : t('summary.rainMore', { pct: p }),
      status: p <= -15 ? 'alert' : p <= -5 ? 'watch' : 'good',
      source: 'NASA POWER',
      confidence: 'medium',
      term: 'rain',
    });
  }
  if (s.tempChangeC != null) {
    cards.push({
      icon: Thermometer,
      title: t('summary.temp'),
      text: s.tempChangeC >= 0.1 ? t('summary.tempUp', { c: u.tempDelta(s.tempChangeC) }) : t('summary.tempSame'),
      status: s.tempChangeC >= 1 ? 'alert' : s.tempChangeC >= 0.4 ? 'watch' : 'good',
      source: 'NASA POWER',
      confidence: 'high',
      term: 'heat',
    });
  }
  cards.push({
    icon: Snowflake,
    title: t('summary.frost'),
    text: t(`summary.frostLevel.${frostDays >= 60 ? 'high' : frostDays >= 10 ? 'medium' : 'low'}`, { days: Math.round(frostDays) }),
    status: frostDays >= 60 ? 'alert' : frostDays >= 10 ? 'watch' : 'good',
    source: 'NASA POWER',
    confidence: 'medium',
    term: 'frost',
  });
  if (insights) {
    const w = insights.waterTrend;
    cards.push({
      icon: Waves,
      title: t('summary.groundwater'),
      text: t(`summary.water.${w.direction}`, { cm: Math.abs(w.cmPerYear ?? 0) }),
      status: w.direction === 'down' ? ((w.cmPerYear ?? 0) <= -1 ? 'alert' : 'watch') : 'good',
      source: 'GRACE-FO',
      confidence: w.confidence,
      term: 'grace',
    });
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {cards.map((c) => (
        <li key={c.title} className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <c.icon aria-hidden className="size-5" />
            </span>
            <h4 className="flex-1 font-semibold">{c.term ? <GlossaryLink term={c.term}>{c.title}</GlossaryLink> : c.title}</h4>
            <StatusChip status={c.status} />
          </div>
          <p className="mt-2 text-base leading-snug">{c.text}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {c.source} · {t(`confidence.${c.confidence}`)}
          </p>
        </li>
      ))}
    </ul>
  );
}

const TW = 300;
const TH = 70;

/** Tendencias de 20+ años (NASA POWER): temperatura media anual y lluvia anual, con la anomalía explicada. */
export function TrendCharts({ climate }: { climate: ClimateProfile }) {
  const t = useTranslations('panel');
  const u = useUnits();
  const data = climate.trend.filter((p) => p.tMean != null && p.precip != null);
  if (data.length < 5) return <p className="text-sm text-ink-muted">{t('trends.notEnough')}</p>;
  const first = data[0]!.year;
  const last = data.at(-1)!.year;
  const s = climate.summary;

  const x = scaleBand<number>({ domain: data.map((d) => d.year), range: [0, TW], padding: 0.2 });
  const temps = data.map((d) => d.tMean!);
  const yT = scaleLinear<number>({ domain: [Math.min(...temps) - 0.3, Math.max(...temps) + 0.3], range: [TH - 4, 4] });
  const rains = data.map((d) => d.precip!);
  const meanRain = rains.reduce((a, b) => a + b, 0) / rains.length;
  const yR = scaleLinear<number>({ domain: [0, Math.max(...rains) * 1.05], range: [TH, 4] });

  // Línea de tendencia (mínimos cuadrados) para la temperatura.
  const n = data.length;
  const xs = data.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = temps.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((a, xi, i) => a + (xi - mx) * (temps[i]! - my), 0) / xs.reduce((a, xi) => a + (xi - mx) ** 2, 0);
  const trendY = (i: number) => yT(my + slope * (i - mx));
  const cx = (yr: number) => (x(yr) ?? 0) + x.bandwidth() / 2;

  const anomaly =
    s.latestYearPrecipAnomalyPct == null
      ? null
      : Math.abs(s.latestYearPrecipAnomalyPct) < 5
        ? t('trends.rainNormal', { year: climate.latestYear })
        : s.latestYearPrecipAnomalyPct < 0
          ? t('trends.rainBelow', { year: climate.latestYear, pct: Math.abs(s.latestYearPrecipAnomalyPct) })
          : t('trends.rainAbove', { year: climate.latestYear, pct: s.latestYearPrecipAnomalyPct });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <figure className="m-0">
        <figcaption className="mb-1 text-sm font-semibold">
          {t('trends.tempTitle')}{' '}
          <span className="font-normal text-ink-muted">
            {first}–{last}
          </span>
        </figcaption>
        <svg
          viewBox={`0 0 ${TW} ${TH}`}
          className="h-20 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={t('trends.tempA11y', {
            first,
            last,
            a: u.temp(temps[0]!),
            b: u.temp(temps.at(-1)!),
            change: `${(s.tempChangeC ?? 0) >= 0 ? '+' : ''}${u.tempDelta(s.tempChangeC ?? 0)}`,
          })}
        >
          <LinePath data={data} x={(d) => cx(d.year)} y={(d) => yT(d.tMean!)} curve={curveMonotoneX} stroke="#ff9e7a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <Line from={{ x: cx(first), y: trendY(0) }} to={{ x: cx(last), y: trendY(n - 1) }} stroke="#ffffff" strokeOpacity={0.7} strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="text-sm">
          {s.tempChangeC != null && s.tempChangeC >= 0.1 ? t('trends.tempWarmer', { c: u.tempDelta(s.tempChangeC) }) : t('trends.tempStable')}
        </p>
      </figure>

      <figure className="m-0">
        <figcaption className="mb-1 text-sm font-semibold">
          {t('trends.rainTitle')}{' '}
          <span className="font-normal text-ink-muted">
            {first}–{last}
          </span>
        </figcaption>
        <svg
          viewBox={`0 0 ${TW} ${TH}`}
          className="h-20 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={t('trends.rainA11y', { first, last, mean: u.rain(meanRain), latest: u.rain(rains.at(-1)!) })}
        >
          {data.map((d) => (
            <Bar
              key={d.year}
              x={x(d.year)}
              y={yR(d.precip!)}
              width={x.bandwidth()}
              height={TH - yR(d.precip!)}
              fill={d.precip! < meanRain * 0.85 ? 'rgb(255 201 77 / 0.75)' : 'rgb(124 196 255 / 0.6)'}
              rx={1.5}
            />
          ))}
          <Line from={{ x: 0, y: yR(meanRain) }} to={{ x: TW, y: yR(meanRain) }} stroke="#ffffff" strokeOpacity={0.6} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="text-sm">{anomaly}</p>
        <p className="text-xs text-ink-faint">{t('trends.rainLegend', { mean: u.rain(meanRain) })}</p>
      </figure>
      <p className="text-xs text-ink-faint sm:col-span-2">
        NASA POWER · 0.5° × 0.625° ·{' '}
        <GlossaryLink term="anomaly">{t('trends.whatIsAnomaly')}</GlossaryLink>
      </p>
    </div>
  );
}

/** Erosión (pendiente + lluvias fuertes) y encharcamiento; mini mapa de zonas si el backend lo da. */
export function TerrainRisks({ insights }: { insights: FieldInsights }) {
  const t = useTranslations('panel');
  const e = insights.erosionRisk;
  const w = insights.waterloggingRisk;
  const zones = insights.zones?.features ?? [];

  let zoneSvg: React.ReactNode = null;
  if (zones.length) {
    const pts = zones.flatMap((f) => f.geometry.coordinates[0]!);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const sx = (v: number) => ((v - x0) / (x1 - x0 || 1)) * 200;
    const sy = (v: number) => 120 - ((v - y0) / (y1 - y0 || 1)) * 120;
    const fill = { low: '#5ee08f', medium: '#ffc94d', high: '#ff7b72' } as const;
    zoneSvg = (
      <svg viewBox="0 0 200 120" className="mt-2 h-32 w-full rounded-xl bg-black/20" role="img" aria-label={zones.map((z) => `${z.properties.label}: ${t(`level.${z.properties.risk}`)}`).join('; ')}>
        {zones.map((z, i) => (
          <polygon key={i} points={z.geometry.coordinates[0]!.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} fill={fill[z.properties.risk]} fillOpacity={0.55} stroke="#fff" strokeWidth={0.8} />
        ))}
      </svg>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
        <div className="flex items-center gap-2">
          <Mountain aria-hidden className="size-5" />
          <h4 className="flex-1 font-semibold">
            <GlossaryLink term="slope">{t('terrain.erosion')}</GlossaryLink>
          </h4>
          <StatusChip status={levelStatus(e.level)} />
        </div>
        <p className="mt-1.5 text-sm">{e.explanation}</p>
        <p className="mt-1 text-xs text-ink-faint">
          {e.slopePct != null && t('terrain.slope', { pct: e.slopePct })}
          {e.extremeRainDaysPerYear != null && ` · ${t('terrain.extremeRain', { days: e.extremeRainDaysPerYear })}`} · {e.source.join(', ')}
        </p>
      </div>
      {w && (
        <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <CloudRain aria-hidden className="size-5" />
            <h4 className="flex-1 font-semibold">{t('terrain.waterlogging')}</h4>
            <StatusChip status={levelStatus(w.level)} />
          </div>
          <p className="mt-1.5 text-sm">{w.explanation}</p>
        </div>
      )}
      {zoneSvg ?? <p className="text-xs text-ink-faint">{t('terrain.noZones')}</p>}
    </div>
  );
}
