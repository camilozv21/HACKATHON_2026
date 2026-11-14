'use client';

import { curveMonotoneX } from '@visx/curve';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Arc, Area, LinePath } from '@visx/shape';
import clsx from 'clsx';
import { Flag, Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CROPS } from '@/features/field/crops';
import { CropIcon } from '@/features/field/panel/RotationForm';
import type { CropId } from '@/lib/api/contract';
import type { Milestone, OutlookYear, Phase } from '@/lib/api/outlook';
import { useMonthNames } from '../parts';

/** Ancho real del contenedor (las gráficas se dibujan a su tamaño, sin escalar el texto). */
export function useWidth<T extends HTMLElement>() {
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

const SURFACE = 'var(--color-space-2)';
const GRID = 'currentColor';

// ---------------------------------------------------------------- trayectoria (años 0 → 10)

export type Series = {
  id: string;
  label: string;
  color: string;
  /** Valor de cada año: índice 0 = hoy. */
  values: number[];
  /** Rango entre un año malo y uno bueno (mismo largo que values). */
  band?: [number, number][];
};

/**
 * Líneas de 0 (hoy) a N años, una por opción, en un solo eje. Con el dedo o el ratón aparece la guía vertical con
 * los valores de ese año; con el teclado, ← y → mueven el año. La tabla de datos es la vista accesible.
 */
export function Trajectory({
  series,
  format,
  label,
  unit,
  includeZero = false,
  reference,
  shade,
  marker,
}: {
  series: Series[];
  format: (v: number) => string;
  /** Nombre accesible de la gráfica. */
  label: string;
  unit: string;
  includeZero?: boolean;
  /** Línea de referencia (p. ej. 100 = hoy). */
  reference?: number;
  /** Años sombreados al fondo (p. ej. la transición). */
  shade?: { to: number; label: string };
  marker?: { year: number; seriesId: string; label: string };
}) {
  const t = useTranslations('rotations.outlook');
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(...series.map((s) => s.values.length)) - 1;
  const H = 188;
  const M = { top: 18, right: 14, bottom: 24, left: 40 };
  const iw = Math.max(0, width - M.left - M.right);
  const ih = H - M.top - M.bottom;

  const all = series.flatMap((s) => [...s.values, ...(s.band?.flat() ?? [])]);
  if (reference != null) all.push(reference);
  if (includeZero) all.push(0);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  const x = scaleLinear<number>({ domain: [0, n], range: [0, iw] });
  const y = scaleLinear<number>({ domain: [includeZero ? Math.min(0, lo) : lo - pad, hi + pad], range: [ih, 0], nice: true });
  const ticks = y.ticks(4);
  const xTicks = Array.from({ length: n + 1 }, (_, i) => i).filter((i) => i % 2 === 0 || n <= 6);

  const yearAt = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(n, Math.round(x.invert(clientX - r.left - M.left))));
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => setHover(yearAt(e.clientX, e.currentTarget.ownerSVGElement!));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n + 1) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };
  const yearName = (i: number) => (i === 0 ? t('today') : t('yearN', { n: i }));
  const markerSeries = marker && series.find((s) => s.id === marker.seriesId);

  return (
    <div
      ref={ref}
      className="relative text-ink-muted outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-field-400"
      tabIndex={0}
      role="group"
      aria-label={`${label}. ${t('chartKeys')}`}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={H} aria-hidden>
          <g transform={`translate(${M.left},${M.top})`}>
            {shade && shade.to > 0 && (
              <g>
                <rect x={0} y={0} width={x(shade.to)} height={ih} fill="currentColor" opacity={0.07} />
                <text x={4} y={-6} fontSize={10} fill="currentColor">
                  {shade.label}
                </text>
              </g>
            )}
            {ticks.map((v) => (
              <g key={v}>
                <line x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke={GRID} strokeOpacity={0.12} />
                <text x={-6} y={y(v) + 3} fontSize={10} textAnchor="end" fill="currentColor">
                  {format(v)}
                </text>
              </g>
            ))}
            {reference != null && <line x1={0} x2={iw} y1={y(reference)} y2={y(reference)} stroke={GRID} strokeOpacity={0.45} />}
            {series.map((s) =>
              s.band ? (
                <Area
                  key={`${s.id}-band`}
                  data={s.band.map((b, i) => ({ i, b }))}
                  x={(d) => x(d.i)}
                  y0={(d) => y(d.b[0])}
                  y1={(d) => y(d.b[1])}
                  curve={curveMonotoneX}
                  fill={s.color}
                  fillOpacity={0.12}
                />
              ) : null,
            )}
            {series.map((s) => (
              <LinePath
                key={s.id}
                data={s.values.map((v, i) => ({ i, v }))}
                x={(d) => x(d.i)}
                y={(d) => y(d.v)}
                curve={curveMonotoneX}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {series.map((s) => (
              <circle key={`${s.id}-end`} cx={x(s.values.length - 1)} cy={y(s.values.at(-1)!)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
            ))}
            {marker && markerSeries && marker.year <= n && (
              <g transform={`translate(${x(marker.year)},${y(markerSeries.values[marker.year]!)})`}>
                <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill={SURFACE} stroke={markerSeries.color} strokeWidth={2} />
              </g>
            )}
            {hover != null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={0} y2={ih} stroke={GRID} strokeOpacity={0.5} />
                {series.map((s) => (
                  <circle key={s.id} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                ))}
              </g>
            )}
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke={GRID} strokeOpacity={0.35} />
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={ih + 16} fontSize={10} textAnchor={i === 0 ? 'start' : i === n ? 'end' : 'middle'} fill="currentColor">
                {i === 0 ? t('today') : t('yearShort', { n: i })}
              </text>
            ))}
            <text x={-M.left + 2} y={-6} fontSize={10} fill="currentColor">
              {unit}
            </text>
            {/* Zona de toque: toda el área de la gráfica. */}
            <rect
              x={0}
              y={0}
              width={iw}
              height={ih}
              fill="transparent"
              style={{ touchAction: 'pan-y' }}
              onPointerDown={onPointer}
              onPointerMove={onPointer}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
            />
          </g>
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 w-max max-w-[15rem] rounded-xl bg-space-2 px-2.5 py-1.5 text-xs text-ink shadow-lg ring-1 ring-line-strong"
          style={{ left: Math.min(Math.max(0, M.left + x(hover) - 70), Math.max(0, width - 200)) }}
        >
          <p className="font-semibold">{yearName(hover)}</p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {series.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-3 shrink-0 rounded" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-ink-muted">{s.label}</span>
                <span className="font-semibold tabular-nums">{format(s.values[hover]!)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Leyenda de la trayectoria: color + nombre + valor al final (la identidad nunca depende solo del color). */
export function SeriesLegend({ series, format, endLabel }: { series: Series[]; format: (v: number) => string; endLabel: string }) {
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-1 w-4 shrink-0 rounded-full" style={{ background: s.color }} />
          <span className="min-w-0 flex-1 truncate">{s.label}</span>
          <span className="shrink-0 text-ink-muted">
            {endLabel} <span className="font-semibold text-ink tabular-nums">{format(s.values.at(-1)!)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tabla con los mismos datos (vista accesible y para quien prefiere números). */
export function SeriesTable({ series, format, caption }: { series: Series[]; format: (v: number) => string; caption: string }) {
  const t = useTranslations('rotations.outlook');
  const n = Math.max(...series.map((s) => s.values.length));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-xs tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-ink-muted">
            <th scope="col" className="py-1 pr-2 font-semibold">
              {t('yearCol')}
            </th>
            {series.map((s) => (
              <th key={s.id} scope="col" className="max-w-[8rem] truncate px-2 py-1 font-semibold">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => (
            <tr key={i} className="border-t border-line">
              <th scope="row" className="py-1 pr-2 font-normal text-ink-muted">
                {i === 0 ? t('today') : t('yearN', { n: i })}
              </th>
              {series.map((s) => (
                <td key={s.id} className="px-2 py-1">
                  {s.values[i] == null ? '—' : format(s.values[i]!)}
                  {s.band?.[i] && i > 0 && (
                    <span className="text-ink-faint">
                      {' '}
                      ({format(s.band[i]![0])}–{format(s.band[i]![1])})
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- rueda de la rotación

type Run = { crop: CropId | null; start: number; len: number };

function runsOf(months: (CropId | null)[]): Run[] {
  const out: Run[] = [];
  months.forEach((c, i) => {
    const last = out.at(-1);
    if (last && last.crop === c) last.len++;
    else out.push({ crop: c, start: i, len: 1 });
  });
  return out;
}

/**
 * La rotación como un ciclo: una vuelta = 12 × años del ciclo. Cada tramo tiene el color y el ícono de su
 * cultivo; las rayas son meses con el suelo sin cultivo. La lista de al lado dice lo mismo con palabras.
 */
export function RotationWheel({ months, cycleYears }: { months: (CropId | null)[]; cycleYears: number }) {
  const t = useTranslations('rotations.outlook');
  const tc = useTranslations('crops');
  const monthNames = useMonthNames();
  const uid = useId().replace(/:/g, '');
  const size = 200;
  const r1 = 92;
  const r0 = 62;
  const total = months.length;
  const ang = (i: number) => (i / total) * Math.PI * 2;
  const runs = runsOf(months);
  const mid = (r0 + r1) / 2;
  const iconAt = (a: number) => ({ left: size / 2 + Math.sin(a) * mid, top: size / 2 - Math.cos(a) * mid });

  const describe = runs
    .map((r) => {
      const from = monthNames[r.start % 12]!;
      const to = monthNames[(r.start + r.len - 1) % 12]!;
      const year = Math.floor(r.start / 12) + 1;
      const name = r.crop ? tc(r.crop) : t('bare');
      return cycleYears > 1 ? t('wheelRunYear', { name, from, to, year }) : t('wheelRun', { name, from, to });
    })
    .join('; ');

  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${t('wheelLabel', { years: cycleYears })}: ${describe}.`}>
        <svg width={size} height={size} aria-hidden className="text-ink-muted">
          <defs>
            <pattern id={`${uid}-hatch`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} fill="currentColor" opacity={0.06} />
              <line x1={0} y1={0} x2={0} y2={6} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} />
            </pattern>
          </defs>
          <g transform={`translate(${size / 2},${size / 2})`}>
            {runs.map((r) => (
              <Arc
                key={r.start}
                innerRadius={r0}
                outerRadius={r1}
                startAngle={ang(r.start)}
                endAngle={ang(r.start + r.len)}
                padAngle={0.02}
                cornerRadius={4}
                fill={r.crop ? CROPS[r.crop].color : `url(#${uid}-hatch)`}
                fillOpacity={r.crop ? 0.85 : 1}
              />
            ))}
            {/* Separador de años y nombre de cada año fuera del anillo. */}
            {cycleYears > 1 &&
              Array.from({ length: cycleYears }, (_, yIdx) => {
                const a = ang(yIdx * 12);
                const am = ang(yIdx * 12 + 6);
                return (
                  <g key={yIdx}>
                    <line x1={Math.sin(a) * (r0 - 4)} y1={-Math.cos(a) * (r0 - 4)} x2={Math.sin(a) * (r1 + 4)} y2={-Math.cos(a) * (r1 + 4)} stroke="currentColor" strokeWidth={1.5} />
                    <text x={Math.sin(am) * (r0 - 12)} y={-Math.cos(am) * (r0 - 12) + 3} fontSize={10} textAnchor="middle" fill="currentColor">
                      {t('yearShort', { n: yIdx + 1 })}
                    </text>
                  </g>
                );
              })}
            {cycleYears === 1 &&
              monthNames.map((m, i) => {
                const a = ang(i + 0.5);
                return (
                  <text key={i} x={Math.sin(a) * (r0 - 9)} y={-Math.cos(a) * (r0 - 9) + 3} fontSize={9} textAnchor="middle" fill="currentColor">
                    {m.charAt(0).toUpperCase()}
                  </text>
                );
              })}
            {/* Flecha: el sentido del tiempo (como las agujas del reloj). */}
            <path d={`M ${-6} ${-r1 - 8} L 6 ${-r1 - 4} L ${-6} ${-r1}`} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
        {runs
          .filter((r) => r.crop && r.len >= 2)
          .map((r) => {
            const p = iconAt(ang(r.start + r.len / 2));
            return (
              <span
                key={r.start}
                aria-hidden
                className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-space/75"
                style={{ left: p.left, top: p.top }}
              >
                <CropIcon crop={r.crop!} className="size-4" />
              </span>
            );
          })}
        <div aria-hidden className="absolute inset-0 grid place-items-center">
          <div className="flex max-w-[6.5rem] flex-col items-center text-center">
            <Repeat className="size-5 text-field-300" />
            <span className="mt-0.5 text-[11px] leading-tight font-semibold">{t('wheelCenter', { years: cycleYears })}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------- franja de años

const PHASE_ORDER: Phase[] = ['transition', 'building', 'stable'];

/**
 * Los años del horizonte agrupados por fase (transición → construyendo → estable): cada fila es un año con el
 * cultivo de cada mes, la parte del lote que ya cambió y una bandera si ese año hay un hito.
 */
export function YearStrip({ years, milestones }: { years: OutlookYear[]; milestones: Milestone[] }) {
  const t = useTranslations('rotations.outlook');
  const tc = useTranslations('crops');
  const monthNames = useMonthNames();
  const groups = PHASE_ORDER.map((p) => ({ phase: p, years: years.filter((y) => y.phase === p) })).filter((g) => g.years.length);
  const flagged = new Set(milestones.map((m) => m.year));

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const first = g.years[0]!.year;
        const last = g.years.at(-1)!.year;
        return (
          <section key={g.phase} aria-label={t(`phase.${g.phase}`)}>
            <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-semibold">{t(`phase.${g.phase}`)}</span>
              <span className="text-ink-muted">{first === last ? t('yearN', { n: first }) : t('yearsRange', { from: first, to: last })}</span>
              <span className="w-full text-ink-faint">{t(`phaseHint.${g.phase}`)}</span>
            </p>
            <ul className="flex flex-col gap-1">
              {g.years.map((y) => {
                const crops = [...new Set(y.months.filter((c): c is CropId => c != null))];
                return (
                  <li key={y.year} className="flex items-center gap-1.5">
                    <span className="w-6 shrink-0 text-[10px] font-semibold text-ink-faint">{t('yearShort', { n: y.year })}</span>
                    <span className="sr-only">
                      {t('yearN', { n: y.year })}: {crops.length ? crops.map((c) => tc(c)).join(', ') : t('bare')}
                      {y.adopted < 1 && `. ${t('adopted', { pct: Math.round(y.adopted * 100) })}`}
                      {flagged.has(y.year) && `. ${t('hasMilestone')}`}
                    </span>
                    <div aria-hidden className="relative grid h-4 flex-1 grid-cols-12 gap-px overflow-hidden rounded-md">
                      {y.months.map((c, m) => (
                        <div
                          key={m}
                          title={`${monthNames[m]}: ${c ? tc(c) : t('bare')}`}
                          className={clsx(!c && 'pattern-hatch text-white/15')}
                          style={c ? { background: `${CROPS[c].color}${y.adopted < 1 ? '66' : 'aa'}` } : undefined}
                        />
                      ))}
                    </div>
                    <span aria-hidden className="w-9 shrink-0 text-right text-[10px] text-ink-muted tabular-nums">
                      {y.adopted < 1 ? `${Math.round(y.adopted * 100)} %` : ''}
                    </span>
                    <span aria-hidden className="grid w-4 shrink-0 place-items-center">
                      {flagged.has(y.year) && <Flag className="size-3.5 text-sun" />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <div aria-hidden className="flex gap-1.5">
        <span className="w-6 shrink-0" />
        <div className="grid flex-1 grid-cols-12 text-center text-[9px] text-ink-faint uppercase">
          {monthNames.map((m, i) => (
            <span key={i}>{m.charAt(0)}</span>
          ))}
        </div>
        <span className="w-9 shrink-0" />
        <span className="w-4 shrink-0" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- trabajo por mes

/**
 * Jornales de la finca por mes: hoy y con esta opción (barras agrupadas, 2 px de separación) y la línea de lo que
 * da la familia. Los meses por encima de la línea llevan un "!" además del color.
 */
export function LaborChart({
  need,
  base,
  capacity,
  color,
  baseColor,
  labels,
}: {
  need: number[];
  base?: number[];
  capacity: number;
  color: string;
  baseColor: string;
  labels: { need: string; base: string; capacity: string; chart: string };
}) {
  const t = useTranslations('rotations.outlook');
  const monthNames = useMonthNames();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 170;
  const M = { top: 16, right: 8, bottom: 20, left: 30 };
  const iw = Math.max(0, width - M.left - M.right);
  const ih = H - M.top - M.bottom;
  const max = Math.max(capacity * 1.1, ...need, ...(base ?? [])) || 1;
  const x = scaleBand<number>({ domain: monthNames.map((_, i) => i), range: [0, iw], paddingInner: 0.25, paddingOuter: 0.1 });
  const y = scaleLinear<number>({ domain: [0, max], range: [ih, 0], nice: true });
  const bars = base ? 2 : 1;
  const bw = Math.min(12, (x.bandwidth() - (bars - 1) * 2) / bars);
  const groupW = bw * bars + (bars - 1) * 2;
  const col = (xx: number, v: number) => {
    const top = y(v);
    const h = ih - top;
    if (h <= 0.5) return '';
    const r = Math.min(3, bw / 2, h);
    return `M${xx},${ih}V${top + r}Q${xx},${top} ${xx + r},${top}H${xx + bw - r}Q${xx + bw},${top} ${xx + bw},${top + r}V${ih}Z`;
  };

  return (
    <div ref={ref} className="relative text-ink-muted">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={labels.chart}>
          <g transform={`translate(${M.left},${M.top})`}>
            {y.ticks(3).map((v) => (
              <g key={v}>
                <line x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
                <text x={-5} y={y(v) + 3} fontSize={10} textAnchor="end" fill="currentColor">
                  {v}
                </text>
              </g>
            ))}
            {monthNames.map((m, i) => {
              const x0 = (x(i) ?? 0) + (x.bandwidth() - groupW) / 2;
              const over = need[i]! > capacity;
              return (
                <g key={i}>
                  {base && <path d={col(x0, base[i]!)} fill={baseColor} opacity={hover != null && hover !== i ? 0.45 : 0.9} />}
                  <path d={col(x0 + (base ? bw + 2 : 0), need[i]!)} fill={color} opacity={hover != null && hover !== i ? 0.45 : 1} />
                  {over && (
                    <text x={x0 + groupW / 2} y={y(need[i]!) - 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="currentColor">
                      !
                    </text>
                  )}
                  <text x={(x(i) ?? 0) + x.bandwidth() / 2} y={ih + 14} fontSize={9} textAnchor="middle" fill="currentColor">
                    {m.charAt(0).toUpperCase()}
                  </text>
                  <rect
                    x={x(i)}
                    y={0}
                    width={x.bandwidth()}
                    height={ih}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerDown={() => setHover(i)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                  />
                </g>
              );
            })}
            {/* Umbral: lo que da la familia (línea punteada porque es un límite, no un dato). */}
            <line x1={0} x2={iw} y1={y(capacity)} y2={y(capacity)} stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />
            <text x={iw} y={y(capacity) - 4} fontSize={10} textAnchor="end" fill="currentColor">
              {labels.capacity}
            </text>
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke="currentColor" strokeOpacity={0.35} />
          </g>
        </svg>
      )}
      {hover != null && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 w-max max-w-[14rem] rounded-xl bg-space-2 px-2.5 py-1.5 text-xs text-ink shadow-lg ring-1 ring-line-strong"
          style={{ left: Math.min(Math.max(0, M.left + (x(hover) ?? 0) - 60), Math.max(0, width - 180)) }}
        >
          <p className="font-semibold">{monthNames[hover]}</p>
          {base && (
            <p className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: baseColor }} />
              {labels.base}: <span className="font-semibold tabular-nums">{t('days', { n: Math.round(base[hover]!) })}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: color }} />
            {labels.need}: <span className="font-semibold tabular-nums">{t('days', { n: Math.round(need[hover]!) })}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- meses con comida o con venta

/** Fila de 12 meses: lleno = sí, rayas = no (no depende solo del color). */
export function MonthStrip({ months, label, tone }: { months: boolean[]; label: string; tone: 'food' | 'cash' }) {
  const t = useTranslations('rotations.outlook');
  const monthNames = useMonthNames();
  const yes = months.flatMap((v, i) => (v ? [monthNames[i]] : []));
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-xs text-ink-muted">{label}</span>
      <span className="sr-only">
        {label}: {yes.length === 12 ? t('allYear') : yes.length ? yes.join(', ') : t('noMonths')}
      </span>
      <div aria-hidden className="grid h-5 flex-1 grid-cols-12 gap-px overflow-hidden rounded-md">
        {months.map((v, i) => (
          <div
            key={i}
            title={monthNames[i]}
            className={clsx(v ? (tone === 'food' ? 'bg-field-500/70' : 'bg-sun/70') : 'pattern-hatch text-white/20')}
          />
        ))}
      </div>
    </div>
  );
}
