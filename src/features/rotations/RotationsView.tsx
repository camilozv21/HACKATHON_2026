'use client';

import clsx from 'clsx';
import { ArrowRight, ChevronLeft, ChevronRight, Columns2, Info, Printer, Share2, SlidersHorizontal, Table2 } from 'lucide-react';
import { motion, MotionConfig } from 'motion/react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToastStore } from '@/components/ui/toast';
import { FormulaExplainer, RankingAnnouncer } from '@/features/priorities/RankingList';
import { rankStrategies, type Ranked } from '@/features/priorities/ranking';
import { usePrioritiesStore } from '@/features/priorities/store';
import type { AnalysisResponse, RotationStrategy } from '@/lib/api/contract';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { CompareTwo } from './CompareTwo';
import { StrategyCard } from './StrategyCard';
import { StrategyDetail } from './StrategyDetail';
import { useRotationsStore } from './store';
import { WhatIfPanel } from './WhatIfPanel';
import { applyScenario, isNeutral } from './whatIf';

const CompareTable = dynamic(() => import('./CompareTable'), { ssr: false });
// "En el tiempo": la rotación año por año, el contexto social y las fuentes (POST /rotations/outlook).
const OutlookOverview = dynamic(() => import('./outlook/OutlookOverview'), { ssr: false });
const OutlookDetail = dynamic(() => import('./outlook/OutlookDetail'), { ssr: false });

type Item = Ranked<RotationStrategy>;

const SPRING = { type: 'spring', stiffness: 380, damping: 36 } as const;

export function Disclaimer() {
  const t = useTranslations('rotations');
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-sky-glow" />
      {t('disclaimer')}
    </p>
  );
}

/** Carrusel horizontal con scroll-snap (móvil): una tarjeta por estrategia, botones anterior/siguiente y posición. */
function Carousel({ ranked, current, onDetail }: { ranked: Item[]; current?: Item; onDetail: (id: string) => void }) {
  const t = useTranslations('rotations');
  const ref = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const i = Math.round(el.scrollLeft / (first.offsetWidth + 12));
    if (i !== index) setIndex(Math.min(ranked.length - 1, Math.max(0, i)));
  };

  const go = (i: number) => {
    const child = ref.current?.children[i] as HTMLElement | undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    child?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div>
      <motion.ul
        ref={ref}
        layoutScroll
        onScroll={onScroll}
        aria-label={t('carouselLabel')}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none]"
      >
        {ranked.map((r, i) => (
          <motion.li
            key={r.strategy.id}
            layout="position"
            transition={SPRING}
            aria-label={t('slide', { n: i + 1, total: ranked.length })}
            className="w-[86%] max-w-[26rem] shrink-0 snap-center"
          >
            <StrategyCard item={r} current={current} onDetail={() => onDetail(r.strategy.id)} />
          </motion.li>
        ))}
      </motion.ul>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label={t('prev')}
          className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-line disabled:opacity-40"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted tabular-nums" aria-live="polite">
            {t('position', { n: index + 1, total: ranked.length })}
          </span>
          <span aria-hidden className="flex gap-1">
            {ranked.map((r, i) => (
              <span key={r.strategy.id} className={clsx('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-field-400' : 'w-1.5 bg-white/25')} />
            ))}
          </span>
        </div>
        <button
          type="button"
          onClick={() => go(Math.min(ranked.length - 1, index + 1))}
          disabled={index >= ranked.length - 1}
          aria-label={t('next')}
          className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-line disabled:opacity-40"
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
  pressed,
  className,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={clsx(
        'flex min-h-12 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1',
        pressed ? 'bg-field-500/20 ring-field-400' : 'bg-white/10 ring-line hover:bg-white/15',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Comparación de estrategias (el corazón del reto): al menos 3, incluida la actual, ordenadas por las prioridades
 * de la persona y, si quiere, bajo un escenario "¿y si…?". Móvil: carrusel. Desktop: lista + tabla comparativa.
 */
export default function RotationsView({
  strategies,
  analysis,
  fieldId,
  fieldName,
  onEditPriorities,
  onNext,
}: {
  strategies?: RotationStrategy[];
  /** Análisis completo de esta finca (para la proyección en el tiempo). */
  analysis?: AnalysisResponse;
  fieldId: string;
  fieldName: string;
  onEditPriorities: () => void;
  /** Siguiente paso: "Tu plan" con cultivos asociados. */
  onNext?: () => void;
}) {
  const t = useTranslations('rotations');
  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const pushToast = useToastStore((s) => s.push);
  const priorities = usePrioritiesStore((s) => s.priorities);
  const configured = usePrioritiesStore((s) => s.configured);
  const detailId = useRotationsStore((s) => s.detailId);
  const compare = useRotationsStore((s) => s.compare);
  const tableOpen = useRotationsStore((s) => s.tableOpen);
  const scenario = useRotationsStore((s) => s.scenario);
  const { openDetail, setCompare, setTableOpen, syncField } = useRotationsStore.getState();
  const returnTo = useRef<string | null>(null);

  useEffect(() => syncField(fieldId), [fieldId, syncField]);

  const colorIndex = useMemo(() => Object.fromEntries((strategies ?? []).map((s, i) => [s.id, i])), [strategies]);
  const adjusted = useMemo(() => (strategies ?? []).map((s) => applyScenario(s, scenario)), [strategies, scenario]);
  const ranked = useMemo(() => rankStrategies(adjusted, priorities), [adjusted, priorities]);
  const current = ranked.find((r) => r.strategy.isCurrent);
  const detail = detailId ? ranked.find((r) => r.strategy.id === detailId) : undefined;

  // Al volver del detalle, el foco regresa al botón "Ver detalle" de esa tarjeta.
  useEffect(() => {
    if (detailId || !returnTo.current) return;
    const id = returnTo.current;
    returnTo.current = null;
    document.querySelector<HTMLElement>(`[data-detail-btn="${CSS.escape(id)}"]`)?.focus();
  }, [detailId]);

  if (!strategies) return <p className="text-sm text-ink-muted">{t('loading')}</p>;

  if (detail) {
    return (
      <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-4">
          <StrategyDetail
            item={detail}
            current={current}
            onBack={() => openDetail(null)}
            timeSection={analysis && <OutlookDetail analysis={analysis} strategy={detail.strategy} colorIndex={colorIndex} />}
          />
          <Disclaimer />
        </div>
      </MotionConfig>
    );
  }

  const showDetail = (id: string) => {
    returnTo.current = id;
    openDetail(id);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: fieldName, text: t('shareText', { name: fieldName }), url });
      else {
        await navigator.clipboard.writeText(url);
        pushToast(t('shared'), 'success');
      }
    } catch {
      /* la persona canceló el diálogo de compartir */
    }
  };

  const printHref = () => {
    const params = new URLSearchParams(window.location.search);
    for (const k of ['lat', 'lon', 'z', 'view', 'layer', 'ldate', 'region']) params.delete(k);
    if (!isNeutral(scenario)) {
      params.set('wr', String(scenario.rainPct));
      params.set('wt', String(scenario.tempC));
    }
    return `/${locale}/print?${params.toString()}`;
  };

  const toggleCompare = () => {
    if (compare) return setCompare(null);
    const top = ranked.find((r) => !r.strategy.isCurrent) ?? ranked[0];
    const base = current ?? ranked[1] ?? ranked[0];
    if (top && base) setCompare([top.strategy.id, base.strategy.id]);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">{t('title')}</h3>
            <p className="text-sm text-ink-muted">{t('hint', { n: ranked.length })}</p>
          </div>
          <button
            type="button"
            onClick={onEditPriorities}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            {t('editPriorities')}
          </button>
        </div>

        {!configured && (
          <div className="rounded-2xl bg-field-500/10 p-3 ring-1 ring-field-500/40">
            <p className="text-sm">{t('nudge')}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{t('defaultNote')}</p>
            <button
              type="button"
              onClick={onEditPriorities}
              className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-field-500 px-4 font-semibold text-black hover:bg-field-400"
            >
              <SlidersHorizontal aria-hidden className="size-4" />
              {t('nudgeCta')}
            </button>
          </div>
        )}

        <WhatIfPanel />
        {!isNeutral(scenario) && (
          <p className="-mt-2 rounded-xl bg-sun/10 px-3 py-2 text-xs font-semibold text-sun ring-1 ring-sun/40">{t('estimateBanner')}</p>
        )}

        {isDesktop ? (
          <ul className="flex flex-col gap-3">
            {ranked.map((r) => (
              <motion.li key={r.strategy.id} layout="position" transition={SPRING}>
                <StrategyCard item={r} current={current} onDetail={() => showDetail(r.strategy.id)} />
              </motion.li>
            ))}
          </ul>
        ) : (
          <Carousel ranked={ranked} current={current} onDetail={showDetail} />
        )}
        <RankingAnnouncer ranked={ranked} />

        <div className="grid grid-cols-2 gap-2">
          <ActionButton onClick={toggleCompare} pressed={Boolean(compare)} icon={<Columns2 aria-hidden className="size-4" />} className="lite:hidden">
            {t('actions.compare')}
          </ActionButton>
          <ActionButton onClick={() => setTableOpen(true)} icon={<Table2 aria-hidden className="size-4" />} className="lite:hidden">
            {t('actions.table')}
          </ActionButton>
          <ActionButton onClick={share} icon={<Share2 aria-hidden className="size-4" />}>
            {t('actions.share')}
          </ActionButton>
          {/* Enlace real a una pestaña nueva; el href se completa al tocar con la URL actual (finca, prioridades, escenario). */}
          <a
            href={`/${locale}/print`}
            target="_blank"
            rel="noopener"
            onClick={(e) => {
              e.currentTarget.href = printHref();
            }}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
          >
            <Printer aria-hidden className="size-4" />
            {t('actions.print')}
          </a>
        </div>

        {compare && (
          <CompareTwo strategies={ranked.map((r) => r.strategy)} ids={compare} onChange={setCompare} onClose={() => setCompare(null)} />
        )}

        {analysis && <OutlookOverview analysis={analysis} ranked={ranked} colorIndex={colorIndex} />}

        {/* Modo sencillo: la fórmula del orden es detalle técnico (la confianza y la evidencia siguen visibles). */}
        <div className="lite:hidden">
          <FormulaExplainer top={ranked[0]} />
        </div>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
          >
            {t('nextPlan')}
            <ArrowRight aria-hidden className="size-4" />
          </button>
        )}
        <Disclaimer />
      </div>
      {tableOpen && <CompareTable ranked={ranked} colorIndex={colorIndex} onClose={() => setTableOpen(false)} />}
    </MotionConfig>
  );
}
