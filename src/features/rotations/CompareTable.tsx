'use client';

import { scaleBand, scaleLinear } from '@visx/scale';
import clsx from 'clsx';
import { Home, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ranked } from '@/features/priorities/ranking';
import { SCORE_KEYS, type RotationStrategy, type ScoreKey } from '@/lib/api/contract';
import { seriesColor } from './colors';
import { formatCop } from '@/features/market/format';
import { Diff } from './parts';

type Item = Ranked<RotationStrategy>;

export { SERIES_COLORS, seriesColor } from './colors';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Barra horizontal con el extremo de datos redondeado (4 px) y la base recta en el eje. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

/** Barras agrupadas horizontales: una fila por tema (7) y una barra por estrategia. Con tooltip al tocar/pasar. */
function GroupedBars({ items, colorOf }: { items: Item[]; colorOf: (id: string) => string }) {
  const t = useTranslations('rotations');
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ key: ScoreKey; id: string; x: number; y: number } | null>(null);
  const labelW = Math.min(118, Math.max(84, width * 0.3));
  const barH = 9;
  const groupH = items.length * (barH + 2) + 14;
  const height = SCORE_KEYS.length * groupH + 24;
  const plotW = Math.max(0, width - labelW - 12);

  const y0 = scaleBand<ScoreKey>({ domain: [...SCORE_KEYS], range: [0, SCORE_KEYS.length * groupH], paddingInner: 0 });
  const y1 = scaleBand<string>({ domain: items.map((i) => i.strategy.id), range: [6, groupH - 8], paddingInner: 0.18 });
  const x = scaleLinear<number>({ domain: [0, 100], range: [0, plotW] });
  const hovered = hover && items.find((i) => i.strategy.id === hover.id);

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={t('table.chartLabel')}>
          <g transform={`translate(${labelW},0)`}>
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v} transform={`translate(${x(v)},0)`}>
                <line y1={0} y2={SCORE_KEYS.length * groupH} stroke="currentColor" strokeOpacity={v === 0 ? 0.35 : 0.08} />
                <text y={SCORE_KEYS.length * groupH + 14} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>
                  {v}
                </text>
              </g>
            ))}
          </g>
          {SCORE_KEYS.map((k) => (
            <g key={k} transform={`translate(0,${y0(k) ?? 0})`}>
              <text x={labelW - 8} y={groupH / 2} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="currentColor" opacity={0.8}>
                {t(`scores.${k}`)}
              </text>
              {items.map((it) => {
                const v = it.strategy.scores[k];
                const yy = y1(it.strategy.id) ?? 0;
                const w = Math.max(1, x(v));
                const active = hover?.key === k && hover.id === it.strategy.id;
                return (
                  <g key={it.strategy.id}>
                    <path d={barPath(labelW, yy, w, barH)} fill={colorOf(it.strategy.id)} opacity={hover && !active ? 0.45 : 1} />
                    {/* Zona de toque más grande que la barra. */}
                    <rect
                      x={labelW}
                      y={yy - 1}
                      width={plotW}
                      height={barH + 2}
                      fill="transparent"
                      onPointerEnter={() => setHover({ key: k, id: it.strategy.id, x: labelW + w, y: (y0(k) ?? 0) + yy })}
                      onPointerDown={() => setHover({ key: k, id: it.strategy.id, x: labelW + w, y: (y0(k) ?? 0) + yy })}
                      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                    />
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      )}
      {hover && hovered && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 max-w-[14rem] -translate-y-full rounded-xl bg-space-2 px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-line-strong"
          style={{ left: Math.min(hover.x, Math.max(0, width - 180)), top: hover.y - 4 }}
        >
          <p className="font-semibold">{hovered.strategy.name}</p>
          <p className="text-ink-muted">
            {t(`scores.${hover.key}`)}: <span className="font-semibold text-ink tabular-nums">{hovered.strategy.scores[hover.key]}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/** Tabla comparativa lado a lado + barras agrupadas. Hoja completa en móvil, diálogo centrado en desktop. */
export default function CompareTable({
  ranked,
  colorIndex,
  onClose,
}: {
  ranked: Item[];
  /** id → índice en el orden del backend (para el color). */
  colorIndex: Record<string, number>;
  onClose: () => void;
}) {
  const t = useTranslations('rotations');
  const tm = useTranslations('market');
  const tp = useTranslations('products');
  const locale = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = ranked.find((r) => r.strategy.isCurrent);
  const hasMarket = ranked.some((r) => r.strategy.market);
  /** Cultivo de mayor ingreso bruto con precio: "Fríjol $11.953/kg · A favor". */
  const marketCell = (s: RotationStrategy) => {
    const lead = [...(s.market?.crops ?? [])].filter((c) => c.priceCopKg !== null).sort((a, b) => (b.revenueCopHa ?? 0) - (a.revenueCopHa ?? 0))[0];
    if (!lead) return '—';
    const outlook = lead.outlook ? ` · ${tm(`outlook.${lead.outlook.label}`)}` : '';
    return `${tp(lead.product as 'cafe')} ${formatCop(lead.priceCopKg!, locale)}/kg${outlook}`;
  };
  const colorOf = (id: string) => seriesColor(colorIndex[id] ?? 0);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Foco al botón de cerrar al abrir; Esc cierra; el foco vuelve a quien abrió el diálogo.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  // Portal a <body>: dentro del sheet (vaul usa transform) un `fixed` quedaría recortado al sheet.
  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center">
      <button type="button" tabIndex={-1} aria-label={t('table.close')} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-table-title"
        className="panel relative flex w-full flex-col overflow-hidden sm:m-4 sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-3xl"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 pt-[calc(var(--safe-top)+0.75rem)] pb-3 sm:pt-3">
          <h3 id="compare-table-title" className="flex-1 text-lg font-bold">
            {t('table.title')}
          </h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('table.close')}
            className="grid size-11 place-items-center rounded-full hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[calc(var(--safe-bottom)+1rem)]">
          <p className="mb-3 text-sm text-ink-muted">{t('table.hint')}</p>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[20rem] text-left text-xs tabular-nums sm:text-sm">
              <caption className="sr-only">{t('table.caption')}</caption>
              <thead>
                <tr className="align-bottom">
                  <th scope="col" className="w-[30%] py-2 pr-2 font-medium text-ink-muted">
                    {t('table.topic')}
                  </th>
                  {ranked.map((r) => (
                    <th key={r.strategy.id} scope="col" className="px-1.5 py-2 font-semibold">
                      <span className="flex items-start gap-1.5">
                        <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ background: colorOf(r.strategy.id) }} />
                        <span>
                          <span className="text-ink-muted">{r.rank}. </span>
                          {r.strategy.name}
                          {r.strategy.isCurrent && (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-sky-glow">
                              <Home aria-hidden className="size-3" />
                              {t('current')}
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line-strong font-bold">
                  <th scope="row" className="py-2 pr-2">
                    {t('table.total')}
                  </th>
                  {ranked.map((r) => (
                    <td key={r.strategy.id} className="px-1.5 py-2 text-base">
                      {r.total}
                    </td>
                  ))}
                </tr>
                {SCORE_KEYS.map((k) => (
                  <tr key={k} className="border-t border-line">
                    <th scope="row" className="py-2 pr-2 font-normal text-ink-muted">
                      {t(`scores.${k}`)}
                    </th>
                    {ranked.map((r) => (
                      <td key={r.strategy.id} className="px-1.5 py-2">
                        <span className="font-semibold">{r.strategy.scores[k]}</span>{' '}
                        {current && !r.strategy.isCurrent && (
                          <Diff value={r.strategy.scores[k] - current.strategy.scores[k]} className="text-[11px]" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <th scope="row" className="py-2 pr-2 font-normal text-ink-muted">
                    {t('table.duration')}
                  </th>
                  {ranked.map((r) => (
                    <td key={r.strategy.id} className="px-1.5 py-2">
                      {t('months', { n: r.strategy.durationMonths })}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-line">
                  <th scope="row" className="py-2 pr-2 font-normal text-ink-muted">
                    {t('table.confidence')}
                  </th>
                  {ranked.map((r) => (
                    <td key={r.strategy.id} className="px-1.5 py-2">
                      {t(`confidence.${r.strategy.confidence}`)}
                    </td>
                  ))}
                </tr>
                {hasMarket && (
                  <tr className="border-t border-line">
                    <th scope="row" className="py-2 pr-2 font-normal text-ink-muted">
                      {tm('compareRow')}
                    </th>
                    {ranked.map((r) => (
                      <td key={r.strategy.id} className="px-1.5 py-2">
                        {marketCell(r.strategy)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h4 className="mt-5 mb-1 font-bold">{t('table.chartTitle')}</h4>
          <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {ranked.map((r) => (
              <li key={r.strategy.id} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: colorOf(r.strategy.id) }} />
                <span className={clsx(r.strategy.isCurrent && 'font-semibold')}>{r.strategy.name}</span>
              </li>
            ))}
          </ul>
          <GroupedBars items={ranked} colorOf={colorOf} />
          <p className="mt-2 text-[11px] text-ink-faint">{t('table.chartNote')}</p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
