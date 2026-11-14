'use client';

import { curveMonotoneX } from '@visx/curve';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { useTranslations } from 'next-intl';
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { LAND_STATES, STATE_COLOR, type LandState } from './kinds';
import { pct, transitions, type Matrix, type Vec } from './markov';

/** Ancho real del contenedor: las gráficas se dibujan a su tamaño (el texto no se escala). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Patrón de cada estado (además del color y del nombre): sana lisa, estrés puntos, expuesto rayado, agua líneas. */
const STATE_BG: Record<LandState, string | undefined> = {
  healthy: undefined,
  stressed: 'radial-gradient(rgb(0 0 0 / 0.45) 1.2px, transparent 1.4px)',
  bare: 'repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.4) 0 2px, transparent 2px 7px)',
  water: 'repeating-linear-gradient(0deg, rgb(0 0 0 / 0.35) 0 1.5px, transparent 1.5px 5px)',
};

export function stateStyle(s: LandState): CSSProperties {
  return {
    backgroundColor: STATE_COLOR[s],
    backgroundImage: STATE_BG[s],
    backgroundSize: s === 'stressed' ? '6px 6px' : undefined,
  };
}

export function StateSwatch({ state, className }: { state: LandState; className?: string }) {
  return <span aria-hidden className={className ?? 'inline-block size-3.5 shrink-0 rounded-sm ring-1 ring-white/30'} style={stateStyle(state)} />;
}

/** Patrones SVG equivalentes (para el diagrama). */
function SvgPatterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-stressed`} width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.2" fill="rgb(0 0 0 / 0.45)" />
      </pattern>
      <pattern id={`${id}-bare`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="2" height="7" fill="rgb(0 0 0 / 0.4)" />
      </pattern>
      <pattern id={`${id}-water`} width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="1.5" fill="rgb(0 0 0 / 0.35)" />
      </pattern>
      {/* Una punta por color (context-stroke aún no funciona en todos los navegadores). */}
      {LAND_STATES.map((s) => (
        <marker
          key={s}
          id={`${id}-arrow-${s}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="10"
          markerHeight="10"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={STATE_COLOR[s]} />
        </marker>
      ))}
    </defs>
  );
}

// ---------------------------------------------------------------- estado inicial y final

export function StateBars({ rows }: { rows: { label: string; p: Vec }[] }) {
  const t = useTranslations('terrain');
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-ink-muted tabular-nums">{row.label}</span>
          <div
            role="img"
            aria-label={`${row.label}: ${LAND_STATES.map((s, i) => `${t(`states.${s}.name`)} ${pct(row.p[i] ?? 0)} %`).join(', ')}`}
            className="flex h-6 flex-1 overflow-hidden rounded-md ring-1 ring-white/20"
          >
            {LAND_STATES.map((s, i) => {
              const w = (row.p[i] ?? 0) * 100;
              if (w < 0.5) return null;
              return (
                <span key={s} className="flex h-full items-center justify-center text-[11px] font-bold text-black" style={{ ...stateStyle(s), width: `${w}%` }}>
                  {w >= 12 ? `${Math.round(w)}%` : ''}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Leyenda de estados con la parte final y cuánto cambió (texto, no solo color). */
export function StateLegend({ p0, p1 }: { p0: Vec; p1: Vec }) {
  const t = useTranslations('terrain');
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
      {LAND_STATES.map((s, i) => {
        const delta = pct(p1[i] ?? 0) - pct(p0[i] ?? 0);
        return (
          <li key={s} className="flex items-center gap-2">
            <StateSwatch state={s} />
            <span className="min-w-0 flex-1 leading-tight">
              {t(`states.${s}.short`)}{' '}
              <span className="font-semibold tabular-nums">{pct(p1[i] ?? 0)} %</span>{' '}
              <span className="text-xs text-ink-muted tabular-nums">
                {delta === 0 ? t('chart.same') : t('chart.delta', { sign: delta > 0 ? '+' : '−', n: Math.abs(delta) })}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- diagrama de Markov

/** Posición de cada estado en el diagrama (fracción del ancho y del alto). */
const NODE_POS: Record<LandState, [number, number]> = {
  healthy: [0.24, 0.27],
  stressed: [0.76, 0.27],
  bare: [0.76, 0.76],
  water: [0.24, 0.76],
};

type Pt = { x: number; y: number };
const unit = (a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
};

/**
 * Diagrama de cambios de estado: un círculo por estado (tamaño = parte del área al final, "se queda X %" = lo que
 * no cambió) y una flecha por cada cambio de 5 % o más (grosor = probabilidad). Dos flechas entre el mismo par se
 * curvan hacia lados opuestos para no taparse.
 */
export function MarkovDiagram({ P, p0, p1, periods }: { P: Matrix; p0: Vec; p1: Vec; periods: string }) {
  const t = useTranslations('terrain');
  const id = useId().replace(/[:]/g, '');
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = Math.round(Math.min(320, Math.max(240, width * 0.82)));
  const flows = transitions(p0, P, 0.05);

  const center = (s: LandState): Pt => ({ x: NODE_POS[s][0] * width, y: NODE_POS[s][1] * height });
  const radius = (i: number) => 16 + 22 * Math.sqrt(p1[i] ?? 0);

  const label = t('diagram.aria', {
    periods,
    stays: LAND_STATES.map((s, i) => t('diagram.ariaStay', { state: t(`states.${s}.name`), n: pct(P[i]?.[i] ?? 0) })).join('; '),
    flows: flows.length
      ? flows
          .slice(0, 5)
          .map((f) => t('diagram.ariaFlow', { from: t(`states.${f.from}.name`), to: t(`states.${f.to}.name`), n: pct(f.prob) }))
          .join('; ')
      : t('diagram.ariaNoFlows'),
  });

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg role="img" aria-label={label} width={width} height={height} className="block overflow-visible">
          <SvgPatterns id={id} />
          <Group>
            {flows.map((f) => {
              const i = LAND_STATES.indexOf(f.from);
              const j = LAND_STATES.indexOf(f.to);
              const a = center(f.from);
              const b = center(f.to);
              const n = unit(a, b);
              const dist = Math.hypot(b.x - a.x, b.y - a.y);
              // Curva hacia la izquierda del sentido del viaje: i→j y j→i quedan separadas.
              const c = { x: (a.x + b.x) / 2 + n.y * dist * 0.2, y: (a.y + b.y) / 2 - n.x * dist * 0.2 };
              const ua = unit(a, c);
              const ub = unit(b, c);
              const s0 = { x: a.x + ua.x * (radius(i) + 2), y: a.y + ua.y * (radius(i) + 2) };
              const s1 = { x: b.x + ub.x * (radius(j) + 5), y: b.y + ub.y * (radius(j) + 5) };
              const mid = { x: 0.25 * s0.x + 0.5 * c.x + 0.25 * s1.x, y: 0.25 * s0.y + 0.5 * c.y + 0.25 * s1.y };
              return (
                <g key={`${f.from}-${f.to}`}>
                  <path
                    d={`M${s0.x},${s0.y} Q${c.x},${c.y} ${s1.x},${s1.y}`}
                    fill="none"
                    stroke={STATE_COLOR[f.to]}
                    strokeOpacity={0.85}
                    strokeWidth={1.5 + 7 * f.prob}
                    strokeLinecap="round"
                    markerEnd={`url(#${id}-arrow-${f.to})`}
                  />
                  <text
                    x={mid.x}
                    y={mid.y}
                    dy="0.35em"
                    textAnchor="middle"
                    className="fill-ink text-[11px] font-bold tabular-nums"
                    stroke="var(--color-space-2, #0a0f1c)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                  >
                    {pct(f.prob)} %
                  </text>
                </g>
              );
            })}
            {LAND_STATES.map((s, i) => {
              const c = center(s);
              const r = radius(i);
              const top = NODE_POS[s][1] < 0.5;
              return (
                <g key={s}>
                  <circle cx={c.x} cy={c.y} r={r} fill={STATE_COLOR[s]} fillOpacity={0.9} stroke="rgb(255 255 255 / 0.5)" strokeWidth={1.5} />
                  {s !== 'healthy' && <circle cx={c.x} cy={c.y} r={r} fill={`url(#${id}-${s})`} />}
                  <text x={c.x} y={c.y} dy="0.35em" textAnchor="middle" className="fill-black text-[13px] font-extrabold tabular-nums">
                    {pct(p1[i] ?? 0)}%
                  </text>
                  <text
                    x={c.x}
                    y={top ? c.y - r - 18 : c.y + r + 14}
                    textAnchor="middle"
                    className="fill-ink text-[12px] font-semibold"
                  >
                    {t(`states.${s}.short`)}
                  </text>
                  <text
                    x={c.x}
                    y={top ? c.y - r - 5 : c.y + r + 27}
                    textAnchor="middle"
                    className="fill-ink-muted text-[11px] tabular-nums"
                  >
                    {t('diagram.stays', { n: pct(P[i]?.[i] ?? 0) })}
                  </text>
                </g>
              );
            })}
          </Group>
        </svg>
      )}
    </div>
  );
}

/** Vista accesible de la matriz: de qué estado (filas) a qué estado (columnas). */
export function MatrixTable({ P, caption }: { P: Matrix; caption: string }) {
  const t = useTranslations('terrain');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs tabular-nums">
        <caption className="mb-1 text-left text-ink-muted">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 pr-2 font-semibold">
              {t('table.fromTo')}
            </th>
            {LAND_STATES.map((s) => (
              <th key={s} scope="col" className="px-1 py-1 font-semibold">
                {t(`states.${s}.short`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LAND_STATES.map((from, i) => (
            <tr key={from} className="border-t border-line">
              <th scope="row" className="py-1 pr-2 font-semibold">
                {t(`states.${from}.short`)}
              </th>
              {LAND_STATES.map((to, j) => (
                <td key={to} className={i === j ? 'px-1 py-1 font-bold' : 'px-1 py-1'}>
                  {pct(P[i]?.[j] ?? 0)} %
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- tendencia anual + proyección

export function StateTrend({
  years,
  series,
  projection,
}: {
  years: number[];
  /** Reparto de cada año (fracciones). */
  series: Vec[];
  /** Proyección de la cadena: año y reparto (se dibuja punteada desde el último año). */
  projection: { year: number; p: Vec } | null;
}) {
  const t = useTranslations('terrain');
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 170;
  const m = { top: 10, right: 16, bottom: 22, left: 38 };
  const first = years[0] ?? 0;
  const last = years[years.length - 1] ?? first;
  const xMax = projection?.year ?? last;
  const x = scaleLinear({ domain: [first, xMax], range: [m.left, Math.max(m.left + 1, width - m.right)] });
  const y = scaleLinear({ domain: [0, 1], range: [height - m.bottom, m.top] });
  const ticks = Array.from(new Set([first, last, ...(projection ? [projection.year] : [])]));

  const label = t('trend.aria', {
    first,
    last,
    values: LAND_STATES.map((s, i) => `${t(`states.${s}.name`)} ${pct(series[0]?.[i] ?? 0)} → ${pct(series[series.length - 1]?.[i] ?? 0)} %`).join('; '),
  });

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg role="img" aria-label={label} width={width} height={height} className="block">
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
              <text x={m.left - 6} y={y(v)} dy="0.35em" textAnchor="end" className="fill-ink-faint text-[10px] tabular-nums">
                {v * 100}%
              </text>
            </g>
          ))}
          {projection && (
            <rect
              x={x(last)}
              y={m.top}
              width={Math.max(0, x(projection.year) - x(last))}
              height={height - m.top - m.bottom}
              fill="currentColor"
              fillOpacity={0.05}
            />
          )}
          {ticks.map((yr) => (
            <text
              key={yr}
              x={x(yr)}
              y={height - 6}
              textAnchor={yr === xMax ? 'end' : yr === first ? 'start' : 'middle'}
              className="fill-ink-faint text-[10px] tabular-nums"
            >
              {yr}
            </text>
          ))}
          {LAND_STATES.map((s, i) => {
            const pts = years.map((yr, k) => ({ yr, v: series[k]?.[i] ?? 0 }));
            const end = pts[pts.length - 1];
            return (
              <g key={s}>
                <LinePath
                  data={pts}
                  x={(d) => x(d.yr)}
                  y={(d) => y(d.v)}
                  curve={curveMonotoneX}
                  stroke={STATE_COLOR[s]}
                  strokeWidth={2.25}
                  strokeDasharray={s === 'bare' ? '5 3' : s === 'water' ? '2 3' : undefined}
                />
                {projection && end && (
                  <>
                    <line
                      x1={x(end.yr)}
                      y1={y(end.v)}
                      x2={x(projection.year)}
                      y2={y(projection.p[i] ?? 0)}
                      stroke={STATE_COLOR[s]}
                      strokeWidth={1.75}
                      strokeDasharray="3 4"
                      strokeOpacity={0.8}
                    />
                    <circle cx={x(projection.year)} cy={y(projection.p[i] ?? 0)} r={3.5} fill={STATE_COLOR[s]} stroke="#000" strokeOpacity={0.4} />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Tabla de la serie anual (vista accesible de la tendencia). */
export function TrendTable({ years, series, caption }: { years: number[]; series: Vec[]; caption: string }) {
  const t = useTranslations('terrain');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs tabular-nums">
        <caption className="mb-1 text-left text-ink-muted">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 pr-2 font-semibold">
              {t('table.year')}
            </th>
            {LAND_STATES.map((s) => (
              <th key={s} scope="col" className="px-1 py-1 font-semibold">
                {t(`states.${s}.short`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((yr, k) => (
            <tr key={yr} className="border-t border-line">
              <th scope="row" className="py-1 pr-2 font-semibold">
                {yr}
              </th>
              {LAND_STATES.map((s, i) => (
                <td key={s} className="px-1 py-1">
                  {pct(series[k]?.[i] ?? 0)} %
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
