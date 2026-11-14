'use client';

import { curveMonotoneX } from '@visx/curve';
import { useUnits } from '@/lib/units';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar, LinePath } from '@visx/shape';
import clsx from 'clsx';
import { CloudRain, Droplets, Snowflake, Sun } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import { CROPS } from '../crops';
import type { MonthView, Stress } from './derive';
import { monthRanges } from './derive';

const STRESS_ICON: Record<Stress, typeof Sun> = { heat: Sun, drought: Droplets, frost: Snowflake, waterlogging: CloudRain };
const STRESS_COLOR: Record<Stress, string> = {
  heat: 'text-risk-high',
  drought: 'text-risk-medium',
  frost: 'text-sky-glow',
  waterlogging: 'text-sky-glow',
};

const W = 336;
const H = 96;

/**
 * Un año en una mirada: qué hay sembrado cada mes (o suelo desnudo, con patrón), cuánto llueve, qué tan
 * caliente está y en qué meses hay estrés. Todo también en texto (lector de pantalla y resumen visible).
 */
export function YearCalendar({ year, source }: { year: MonthView[]; source: string }) {
  const t = useTranslations('panel');
  const tc = useTranslations('crops');
  const format = useFormatter();
  const u = useUnits();
  const names = year.map((m) => format.dateTime(new Date(Date.UTC(2025, m.month - 1, 15)), { month: 'short' }).replace('.', ''));

  const x = scaleBand<number>({ domain: year.map((m) => m.month), range: [0, W], padding: 0.22 });
  const maxRain = Math.max(10, ...year.map((m) => m.rain ?? 0));
  const yRain = scaleLinear<number>({ domain: [0, maxRain], range: [H, 8] });
  const temps = year.flatMap((m) => [m.tMax ?? NaN, m.tMin ?? NaN]).filter(Number.isFinite);
  const yTemp = scaleLinear<number>({ domain: [Math.min(...temps) - 2, Math.max(...temps) + 2], range: [H - 6, 6] });

  const bare = year.filter((m) => m.bare).map((m) => m.month);
  const byStress = (s: Stress) => year.filter((m) => m.stress.includes(s)).map((m) => m.month);
  const stressText = (['drought', 'heat', 'frost', 'waterlogging'] as Stress[])
    .map((s) => ({ s, r: monthRanges(byStress(s), names) }))
    .filter((x) => x.r)
    .map(({ s, r }) => `${t(`stress.${s}`)}: ${r}`);

  const summary = [
    bare.length ? t('calendar.bare', { months: monthRanges(bare, names) }) : t('calendar.noBare'),
    stressText.length ? t('calendar.stress', { list: stressText.join(' · ') }) : t('calendar.noStress'),
  ];
  const a11y = year
    .map(
      (m, i) =>
        `${names[i]}: ${m.crop ? tc(m.crop.crop) : t('calendar.bareShort')}, ${t('calendar.rainShort')} ${u.rain(m.rain ?? 0)}, ${t('calendar.tmaxShort')} ${u.temp(m.tMax ?? 0)}${m.stress.length ? `, ${m.stress.map((s) => t(`stress.${s}`)).join(', ')}` : ''}`,
    )
    .join('; ');

  // Tramos continuos del mismo cultivo para escribir su nombre una vez.
  const runs: { crop: string; color: string; from: number; to: number }[] = [];
  year.forEach((m, i) => {
    const key = m.crop?.crop ?? '__bare';
    const last = runs.at(-1);
    if (last && last.crop === key && last.to === i - 1) last.to = i;
    else runs.push({ crop: key, color: m.crop ? CROPS[m.crop.crop].color : '', from: i, to: i });
  });

  return (
    <figure className="m-0">
      <p className="mb-2 text-base font-semibold">
        {summary.map((s) => (
          <span key={s} className="block">
            {s}
          </span>
        ))}
      </p>

      <div role="img" aria-label={a11y} className="w-full">
        {/* Banda de cultivos (patrón rayado = suelo desnudo, no solo color) */}
        <div className="grid h-9 grid-cols-12 overflow-hidden rounded-xl ring-1 ring-line">
          {runs.map((r) => (
            <div
              key={`${r.crop}-${r.from}`}
              style={{ gridColumn: `${r.from + 1} / ${r.to + 2}`, background: r.color || undefined }}
              className={clsx(
                'flex min-w-0 items-center justify-center border-r border-black/20 px-0.5 text-[10px] leading-none font-bold last:border-r-0',
                r.color ? 'text-black/80' : 'pattern-hatch bg-space-2 text-risk-medium',
              )}
            >
              <span className={clsx('truncate', !r.color && 'rounded bg-space px-1 py-0.5 text-[9px] text-ink')}>
                {r.color ? tc(r.crop) : t('calendar.bareShort')}
              </span>
            </div>
          ))}
        </div>

        {/* Lluvia (barras) y temperatura máxima/mínima (líneas) */}
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-24 w-full" aria-hidden preserveAspectRatio="none">
          {year.map((m) => (
            <Bar
              key={m.month}
              x={x(m.month)}
              y={yRain(m.rain ?? 0)}
              width={x.bandwidth()}
              height={H - yRain(m.rain ?? 0)}
              rx={3}
              fill="rgb(124 196 255 / 0.55)"
            />
          ))}
          <LinePath
            data={year.filter((m) => m.tMax != null)}
            x={(m) => (x(m.month) ?? 0) + x.bandwidth() / 2}
            y={(m) => yTemp(m.tMax!)}
            curve={curveMonotoneX}
            stroke="#ff9e7a"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
          <LinePath
            data={year.filter((m) => m.tMin != null)}
            x={(m) => (x(m.month) ?? 0) + x.bandwidth() / 2}
            y={(m) => yTemp(m.tMin!)}
            curve={curveMonotoneX}
            stroke="#c3a6ff"
            strokeWidth={1.8}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Estrés por mes: ícono (forma distinta por tipo) */}
        <div className="grid h-6 grid-cols-12">
          {year.map((m) => (
            <div key={m.month} className="flex items-center justify-center gap-px">
              {m.stress.slice(0, 2).map((s) => {
                const Icon = STRESS_ICON[s];
                return <Icon key={s} aria-hidden className={clsx('size-3.5', STRESS_COLOR[s])} />;
              })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-12 text-center text-[10px] text-ink-muted capitalize">
          {names.map((n) => (
            <span key={n}>{n.slice(0, 3)}</span>
          ))}
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-sky-glow/60" />
          {t('calendar.legendRain', { max: u.rain(maxRain) })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 bg-[#ff9e7a]" />
          {t('calendar.legendTmax')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#c3a6ff]" />
          {t('calendar.legendTmin')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="pattern-hatch inline-block h-3 w-4 rounded-sm text-risk-medium ring-1 ring-line" />
          {t('calendar.legendBare')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Sun aria-hidden className="size-3.5 text-risk-high" />
          {t('stress.heat')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Droplets aria-hidden className="size-3.5 text-risk-medium" />
          <GlossaryLink term="water-balance">{t('stress.drought')}</GlossaryLink>
        </span>
        <span className="inline-flex items-center gap-1">
          <Snowflake aria-hidden className="size-3.5 text-sky-glow" />
          <GlossaryLink term="frost">{t('stress.frost')}</GlossaryLink>
        </span>
        <span className="w-full text-[11px] text-ink-faint">{source}</span>
      </figcaption>
    </figure>
  );
}
