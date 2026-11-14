'use client';

import clsx from 'clsx';
import {
  AlertOctagon,
  AlertTriangle,
  BotMessageSquare,
  CheckCircle2,
  FileText,
  HelpCircle,
  Info,
  Map as MapIcon,
  Sprout,
  X, History, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type Variants } from 'motion/react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAgentStore } from '@/features/agent/store';
import { speak, stop, type NarratorLang } from '@/features/narrator/narrator';
import { SpeakButton } from '@/features/narrator/SpeakButton';
import { useNarratorStore } from '@/features/narrator/store';
import { NearbyEvents } from '@/features/events/NearbyEvents';
import { MarketNearby } from '@/features/market/MarketNearby';
import { inColombiaBox } from '@/lib/market/colombia';
import { reportHref } from '@/features/report/report';
import { selectField } from '@/features/field/actions';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';
import { useFieldStore } from '@/features/field/store';
import { flyTo } from '@/features/globe/camera';
import { getMap } from '@/features/globe/store';
import { useLayerStore } from '@/features/layers/store';
import type { RegionSensorCard, RegionSummary } from '@/lib/api/contract';
import { useLite, usePrefsStore } from '@/lib/prefs';
import { toTimeParam } from '@/features/time/period';
import { useTimeStore } from '@/features/time/store';
import { useRegionSummary } from '@/lib/api/hooks';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { QueryProvider } from '@/lib/query/client';
import { bboxSideKm } from '@/lib/bbox';
import { adminParam, getAdmin } from './admin';
import { CountUp, LightWave, OrbitBadge, Sparkline } from './parts';
import { defaultCellBBox, drawerWidth, useRegionStore } from './store';

const STATUS = {
  good: { Icon: CheckCircle2, cls: 'text-risk-low bg-risk-low/15', pattern: '' },
  watch: { Icon: AlertTriangle, cls: 'text-risk-medium bg-risk-medium/15', pattern: 'pattern-dots' },
  alert: { Icon: AlertOctagon, cls: 'text-risk-high bg-risk-high/15', pattern: 'pattern-hatch' },
} as const;

/** Muestra del trazo de cada contorno del mapa (decorativa: el texto dice qué es). */
function LegendSwatch({ kind }: { kind: 'area' | 'dpto' | 'cell' }) {
  return (
    <svg aria-hidden viewBox="0 0 20 8" className="h-2 w-5 shrink-0">
      <line
        x1="1"
        y1="4"
        x2="19"
        y2="4"
        stroke={kind === 'cell' ? '#ffffff' : '#9ff0b8'}
        strokeWidth={kind === 'area' ? 3 : 1.5}
        strokeOpacity={kind === 'dpto' ? 0.75 : 1}
        strokeDasharray={kind === 'cell' ? '3 2' : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Línea de la leyenda. En desktop es un botón que encuadra ese contorno (en móvil el drawer tapa el mapa). */
function LegendItem({
  kind,
  label,
  hint,
  onFocus,
}: {
  kind: 'area' | 'dpto' | 'cell';
  label: string;
  hint: string;
  onFocus?: () => void;
}) {
  if (!onFocus) {
    return (
      <li className="flex items-center gap-2">
        <LegendSwatch kind={kind} />
        {label}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onFocus}
        aria-label={`${label} · ${hint}`}
        title={hint}
        className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-1 text-left hover:bg-white/10"
      >
        <LegendSwatch kind={kind} />
        <span className="min-w-0 flex-1">{label}</span>
        <MapIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
      </button>
    </li>
  );
}

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.18 } },
};

/** Modo sencillo: primero lo que más pesa para sembrar; el resto queda tras "Ver más datos". */
const PRIMARY_CARDS: RegionSensorCard['id'][] = ['soil-moisture', 'rain', 'ndvi', 'heat'];

type Translate = (key: string) => string;
const trimEnd = (s: string) => s.replace(/[.\s]+$/, '');

/** Lo que el locutor lee del panel: nombre, cada tarjeta (título, estado y frase) y las alertas. */
function regionSpeech(name: string, cards: RegionSensorCard[], alerts: RegionSummary['alerts'], t: Translate) {
  return [
    name,
    ...cards.map((c) => `${t(`cards.${c.id}`)}: ${t(`status.${c.status}`)}. ${trimEnd(c.headline)}`),
    alerts.length ? `${t('alertsTitle')}: ${alerts.map(trimEnd).join('. ')}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

/** Aparece solo si la carga tarda más de 150 ms (evita el parpadeo del esqueleto). */
function useDelayed(flag: boolean, ms = 150) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const t = setTimeout(() => setShow(true), ms);
    return () => {
      clearTimeout(t);
      setShow(false);
    };
  }, [flag, ms]);
  return flag && show;
}

/**
 * Drawer lateral de región con datos de sensores NASA. Animación de entrada (< 900 ms, solo transform/opacity):
 * spring del panel, onda de luz desde el punto tocado, título con escaneo, coordenadas en conteo
 * y tarjetas escalonadas con número que cuenta y sparkline que se dibuja. Con movimiento reducido: solo fundido.
 */
function RegionDrawerInner() {
  const t = useTranslations('region');
  const tReport = useTranslations('report');
  const tNarrator = useTranslations('narrator');
  const locale = useLocale();
  const format = useFormatter();
  const reduced = useReducedMotion();
  const isDesktop = useIsDesktop();
  const target = useRegionStore((s) => s.target);
  const close = useRegionStore((s) => s.closeRegion);
  const dragControls = useDragControls();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [width] = useState(() => drawerWidth());

  const timeSel = useTimeStore((s) => s.sel);
  const query = useRegionSummary(
    target
      ? {
          lat: target.lat,
          lon: target.lon,
          demoId: target.demoId,
          name: target.name,
          when: timeSel ? toTimeParam(timeSel) : undefined,
          admin: target.admin ? adminParam(target.admin.code) : undefined,
        }
      : null,
  );
  const showSkeleton = useDelayed(query.isPending);
  const summary = query.data;
  // Datos del periodo anterior mientras llega el nuevo (misma región): se ven atenuados.
  const placeholder = query.isPlaceholderData;
  // Datos guardados o anteriores en pantalla y una respuesta nueva en camino.
  const refreshing = useDelayed(query.isFetching && Boolean(summary), 250);
  const name = target?.name ?? summary?.name ?? null;

  // El recuadro punteado del mapa sigue al `bbox` que devuelve /region para esta región.
  useEffect(() => {
    if (target && summary) useRegionStore.getState().setCell(target, summary.bbox);
  }, [target, summary]);
  const adminArea = target?.admin ? (getAdmin(target.admin.level)?.byCode.get(target.admin.code) ?? null) : null;
  const cellKm = target ? Math.round(bboxSideKm(summary?.bbox ?? defaultCellBBox(target))) : 0;
  const focusOn = (kind: 'area' | 'dpto') => useRegionStore.getState().focusOn(kind);

  // Modo sencillo: 4 tarjetas principales; "Ver más datos" muestra el resto (solo para esta región).
  const lite = useLite();
  const targetKey = target ? `${target.lat},${target.lon},${target.demoId ?? ''}` : '';
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const showAll = !lite || expandedFor === targetKey;
  const visibleCards = useMemo(() => {
    if (!summary) return [];
    const primary = summary.cards.filter((c) => PRIMARY_CARDS.includes(c.id));
    return showAll || !primary.length ? summary.cards : primary;
  }, [summary, showAll]);
  const extraCount = summary ? summary.cards.filter((c) => !PRIMARY_CARDS.includes(c.id)).length : 0;

  // Locutor encendido: lee el resumen una vez cuando llegan los datos de la región (no los atenuados del periodo anterior).
  const narratorOn = usePrefsStore((s) => s.narrator);
  const spokenKey = useRef<string | null>(null);
  useEffect(() => {
    if (!target) {
      spokenKey.current = null;
      if (useNarratorStore.getState().speakingId === 'region') stop();
      return;
    }
    if (!narratorOn || !summary || placeholder) return;
    const key = `${targetKey}:${summary.id}:${summary.period?.label ?? ''}`;
    if (spokenKey.current === key) return;
    spokenKey.current = key;
    // Si ya se está leyendo otra cosa (p. ej. la respuesta del asistente que abrió este panel), no se corta.
    if (useNarratorStore.getState().speakingId) return;
    speak(regionSpeech(name ?? t('unnamed'), visibleCards, summary.alerts, t), { lang: locale as NarratorLang, id: 'region' });
  }, [target, targetKey, narratorOn, summary, placeholder, name, visibleCards, t, locale]);

  // Foco atrapado, Esc cierra y el foco vuelve al globo al cerrar.
  useEffect(() => {
    if (!target) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !panelRef.current) return;
      const els = panelRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!els.length) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      getMap()?.getCanvas().focus({ preventScroll: true });
    };
  }, [target, close]);

  const seeOnMap = (card: RegionSensorCard) => {
    if (!card.layerId) return;
    useLayerStore.getState().setLayer(card.layerId, { date: /^\d{4}-\d{2}-\d{2}$/.test(card.date) ? card.date : undefined });
    if (!isDesktop) close();
  };

  const askAgent = () => {
    if (!target) return;
    const label = name ?? `${target.lat.toFixed(2)}, ${target.lon.toFixed(2)}`;
    useAgentStore.getState().openWith(t('askPrompt', { name: label }), {
      openRegion: { id: summary?.id ?? 'region', name, lat: target.lat, lon: target.lon },
    });
    close();
  };

  const analyzeHere = () => {
    if (!target) return;
    const demo = DEMO_FARMS.find((d) => d.id === target.demoId);
    close();
    if (demo) {
      void selectField(demoField(demo, locale), { locale, remember: false });
    } else {
      flyTo({ lng: target.lon, lat: target.lat, zoom: 15 });
      useFieldStore.getState().setMode('choose');
    }
  };

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const slide = {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: { type: 'spring' as const, stiffness: 320, damping: 34, mass: 0.9 },
  };

  return (
    <AnimatePresence>
      {target && (
        <>
          {target.tap && <LightWave key={`wave-${target.lat}-${target.lon}`} from={target.tap} toX={window.innerWidth - width} />}
          <motion.aside
            key="region-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="region-title"
            {...(reduced ? fade : slide)}
            drag={isDesktop ? false : 'x'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 90 || info.velocity.x > 500) close();
            }}
            className="panel fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-l-3xl shadow-[var(--shadow-panel)]"
            style={{ width, paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
          >
            <header
              onPointerDown={(e) => !isDesktop && dragControls.start(e)}
              className="relative shrink-0 touch-none border-b border-line px-4 pt-4 pb-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold tracking-wider text-field-300 uppercase">
                      {summary?.kind === 'demo' || target.demoId
                        ? t('demoRegion')
                        : target.admin
                          ? t(target.admin.level === 'dpto' ? 'kickerDpto' : 'kickerMpio')
                          : t('kicker')}
                    </p>
                    {refreshing && (
                      <span role="status" className="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <Loader2 aria-hidden className="size-3.5 motion-safe:animate-spin" />
                        {t('updating')}
                      </span>
                    )}
                  </div>
                  <h2 id="region-title" className="relative mt-0.5 overflow-hidden text-xl leading-tight font-bold">
                    <span>{name ?? t('unnamed')}</span>
                    {!reduced && (
                      <motion.span
                        key={`scan-${target.lat}`}
                        aria-hidden
                        className="scan-bar absolute inset-y-0 w-1/3"
                        initial={{ x: '-120%' }}
                        animate={{ x: '360%' }}
                        transition={{ duration: 0.75, delay: 0.15, ease: 'easeInOut' }}
                      />
                    )}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-ink-muted lite:hidden">
                    <CountUp value={Math.abs(target.lat)} decimals={4} locale="en" delay={0.1} />°{target.lat >= 0 ? 'N' : 'S'}{' '}
                    <CountUp value={Math.abs(target.lon)} decimals={4} locale="en" delay={0.1} />°
                    {target.lon >= 0 ? 'E' : locale === 'en' ? 'W' : 'O'}
                  </p>
                  {summary?.period && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sun px-2.5 py-1 text-xs font-bold text-space">
                      <History aria-hidden className="size-3.5" />
                      {t('periodBadge', { period: summary.period.label })}
                      {summary.period.partial && <span className="font-normal">· {t('periodPartial')}</span>}
                    </p>
                  )}
                </div>
                {summary && (
                  <SpeakButton
                    id="region"
                    compact
                    label={tNarrator('listenRegion')}
                    text={() => regionSpeech(name ?? t('unnamed'), visibleCards, summary.alerts, t)}
                  />
                )}
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
                  aria-label={t('close')}
                  className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
                >
                  <X aria-hidden className="size-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" aria-busy={query.isPending || placeholder}>
              {query.isError && (
                <p role="alert" className="rounded-2xl bg-risk-medium/10 p-3 text-sm">
                  {t('error')}{' '}
                  <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>
                    {t('retry')}
                  </button>
                </p>
              )}

              {/* Qué marca el mapa: el área elegida, su departamento y el recuadro de donde vienen los datos.
                  Honestidad: el resumen describe ese recuadro, no un promedio de todo el municipio o departamento. */}
              {adminArea && (
                <div className="mb-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-ink-muted">
                  <p className="font-semibold">{t('mapLegend')}</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {adminArea.level === 'mpio' ? (
                      <>
                        <LegendItem
                          kind="area"
                          label={t('legendMpio', { name: adminArea.name })}
                          hint={t('seeOnMap')}
                          onFocus={isDesktop ? () => focusOn('area') : undefined}
                        />
                        {adminArea.parentName && adminArea.parentName !== adminArea.name && (
                          <LegendItem
                            kind="dpto"
                            label={t('legendDpto', { name: adminArea.parentName })}
                            hint={t('seeOnMap')}
                            onFocus={isDesktop ? () => focusOn('dpto') : undefined}
                          />
                        )}
                      </>
                    ) : (
                      <LegendItem
                        kind="area"
                        label={t('legendDpto', { name: adminArea.name })}
                        hint={t('seeOnMap')}
                        onFocus={isDesktop ? () => focusOn('area') : undefined}
                      />
                    )}
                    <LegendItem
                      kind="cell"
                      label={t('legendCell', { km: cellKm })}
                      hint={t('seeOnMap')}
                      onFocus={isDesktop ? () => focusOn('area') : undefined}
                    />
                  </ul>
                  {summary?.kind === 'cell' && (
                    <p className="mt-1.5 flex gap-1.5">
                      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                      {t(adminArea.level === 'dpto' ? 'cellNoteDpto' : 'cellNoteMpio')}
                    </p>
                  )}
                </div>
              )}

              {showSkeleton && (
                <ul aria-label={t('loading')} className="flex flex-col gap-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <li key={i} className="shimmer h-32 rounded-2xl" />
                  ))}
                </ul>
              )}

              {summary && (
                <motion.ul
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  className={clsx('flex flex-col gap-2 transition-opacity duration-300', placeholder && 'opacity-50')}
                  aria-live="polite"
                >
                  {visibleCards.map((card, i) => (
                    <SensorCard key={card.id} card={card} index={i} onSeeOnMap={() => seeOnMap(card)} format={format} />
                  ))}

                  {lite && extraCount > 0 && (
                    <motion.li variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                      <button
                        type="button"
                        aria-expanded={showAll}
                        onClick={() => setExpandedFor(showAll ? null : targetKey)}
                        className="flex min-h-11 w-full items-center justify-center rounded-full bg-white/5 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/10"
                      >
                        {showAll ? t('lessData') : t('moreData', { count: extraCount })}
                      </button>
                    </motion.li>
                  )}

                  <motion.li
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    className="mt-2 rounded-2xl bg-sun/10 p-4 ring-1 ring-sun/30"
                  >
                    <h3 className="flex items-center gap-2 font-bold">
                      <AlertTriangle aria-hidden className="size-5 text-sun" />
                      {t('alertsTitle')}
                    </h3>
                    <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
                      {summary.alerts.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </motion.li>

                  <motion.li variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                    <NearbyEvents
                      lat={target.lat}
                      lon={target.lon}
                      name={name}
                      onShowMap={() => !isDesktop && close()}
                      onReport={close}
                    />
                  </motion.li>

                  {inColombiaBox(target.lat, target.lon) && (
                    <motion.li variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                      <MarketNearby lat={target.lat} lon={target.lon} />
                    </motion.li>
                  )}

                  <motion.li
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    className="flex flex-col gap-2 pb-2"
                  >
                    <button
                      type="button"
                      onClick={askAgent}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-sky-glow/20 px-4 font-semibold ring-1 ring-sky-glow/50 hover:bg-sky-glow/30"
                    >
                      <BotMessageSquare aria-hidden className="size-5" />
                      {t('askAgent')}
                    </button>
                    <a
                      href={reportHref(locale, { lat: target.lat, lon: target.lon, name, when: timeSel ? toTimeParam(timeSel) : null })}
                      target="_blank"
                      rel="noopener"
                      title={tReport('askHint')}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/5 px-4 font-semibold ring-1 ring-line hover:bg-white/10 lite:hidden"
                    >
                      <FileText aria-hidden className="size-5" />
                      {tReport('ask')}
                    </a>
                    <button
                      type="button"
                      onClick={analyzeHere}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-bold text-black"
                    >
                      <Sprout aria-hidden className="size-5" />
                      {target.demoId ? t('openDemoFarm') : t('analyzeHere')}
                    </button>
                    {summary.mock && <p className="text-center text-xs text-ink-faint">{t('mockNote')}</p>}
                  </motion.li>
                </motion.ul>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SensorCard({
  card,
  index,
  onSeeOnMap,
  format,
}: {
  card: RegionSensorCard;
  index: number;
  onSeeOnMap: () => void;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations('region');
  const tl = useTranslations('layers');
  const locale = useLocale();
  const [explain, setExplain] = useState(false);
  const st = STATUS[card.status];
  const decimals = Math.abs(card.value ?? 0) < 10 && !Number.isInteger(card.value ?? 0) ? (card.unit === 'NDVI' ? 2 : 1) : 0;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(card.date)
    ? format.dateTime(new Date(`${card.date}T12:00:00Z`), { day: 'numeric', month: 'short', year: 'numeric' })
    : card.date;

  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 14, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } },
      }}
      className="rounded-2xl bg-white/5 p-3 ring-1 ring-line"
    >
      <div className="flex items-start gap-3">
        <OrbitBadge mission={card.mission} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold">{t(`cards.${card.id}`)}</h3>
            <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', st.cls)}>
              <st.Icon aria-hidden className="size-3.5" />
              {t(`status.${card.status}`)}
            </span>
          </div>
          <p className="mt-0.5 text-sm">{card.headline}</p>
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="shrink-0">
          {card.value != null && (
            <p className="text-2xl leading-none font-bold">
              <CountUp value={card.value} decimals={decimals} locale={locale} delay={0.2 + index * 0.06} />{' '}
              <span className="text-sm font-medium text-ink-muted">{card.unit}</span>
            </p>
          )}
          {card.comparison && card.comparison.value != null && (
            <p className="mt-1 text-xs text-ink-muted">
              {card.comparison.label}: {format.number(card.comparison.value, { maximumFractionDigits: 2 })} {card.comparison.unit}
            </p>
          )}
        </div>
        <div className="w-32 min-w-0 sm:w-40 lite:hidden">
          <Sparkline series={card.series} delay={0.25 + index * 0.06} label={`${card.seriesLabel}: ${card.series.join(', ')}`} />
          <p className="text-right text-[10px] text-ink-faint">{card.seriesLabel}</p>
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        {/* Modo sencillo: queda la confianza (honestidad); la misión, fecha y resolución son detalle técnico. */}
        <span className="lite:hidden">
          {card.mission} · {date} · {card.resolution} ·{' '}
        </span>
        {t(`confidence.${card.confidence}`)}
        {card.simulated && <span className="ml-1 rounded bg-sun/20 px-1 font-semibold text-sun">{t('simulated')}</span>}
      </p>

      <div className="mt-2 flex gap-2">
        {card.layerId && (
          <button
            type="button"
            onClick={onSeeOnMap}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
          >
            <MapIcon aria-hidden className="size-4" />
            {t('seeOnMap')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExplain((v) => !v)}
          aria-expanded={explain}
          className="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-ink-muted hover:bg-white/10"
        >
          <HelpCircle aria-hidden className="size-4" />
          {t('whatIsThis')}
        </button>
      </div>
      {explain && card.layerId && (
        <div className="mt-2 rounded-xl bg-white/5 p-3 text-sm">
          <p>{tl(`items.${card.layerId}.description`)}</p>
          <p className="mt-1 font-medium">{tl(`items.${card.layerId}.forCrops`)}</p>
        </div>
      )}
    </motion.li>
  );
}

export default function RegionDrawer() {
  return (
    <QueryProvider>
      <RegionDrawerInner />
    </QueryProvider>
  );
}
