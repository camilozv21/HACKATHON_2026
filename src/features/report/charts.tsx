'use client';

import { curveMonotoneX } from '@visx/curve';
import { scaleBand, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { useFormatter, useTranslations } from 'next-intl';
import type { PowerDay } from '@/lib/api/power';
import { useUnits } from '@/lib/units';

/**
 * Gráficas del informe, pensadas para papel (fondo blanco): una medida por gráfica, sin doble eje.
 * Colores de la paleta categórica clara validada (azul, naranja). El texto siempre en gris oscuro, no del color de la serie.
 * Cada barra o punto tiene <title> (ver el valor al pasar el dedo o el ratón); la tabla de datos diarios es la vista accesible.
 */
const W = 640;
const H = 170;
const M = { top: 22, right: 44, bottom: 22, left: 40 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;
const INK = '#374151';
const MUTED = '#6b7280';
const GRID = '#e5e7eb';
const BLUE = '#2a78d6';
const ORANGE = '#eb6834';

function ticks(max: number, n = 3) {
  const step = max / n;
  return Array.from({ length: n + 1 }, (_, i) => i * step);
}

function XLabels({ days, x }: { days: PowerDay[]; x: (i: number) => number }) {
  const format = useFormatter();
  const idx = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  return (
    <>
      {idx.map((i) => (
        <text key={i} x={x(i)} y={H - 6} fontSize={10} textAnchor="middle" fill={MUTED}>
          {format.dateTime(new Date(`${days[i]!.date}T12:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' })}
        </text>
      ))}
    </>
  );
}

export function RainChart({ days, normalPerDay }: { days: PowerDay[]; normalPerDay: (date: string) => number | null }) {
  const t = useTranslations('report');
  const u = useUnits();
  const format = useFormatter();
  const vals = days.map((d) => (d.precip == null ? null : u.rainValue(d.precip)));
  const norms = days.map((d) => {
    const n = normalPerDay(d.date);
    return n == null ? null : u.rainValue(n);
  });
  const max = Math.max(1, ...vals.map((v) => v ?? 0), ...norms.map((v) => v ?? 0)) * 1.1;
  const x = scaleBand<number>({ domain: days.map((_, i) => i), range: [0, IW], padding: 0.25 });
  const y = scaleLinear<number>({ domain: [0, max], range: [IH, 0] });
  const digits = u.units === 'imperial' ? 2 : 0;
  const lastNorm = norms.at(-1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('rainChartTitle')}>
      <g transform={`translate(${M.left},${M.top})`}>
        {ticks(max).map((v) => (
          <g key={v}>
            <line x1={0} x2={IW} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={-6} y={y(v) + 3} fontSize={10} textAnchor="end" fill={MUTED}>
              {format.number(v, { maximumFractionDigits: digits })}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const v = vals[i];
          if (v == null || v <= 0) return null;
          const top = y(v);
          const w = x.bandwidth();
          // Barra con el extremo de datos redondeado y anclada a la base.
          return (
            <path
              key={d.date}
              d={`M${x(i)},${IH} V${top + Math.min(2, w / 2)} q0,-2 2,-2 h${w - 4} q2,0 2,2 V${IH} Z`}
              fill={BLUE}
            >
              <title>{`${d.date}: ${u.rain(d.precip!)}`}</title>
            </path>
          );
        })}
        <LinePath
          data={days.map((_, i) => i).filter((i) => norms[i] != null)}
          x={(i) => (x(i) ?? 0) + x.bandwidth() / 2}
          y={(i) => y(norms[i]!)}
          stroke={INK}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {lastNorm != null && (
          <text x={IW + 4} y={y(lastNorm) + 3} fontSize={10} fill={INK}>
            {t('normalLine')}
          </text>
        )}
        <line x1={0} x2={IW} y1={IH} y2={IH} stroke={MUTED} />
        <text x={-32} y={-12} fontSize={10} textAnchor="start" fill={MUTED}>
          {u.rainUnit}
        </text>
      </g>
      <g transform={`translate(${M.left},0)`}>
        <XLabels days={days} x={(i) => (x(i) ?? 0) + x.bandwidth() / 2} />
      </g>
    </svg>
  );
}

export function TempChart({ days }: { days: PowerDay[] }) {
  const t = useTranslations('report');
  const u = useUnits();
  const format = useFormatter();
  const hi = days.map((d) => (d.tmax == null ? null : u.tempValue(d.tmax)));
  const lo = days.map((d) => (d.tmin == null ? null : u.tempValue(d.tmin)));
  const all = [...hi, ...lo].filter((v): v is number => v != null);
  if (!all.length) return null;
  const min = Math.floor(Math.min(...all) - 2);
  const max = Math.ceil(Math.max(...all) + 2);
  const x = scaleLinear<number>({ domain: [0, Math.max(1, days.length - 1)], range: [0, IW] });
  const y = scaleLinear<number>({ domain: [min, max], range: [IH, 0] });
  const lastHi = [...hi].reverse().find((v) => v != null);
  const lastLo = [...lo].reverse().find((v) => v != null);
  const series = [
    { key: 'hi', vals: hi, color: ORANGE, label: t('tMaxLabel'), last: lastHi },
    { key: 'lo', vals: lo, color: BLUE, label: t('tMinLabel'), last: lastLo },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('tempChartTitle')}>
      <g transform={`translate(${M.left},${M.top})`}>
        {ticks(max - min).map((d) => {
          const v = min + d;
          return (
            <g key={v}>
              <line x1={0} x2={IW} y1={y(v)} y2={y(v)} stroke={GRID} />
              <text x={-6} y={y(v) + 3} fontSize={10} textAnchor="end" fill={MUTED}>
                {format.number(v, { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <g key={s.key}>
            <LinePath
              data={days.map((_, i) => i).filter((i) => s.vals[i] != null)}
              x={(i) => x(i)}
              y={(i) => y(s.vals[i]!)}
              stroke={s.color}
              strokeWidth={2}
              curve={curveMonotoneX}
            />
            {days.map((d, i) =>
              s.vals[i] == null ? null : (
                <circle key={d.date} cx={x(i)} cy={y(s.vals[i]!)} r={2.5} fill={s.color} stroke="#fff" strokeWidth={1}>
                  <title>{`${d.date}: ${s.label} ${u.temp(s.key === 'hi' ? d.tmax! : d.tmin!)}`}</title>
                </circle>
              ),
            )}
            {s.last != null && (
              <text x={IW + 4} y={y(s.last) + 3} fontSize={10} fill={INK}>
                {s.label}
              </text>
            )}
          </g>
        ))}
        <text x={-32} y={-12} fontSize={10} textAnchor="start" fill={MUTED}>
          {u.tempUnit}
        </text>
      </g>
      <g transform={`translate(${M.left},0)`}>
        <XLabels days={days} x={(i) => x(i)} />
      </g>
    </svg>
  );
}

/** Leyenda de la gráfica de temperatura (dos series): siempre presente, además de las etiquetas directas. */
export function TempLegend() {
  const t = useTranslations('report');
  return (
    <ul className="flex gap-4 text-xs text-neutral-700">
      {[
        { c: ORANGE, l: t('tMaxLabel') },
        { c: BLUE, l: t('tMinLabel') },
      ].map((s) => (
        <li key={s.l} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.c }} />
          {s.l}
        </li>
      ))}
    </ul>
  );
}
