'use client';

import clsx from 'clsx';
import { CalendarDays, HelpCircle, Pause, Play, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useMediaQuery';
import { formatLegendValue, legendGradient, loadColormap, type Colormap } from './colormap';
import { monthOptions } from './dates';
import { LayerIcon } from './LayerIcon';
import { LAYER_BY_ID } from './layers.config';
import { useLayerStore } from './store';

/** Leyenda de zonas de riesgo: solo se descarga cuando esa capa está activa. */
const RiskLegend = dynamic(() => import('@/features/terrain/RiskLegend'), { ssr: false });

const SAT_NOTE_KEY = 'fieldshift:seen-satellite-note:v1';

function readSeen() {
  try {
    return localStorage.getItem(SAT_NOTE_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * Barra de la capa activa (abajo, al alcance del pulgar): leyenda con unidades, valor del punto tocado,
 * fecha con timeline deslizable, animación de 12 meses, transparencia y "¿qué es esto?".
 */
export default function LayerBar() {
  const t = useTranslations('layers');
  const locale = useLocale();
  const format = useFormatter();
  const reducedMotion = useReducedMotion();
  const id = useLayerStore((s) => s.active[0]);
  const date = useLayerStore((s) => (id ? s.dates[id] : undefined));
  const playFrame = useLayerStore((s) => s.playFrame);
  const playing = useLayerStore((s) => s.playing);
  const opacity = useLayerStore((s) => (id ? s.opacity[id] : undefined));
  const probe = useLayerStore((s) => s.probe);
  const tileError = useLayerStore((s) => (id ? s.tileError[id] : false));
  const { removeLayer, setDate, setOpacity, setPlaying } = useLayerStore.getState();
  const [cm, setCm] = useState<Colormap | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showNote, setShowNote] = useState(() => !readSeen());
  const stripRef = useRef<HTMLDivElement>(null);

  const cfg = id ? LAYER_BY_ID[id] : null;

  useEffect(() => {
    if (!cfg?.legend) return;
    let alive = true;
    void loadColormap(cfg.legend.colormap).then((c) => alive && setCm(c));
    return () => {
      alive = false;
    };
  }, [cfg]);

  // Centrar el mes elegido en el timeline.
  useEffect(() => {
    if (!timelineOpen) return;
    stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [timelineOpen, date]);

  if (!cfg || !id) return null;

  const shownDate = playFrame ?? date;
  const dateLabel = shownDate
    ? format.dateTime(
        new Date(`${shownDate}T12:00:00Z`),
        cfg.cadence === 'daily' ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'long', year: 'numeric' },
      )
    : null;
  const months = cfg.kind === 'gibs' ? monthOptions(cfg, 24) : [];
  const op = opacity ?? cfg.defaultOpacity;
  const legend = cfg.legend;
  const unit = legend ? (legend.unit === 'mm/día' && locale === 'en' ? 'mm/day' : legend.unit) : '';

  const dismissNote = () => {
    setShowNote(false);
    try {
      localStorage.setItem(SAT_NOTE_KEY, '1');
    } catch {
      // sin almacenamiento: se volverá a mostrar, no es grave
    }
  };

  return (
    <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-2 self-center">
      {showNote && (
        <aside role="note" className="panel rounded-2xl p-3 text-sm shadow-xl">
          <p className="font-semibold">{t('satNoteTitle')}</p>
          <p className="mt-1 text-ink-muted">{t('satNote')}</p>
          <button
            type="button"
            onClick={dismissNote}
            className="mt-2 min-h-11 rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/15"
          >
            {t('gotIt')}
          </button>
        </aside>
      )}

      <section aria-label={t(`items.${id}.name`)} className="panel rounded-2xl p-3 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-field-300">
            <LayerIcon name={cfg.icon} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate leading-tight font-semibold">{t(`items.${id}.name`)}</p>
            {dateLabel && (
              <button
                type="button"
                onClick={() => setTimelineOpen((v) => !v)}
                aria-expanded={timelineOpen}
                aria-label={`${t('chooseDate')}: ${dateLabel}`}
                className="-ml-1 flex min-h-8 items-center gap-1 rounded-full px-1 text-sm text-ink-muted hover:text-ink"
              >
                <CalendarDays aria-hidden className="size-4" />
                <span className="tabular-nums">{dateLabel}</span>
                <span className="text-ink-faint">· {cfg.mission}</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            aria-expanded={infoOpen}
            aria-label={t('whatIsThis')}
            className="grid size-11 place-items-center rounded-full hover:bg-white/10"
          >
            <HelpCircle aria-hidden className="size-5" />
          </button>
          {cfg.kind === 'gibs' && !reducedMotion && (
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              aria-pressed={playing}
              aria-label={playing ? t('pause') : t('play')}
              title={playing ? t('pause') : t('play')}
              className={clsx('grid size-11 place-items-center rounded-full', playing ? 'bg-field-500 text-black' : 'hover:bg-white/10')}
            >
              {playing ? <Pause aria-hidden className="size-5" /> : <Play aria-hidden className="size-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => removeLayer(id)}
            aria-label={t('turnOff')}
            className="grid size-11 place-items-center rounded-full hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {legend && cm && (
          <div className="mt-2">
            <div
              className="h-3 w-full rounded-full ring-1 ring-white/20"
              style={{ background: legendGradient(cm, legend) }}
              aria-hidden
            />
            <div className="mt-1 flex justify-between text-xs text-ink-muted">
              <span>
                {t(`items.${id}.low`)} · {formatLegendValue(legend, legend.min, locale)} {unit}
              </span>
              <span>
                {formatLegendValue(legend, legend.max, locale)} {unit} · {t(`items.${id}.high`)}
              </span>
            </div>
          </div>
        )}
        {cfg.kind === 'hillshade' && (
          <div className="mt-2 flex justify-between text-xs text-ink-muted">
            <span>{t(`items.${id}.low`)}</span>
            <span>{t(`items.${id}.high`)}</span>
          </div>
        )}
        {cfg.kind === 'vector' && <RiskLegend />}

        <p role="status" aria-live="polite" className="mt-2 text-sm">
          {tileError ? (
            <span className="text-risk-medium">{cfg.kind === 'hillshade' ? t('reliefNoData') : t('noData')}</span>
          ) : probe?.layerId === id ? (
            probe.status === 'loading' ? (
              <span className="text-ink-muted">{t('probeLoading')}</span>
            ) : probe.status === 'value' && legend && probe.value != null ? (
              <span className="flex flex-wrap items-center gap-x-2">
                {probe.color && (
                  <span
                    aria-hidden
                    className="inline-block size-3 rounded-sm ring-1 ring-white/40"
                    style={{ background: `rgb(${probe.color.join(' ')})` }}
                  />
                )}
                <span className="font-semibold">
                  {t('probeValue', { value: formatLegendValue(legend, probe.value, locale), unit })}
                </span>
                <span className="text-xs text-ink-faint">({t('approx')})</span>
              </span>
            ) : probe.status === 'nodata' ? (
              <span className="text-ink-muted">{t('probeNoData')}</span>
            ) : (
              <span className="text-ink-muted">{t('probeError')}</span>
            )
          ) : cfg.kind === 'gibs' ? (
            <span className="text-ink-faint">{t('probeHint')}</span>
          ) : null}
        </p>

        {timelineOpen && months.length > 0 && (
          <div className="mt-2">
            <div ref={stripRef} role="group" aria-label={t('date')} className="no-scrollbar -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
              {months.map((m) => {
                const selected = Boolean(m.date && date && m.date.slice(0, 7) === date.slice(0, 7));
                const d = new Date(`${m.key}-15T12:00:00Z`);
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={!m.date}
                    aria-pressed={selected}
                    onClick={() => m.date && setDate(id, m.date)}
                    className={clsx(
                      'flex min-h-12 min-w-14 shrink-0 snap-center flex-col items-center justify-center rounded-xl px-2 text-xs ring-1',
                      selected ? 'bg-field-500 font-bold text-black ring-field-500' : 'ring-line hover:bg-white/10',
                      !m.date && 'opacity-35',
                    )}
                  >
                    <span className="capitalize">{format.dateTime(d, { month: 'short' })}</span>
                    <span className="tabular-nums">{format.dateTime(d, { year: '2-digit' })}</span>
                  </button>
                );
              })}
            </div>
            <label className="mt-2 flex items-center gap-3 text-sm">
              <span className="shrink-0 text-ink-muted">{t('opacity')}</span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={op}
                onChange={(e) => setOpacity(id, Number(e.target.value))}
                className="h-11 w-full accent-[var(--color-field-500)]"
              />
            </label>
          </div>
        )}

        {infoOpen && (
          <div className="mt-2 rounded-xl bg-white/5 p-3 text-sm ring-1 ring-line">
            <p>{t(`items.${id}.description`)}</p>
            <p className="mt-2 font-medium">{t(`items.${id}.forCrops`)}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-ink-muted">
              <dt>{t('source')}</dt>
              <dd>{cfg.mission}</dd>
              <dt>{t('resolution')}</dt>
              <dd>{t(`items.${id}.res`)}</dd>
              <dt>{t('frequency')}</dt>
              <dd>{t(`cadence.${cfg.cadence}`)}</dd>
            </dl>
            {(id === 'evap' || id === 'groundwater') && <p className="mt-2 text-xs text-risk-medium">{t(`items.${id}.note`)}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
