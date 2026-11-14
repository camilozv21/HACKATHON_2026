'use client';

import { scaleBand, scaleLinear } from '@visx/scale';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  ChevronDown,
  CloudRain,
  Droplets,
  History,
  Map as MapIcon,
  RotateCcw,
  Snowflake,
  Sun,
  Thermometer,
  type LucideIcon,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { LayerId } from '@/features/layers/ids';
import { showEvidenceOnMap } from '@/features/rotations/mapLink';
import type { ClimateProfile } from '@/lib/api/contract';
import { usePowerDaily } from '@/lib/api/hooks';
import { useUnits } from '@/lib/units';
import { RULES, summarizePeriod, type EventKind, type FieldEvent } from './events';
import { daysInMonth, periodLabel, periodOf, type TimeSel } from './period';

const EVENT_ICON: Record<EventKind, LucideIcon> = { heavyRain: CloudRain, drySpell: Sun, heat: Thermometer, frost: Snowflake };
const EVENT_LAYER: Record<EventKind, LayerId> = { heavyRain: 'rain', drySpell: 'soil-moisture', heat: 'lst-day', frost: 'lst-night' };
const EVENT_TONE: Record<EventKind, string> = {
  heavyRain: 'text-sky-glow bg-sky-glow/15',
  drySpell: 'text-risk-medium bg-risk-medium/15',
  heat: 'text-risk-high bg-risk-high/15',
  frost: 'text-sky-glow bg-sky-glow/15',
};

const W = 340;
const H = 120;

/** Lluvia diaria del periodo: barras, línea de lo normal y el día elegido resaltado. Tocar/arrastrar muestra el dato. */
function DailyChart({
  days,
  normal,
  focus,
  heavy,
}: {
  days: { date: string; precip: number | null; tmax: number | null; tmin: number | null }[];
  normal: number | null;
  focus: string | null;
  heavy: Set<string>;
}) {
  const t = useTranslations('time.past');
  const u = useUnits();
  const format = useFormatter();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, normal ?? 0, ...days.map((d) => d.precip ?? 0));
  const x = scaleBand<number>({ domain: days.map((_, i) => i), range: [0, W], padding: 0.2 });
  const y = scaleLinear<number>({ domain: [0, max * 1.1], range: [H, 0] });
  const shown = active ?? (focus ? days.findIndex((d) => d.date === focus) : -1);
  const d = shown >= 0 ? days[shown] : null;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * days.length);
    setActive(Math.min(days.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="m-0">
      <p className="min-h-5 text-xs text-ink-muted tabular-nums" aria-live="polite">
        {d
          ? t('readout', {
              day: format.dateTime(new Date(`${d.date}T12:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' }),
              rain: d.precip == null ? '—' : u.rain(d.precip),
              tmax: d.tmax == null ? '—' : u.temp(d.tmax),
              tmin: d.tmin == null ? '—' : u.temp(d.tmin),
            })
          : t('tapHint')}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H + 14}`}
        className="h-36 w-full touch-none"
        preserveAspectRatio="none"
        aria-hidden
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget)}
      >
        {days.map((day, i) => {
          const v = day.precip ?? 0;
          const top = y(v);
          const isFocus = day.date === focus || i === active;
          return (
            <rect
              key={day.date}
              x={x(i)}
              y={top}
              width={x.bandwidth()}
              height={Math.max(0, H - top)}
              rx={1.5}
              fill={isFocus ? 'var(--color-sun)' : heavy.has(day.date) ? 'var(--color-sky-glow)' : 'rgb(124 196 255 / 0.55)'}
              opacity={day.precip == null ? 0.25 : 1}
            />
          );
        })}
        {normal != null && (
          <g>
            <line x1={0} x2={W} y1={y(normal)} y2={y(normal)} stroke="currentColor" strokeOpacity={0.6} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          </g>
        )}
        <line x1={0} x2={W} y1={H} y2={H} stroke="currentColor" strokeOpacity={0.3} vectorEffect="non-scaling-stroke" />
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text key={i} x={(x(i) ?? 0) + x.bandwidth() / 2} y={H + 11} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.6}>
            {Number(days[i]?.date.slice(8, 10))}
          </text>
        ))}
      </svg>
      <figcaption className="text-[11px] text-ink-faint">{normal != null ? t('chartLegendNormal', { normal: u.rain(normal) }) : t('chartLegend')}</figcaption>
    </figure>
  );
}

/**
 * "Lo que pasó en mayo de 2026": lluvia diaria real de NASA POWER en la finca, comparada con lo normal de ese mes,
 * y los eventos reconstruidos (lluvias fuertes, rachas secas, calor extremo, heladas) con "ver en el mapa".
 */
export default function PastPeriodSection({
  sel,
  lat,
  lon,
  climate,
}: {
  sel: TimeSel;
  lat: number;
  lon: number;
  climate?: ClimateProfile;
}) {
  const t = useTranslations('time.past');
  const locale = useLocale();
  const format = useFormatter();
  const u = useUnits();
  const period = useMemo(() => periodOf(sel), [sel]);
  const label = periodLabel({ kind: 'month', ym: period.start.slice(0, 7) }, locale);
  const q = usePowerDaily(lat, lon, period.start, period.end);
  const monthNormal = climate?.months.find((m) => m.month === period.month)?.precip.value ?? null;
  const normalPerDay = monthNormal != null ? monthNormal / daysInMonth(period.year, period.month) : null;
  const summary = useMemo(() => (q.data ? summarizePeriod(q.data, normalPerDay, period.days) : null), [q.data, normalPerDay, period.days]);
  const heavy = useMemo(
    () => new Set((summary?.events ?? []).filter((e) => e.kind === 'heavyRain').flatMap((e) => (q.data ?? []).filter((d) => d.date >= e.start && d.date <= e.end).map((d) => d.date))),
    [summary, q.data],
  );
  const soilAvg = useMemo(() => {
    const xs = (q.data ?? []).map((d) => d.soil).filter((v): v is number => v != null);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  }, [q.data]);

  const fmtDay = (date: string) => format.dateTime(new Date(`${date}T12:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const range = (e: FieldEvent) => (e.start === e.end ? fmtDay(e.start) : t('range', { from: fmtDay(e.start), to: fmtDay(e.end) }));
  const detail = (e: FieldEvent) => {
    if (e.kind === 'heavyRain') return t('events.heavyRain.detail', { rain: u.rain(e.value), days: e.days });
    if (e.kind === 'drySpell') return t('events.drySpell.detail', { days: e.days });
    if (e.kind === 'heat') return t('events.heat.detail', { temp: u.temp(e.value), days: e.days });
    return t('events.frost.detail', { temp: u.temp(e.value), days: e.days });
  };

  return (
    <section aria-labelledby="sec-past" className="flex flex-col gap-3 rounded-3xl bg-sun/5 p-3 ring-1 ring-sun/40">
      <h3 id="sec-past" className="flex items-center gap-2 text-lg font-bold">
        <History aria-hidden className="size-5 text-sun" />
        {t('title', { period: label })}
      </h3>
      {period.partial && <p className="-mt-2 text-xs text-ink-muted">{t('partial', { end: fmtDay(period.end) })}</p>}

      {q.isPending ? (
        <div aria-hidden className="flex flex-col gap-2">
          <div className="shimmer h-20 rounded-2xl" />
          <div className="shimmer h-36 rounded-2xl" />
        </div>
      ) : q.isError || !summary ? (
        <div role="alert" className="rounded-2xl bg-risk-medium/10 p-3 text-sm ring-1 ring-risk-medium/40">
          <p>{t('error')}</p>
          <button type="button" onClick={() => void q.refetch()} className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 font-semibold">
            <RotateCcw aria-hidden className="size-4" />
            {t('retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <CloudRain aria-hidden className="size-4 text-sky-glow" />
                {t('rainTotal')}
              </p>
              <p className="text-2xl font-bold tabular-nums">{u.rain(summary.totalMm)}</p>
              {summary.pct != null && summary.normalMm != null && (
                <p className={clsx('flex items-center gap-1 text-xs font-semibold', Math.abs(summary.pct) < 15 ? 'text-ink-muted' : summary.pct < 0 ? 'text-risk-medium' : 'text-sky-glow')}>
                  {Math.abs(summary.pct) >= 15 && (summary.pct < 0 ? <ArrowDown aria-hidden className="size-3.5" /> : <ArrowUp aria-hidden className="size-3.5" />)}
                  {Math.abs(summary.pct) < 15
                    ? t('nearNormal', { normal: u.rain(summary.normalMm) })
                    : summary.pct < 0
                      ? t('lessThanNormal', { pct: Math.abs(summary.pct), normal: u.rain(summary.normalMm) })
                      : t('moreThanNormal', { pct: summary.pct, normal: u.rain(summary.normalMm) })}
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Droplets aria-hidden className="size-4 text-sky-glow" />
                {t('rainyDays')}
              </p>
              <p className="text-2xl font-bold tabular-nums">{t('daysOf', { n: summary.rainyDays, total: period.days })}</p>
              {summary.wettest && <p className="text-xs text-ink-muted">{t('wettest', { day: fmtDay(summary.wettest.date), rain: u.rain(summary.wettest.mm) })}</p>}
            </div>
            <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Thermometer aria-hidden className="size-4 text-risk-high" />
                {t('extremes')}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {summary.hottest ? t('hottest', { temp: u.temp(summary.hottest.c), day: fmtDay(summary.hottest.date) }) : '—'}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {summary.coldest ? t('coldest', { temp: u.temp(summary.coldest.c), day: fmtDay(summary.coldest.date) }) : '—'}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Droplets aria-hidden className="size-4 text-field-300" />
                {t('soil')}
              </p>
              <p className="text-2xl font-bold tabular-nums">{soilAvg != null ? `${soilAvg} %` : '—'}</p>
              <p className="text-xs text-ink-muted">{t('soilHint')}</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold">{t('chartTitle')}</h4>
            <DailyChart days={q.data!} normal={normalPerDay} focus={period.focus} heavy={heavy} />
            <table className="sr-only">
              <caption>{t('tableCaption', { period: label })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('cols.day')}</th>
                  <th scope="col">{t('cols.rain')}</th>
                  <th scope="col">{t('cols.tmax')}</th>
                  <th scope="col">{t('cols.tmin')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.map((d) => (
                  <tr key={d.date}>
                    <th scope="row">{fmtDay(d.date)}</th>
                    <td>{d.precip == null ? '—' : u.rain(d.precip)}</td>
                    <td>{d.tmax == null ? '—' : u.temp(d.tmax)}</td>
                    <td>{d.tmin == null ? '—' : u.temp(d.tmin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="font-semibold">{t('eventsTitle')}</h4>
            {summary.events.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('noEvents')}</p>
            ) : (
              <ol className="mt-1 flex flex-col gap-2">
                {summary.events.map((e) => {
                  const Icon = EVENT_ICON[e.kind];
                  return (
                    <li key={`${e.kind}-${e.start}`} className="flex gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
                      <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', EVENT_TONE[e.kind])}>
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink-muted tabular-nums">{range(e)}</p>
                        <p className="font-semibold">{t(`events.${e.kind}.title`)}</p>
                        <p className="text-sm text-ink-muted">{detail(e)}</p>
                        <button
                          type="button"
                          onClick={() => showEvidenceOnMap(EVENT_LAYER[e.kind], e.peakDate)}
                          className="mt-1.5 flex min-h-11 items-center gap-1.5 rounded-full bg-sky-glow/15 px-3 text-sm font-semibold text-sky-glow ring-1 ring-sky-glow/40"
                        >
                          <MapIcon aria-hidden className="size-4" />
                          {t('seeOnMap')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <details className="group rounded-2xl bg-white/5 ring-1 ring-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <Calculator aria-hidden className="size-4 text-field-300" />
              <span className="flex-1">{t('rulesTitle')}</span>
              <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="list-disc px-3 pb-3 pl-8 text-xs text-ink-muted">
              <li>{t('rules.heavyRain', { mm: u.rain(RULES.heavyRainMm), min: u.rain(RULES.heavyRainMinMm), factor: RULES.heavyRainFactor })}</li>
              <li>{t('rules.drySpell', { days: RULES.drySpellDays, mm: u.rain(RULES.dryDayMm) })}</li>
              <li>{t('rules.heat', { temp: u.temp(RULES.heatC) })}</li>
              <li>{t('rules.frost', { temp: u.temp(RULES.frostC) })}</li>
            </ul>
          </details>

          <p className="text-[11px] text-ink-faint">
            {t('source', { baseline: climate?.baselinePeriod ?? '2001–2025' })}
            {summary.coverage < 0.9 && ` ${t('gaps', { pct: Math.round((1 - summary.coverage) * 100) })}`}
          </p>
        </>
      )}
    </section>
  );
}
