'use client';

import clsx from 'clsx';
import { AlertTriangle, Check, Columns2, LandPlot, Megaphone, Satellite, Store, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useEventsStore } from '@/features/events/store';
import { useListingsStore } from '@/features/listings/store';
import { setBoundariesVisible } from '@/features/globe/actions';
import { useGlobeStore } from '@/features/globe/store';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { latestDate } from './dates';
import { LayerIcon } from './LayerIcon';
import { LAYERS } from './layers.config';
import { useLayerStore } from './store';

/**
 * Catálogo de capas: tarjetas grandes con ícono, nombre, una línea de explicación y un interruptor.
 * Móvil: 1 capa de datos a la vez. Desktop: una segunda capa se compara con la cortina.
 */
export default function LayerCatalog() {
  const t = useTranslations('layers');
  const te = useTranslations('events');
  const eventsOn = useEventsStore((s) => s.visible);
  const tl = useTranslations('listings');
  const shopOn = useListingsStore((s) => s.visible);
  const boundariesOn = useGlobeStore((s) => s.showBoundaries);
  const format = useFormatter();
  const isDesktop = useIsDesktop();
  const open = useLayerStore((s) => s.catalogOpen);
  const setOpen = useLayerStore((s) => s.setCatalogOpen);
  const active = useLayerStore((s) => s.active);
  const setLayer = useLayerStore((s) => s.setLayer);
  const removeLayer = useLayerStore((s) => s.removeLayer);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button[role="switch"]')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="layers-title"
      className={clsx(
        'panel pointer-events-auto fixed z-40 flex flex-col overflow-hidden shadow-2xl',
        isDesktop
          ? 'top-[calc(var(--safe-top)+4.5rem)] right-[calc(var(--map-pad-right,0px)+0.75rem)] max-h-[calc(100dvh-6rem)] w-[28rem] rounded-3xl'
          : 'inset-x-0 bottom-0 max-h-[78dvh] rounded-t-[var(--radius-sheet)] pb-[var(--safe-bottom)]',
      )}
    >
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 id="layers-title" className="flex items-center gap-2 text-lg font-bold">
          <Satellite aria-hidden className="size-5 text-sky-glow" />
          {t('title')}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('close')}
          className="grid size-11 place-items-center rounded-full hover:bg-white/10"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <ul className="flex flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-3">
        {/* Encima de cualquier capa de datos: eventos y emergencias (NASA EONET, UNGRD y la comunidad). */}
        <li className="flex flex-col gap-1.5">
          <p className="px-1 text-xs font-semibold tracking-wider text-ink-faint uppercase">{t('overlays')}</p>
          <div
            className={clsx(
              'flex items-stretch gap-1 rounded-2xl ring-1 transition-colors',
              eventsOn ? 'bg-field-500/15 ring-field-400' : 'bg-white/5 ring-line',
            )}
          >
            <button
              type="button"
              role="switch"
              aria-checked={eventsOn}
              onClick={() => {
                useEventsStore.getState().setVisible(!eventsOn);
                if (!eventsOn && !isDesktop) setOpen(false);
              }}
              className="flex min-h-18 flex-1 items-center gap-3 rounded-2xl px-3 py-3 text-left"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-sun">
                <AlertTriangle aria-hidden className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{te('layerName')}</span>
                <span className="block text-sm text-ink-muted">{te('layerShort')}</span>
              </span>
              <span
                aria-hidden
                className={clsx(
                  'grid size-7 shrink-0 place-items-center rounded-full ring-2',
                  eventsOn ? 'bg-field-500 text-black ring-field-500' : 'ring-line-strong',
                )}
              >
                {eventsOn && <Check className="size-4" />}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                useEventsStore.getState().openReport();
                setOpen(false);
              }}
              aria-label={te('reportEvent')}
              className="my-2 mr-2 flex min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-xs font-semibold hover:bg-white/10"
            >
              <Megaphone aria-hidden className="size-5" />
              {te('report')}
            </button>
          </div>
        </li>
        {/* Fincas que venden (Colombia): publicaciones de agricultores con contacto por WhatsApp. */}
        <li>
          <button
            type="button"
            role="switch"
            aria-checked={shopOn}
            onClick={() => {
              useListingsStore.getState().setVisible(!shopOn);
              if (!shopOn && !isDesktop) setOpen(false);
            }}
            className={clsx(
              'flex min-h-18 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ring-1 transition-colors',
              shopOn ? 'bg-field-500/15 ring-field-400' : 'bg-white/5 ring-line',
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-field-300">
              <Store aria-hidden className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{tl('layerName')}</span>
              <span className="block text-sm text-ink-muted">{tl('layerShort')}</span>
            </span>
            <span
              aria-hidden
              className={clsx('grid size-7 shrink-0 place-items-center rounded-full ring-2', shopOn ? 'bg-field-500 text-black ring-field-500' : 'ring-line-strong')}
            >
              {shopOn && <Check className="size-4" />}
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            role="switch"
            aria-checked={boundariesOn}
            onClick={() => setBoundariesVisible(!boundariesOn)}
            className={clsx(
              'flex min-h-18 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ring-1 transition-colors',
              boundariesOn ? 'bg-field-500/15 ring-field-400' : 'bg-white/5 ring-line',
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-sky-glow">
              <LandPlot aria-hidden className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t('boundaries.name')}</span>
              <span className="block text-sm text-ink-muted">{t('boundaries.short')}</span>
            </span>
            <span
              aria-hidden
              className={clsx(
                'grid size-7 shrink-0 place-items-center rounded-full ring-2',
                boundariesOn ? 'bg-field-500 text-black ring-field-500' : 'ring-line-strong',
              )}
            >
              {boundariesOn && <Check className="size-4" />}
            </span>
          </button>
        </li>
        {LAYERS.map((layer) => {
          const isOn = active[0] === layer.id;
          const isCompare = active[1] === layer.id;
          const latest = latestDate(layer);
          return (
            <li key={layer.id}>
              <div
                className={clsx(
                  'flex items-stretch gap-1 rounded-2xl ring-1 transition-colors',
                  isOn || isCompare ? 'bg-field-500/15 ring-field-400' : 'bg-white/5 ring-line',
                )}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  onClick={() => {
                    if (isOn) removeLayer(layer.id);
                    else {
                      setLayer(layer.id);
                      if (!isDesktop) setOpen(false);
                    }
                  }}
                  className="flex min-h-18 flex-1 items-center gap-3 rounded-2xl px-3 py-3 text-left"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-field-300">
                    <LayerIcon name={layer.icon} className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t(`items.${layer.id}.name`)}</span>
                    <span className="block text-sm text-ink-muted">{t(`items.${layer.id}.short`)}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint lite:hidden">
                      {layer.mission} · {t(`items.${layer.id}.res`)} · {t(`cadence.${layer.cadence}`)}
                      {latest && <> · {format.dateTime(new Date(`${latest}T12:00:00Z`), { month: 'short', year: 'numeric' })}</>}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={clsx(
                      'grid size-7 shrink-0 place-items-center rounded-full ring-2',
                      isOn ? 'bg-field-500 text-black ring-field-500' : 'ring-line-strong',
                    )}
                  >
                    {isOn && <Check className="size-4" />}
                  </span>
                </button>
                {isDesktop && active[0] && !isOn && layer.kind === 'gibs' && (
                  <button
                    type="button"
                    onClick={() => (isCompare ? removeLayer(layer.id) : setLayer(layer.id, { compare: true }))}
                    aria-pressed={isCompare}
                    title={t('compareHint')}
                    className={clsx(
                      'my-2 mr-2 flex items-center gap-1 rounded-xl px-2 text-xs font-semibold lite:hidden',
                      isCompare ? 'bg-sky-glow/30' : 'hover:bg-white/10',
                    )}
                  >
                    <Columns2 aria-hidden className="size-4" />
                    {t('compare')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
