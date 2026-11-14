'use client';

import clsx from 'clsx';
import { AlertTriangle, Check, Megaphone, Phone, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flyTo } from '@/features/globe/camera';
import { getMap } from '@/features/globe/store';
import { periodLabel } from '@/features/time/period';
import { useTimeStore } from '@/features/time/store';
import { HAZARD_KINDS, type HazardSource } from '@/lib/api/contract';
import { haversineKm } from '@/lib/geo';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useEventDate } from './EventDetail';
import { KindBadge } from './KindIcon';
import { GROUP_COLOR, GROUPS } from './kinds';
import { useEventsStore, visibleEvents } from './store';

const SOURCES: HazardSource[] = ['eonet', 'ungrd', 'community'];

/** Lista de eventos del periodo: fuentes (con su estado), filtro por tipo, leyenda y los más cercanos. */
export function EventsSheet() {
  const t = useTranslations('events');
  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const dateLabel = useEventDate();
  const data = useEventsStore((s) => s.data);
  const status = useEventsStore((s) => s.status);
  const mine = useEventsStore((s) => s.mine);
  const kind = useEventsStore((s) => s.kind);
  const hidden = useEventsStore((s) => s.hiddenSources);
  const sel = useTimeStore((s) => s.sel);
  const { setListOpen, setKind, toggleSource, select, openReport, reload } = useEventsStore.getState();
  const panelRef = useRef<HTMLElement>(null);
  const [center] = useState(() => {
    const c = getMap()?.getCenter();
    return c ? { lat: c.lat, lng: c.lng } : null;
  });

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useEventsStore.getState().setListOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = useMemo(() => {
    const all = visibleEvents({ data, mine, kind: null, hiddenSources: hidden });
    const c = new Map<string, number>();
    for (const e of all) c.set(e.kind, (c.get(e.kind) ?? 0) + 1);
    return c;
  }, [data, mine, hidden]);

  const nearest = useMemo(() => {
    const list = visibleEvents({ data, mine, kind, hiddenSources: hidden });
    if (!center) return list.slice(0, 20).map((e) => ({ e, km: null as number | null }));
    return list
      .map((e) => ({ e, km: haversineKm(center, { lat: e.lat, lng: e.lon }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 20);
  }, [data, mine, kind, hidden, center]);

  const period = sel ? periodLabel(sel, locale) : t('recent');
  const ungrd = data?.sources.find((s) => s.id === 'ungrd');

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="events-title"
      className={clsx(
        'panel pointer-events-auto fixed z-40 flex flex-col overflow-hidden shadow-2xl',
        isDesktop
          ? 'top-[calc(var(--safe-top)+4.5rem)] left-4 max-h-[calc(100dvh-6rem)] w-[26rem] rounded-3xl'
          : 'inset-x-0 bottom-0 max-h-[80dvh] rounded-t-[var(--radius-sheet)]',
      )}
    >
      <header className="flex items-start gap-2 px-4 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <h2 id="events-title" className="flex items-center gap-2 text-lg font-bold">
            <AlertTriangle aria-hidden className="size-5 text-sun" />
            {t('title')}
          </h2>
          <p className="text-sm text-ink-muted first-letter:uppercase">{period}</p>
        </div>
        <button
          type="button"
          onClick={() => setListOpen(false)}
          aria-label={t('close')}
          className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4" aria-busy={status === 'loading'}>
        {status === 'loading' && <p className="shimmer h-16 rounded-2xl" aria-label={t('loading')} />}
        {status === 'error' && (
          <p role="alert" className="rounded-2xl bg-risk-medium/10 p-3 text-sm">
            {t('error')}{' '}
            <button type="button" onClick={reload} className="font-semibold underline">
              {t('retry')}
            </button>
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <h3 className="font-bold">{t('sources')}</h3>
          {SOURCES.map((id) => {
            const s = data?.sources.find((x) => x.id === id);
            const on = !hidden.includes(id);
            const extra = id === 'community' ? mine.filter((e) => data && e.date >= data.from && e.date <= data.to && !data.events.some((d) => d.id === e.id)).length : 0;
            return (
              <button
                key={id}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggleSource(id)}
                className={clsx(
                  'flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1',
                  on ? 'bg-field-500/10 ring-field-400/60' : 'bg-white/5 ring-line',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {t(`source.${id}`)}{' '}
                    <span className="font-normal text-ink-muted">
                      · {s?.status === 'error' ? t('sourceError') : t('sourceCount', { count: (s?.count ?? 0) + extra })}
                    </span>
                  </span>
                  <span className="block text-xs text-ink-muted">{t(`sourceHint.${id}`)}</span>
                </span>
                <span
                  aria-hidden
                  className={clsx('grid size-6 shrink-0 place-items-center rounded-full ring-2', on ? 'bg-field-400 ring-field-400' : 'ring-line-strong')}
                >
                  {on && <Check className="size-4 text-space" />}
                </span>
              </button>
            );
          })}
          {ungrd?.status === 'not-yet' && ungrd.latest && (
            <p className="rounded-2xl bg-white/5 p-3 text-sm">
              {t('ungrdNotYet', { date: dateLabel(ungrd.latest) })}{' '}
              <button
                type="button"
                onClick={() => useTimeStore.getState().set({ kind: 'month', ym: ungrd.latest!.slice(0, 7) })}
                className="font-semibold text-sky-glow underline"
              >
                {t('ungrdSeeLatest', { month: periodLabel({ kind: 'month', ym: ungrd.latest.slice(0, 7) }, locale) })}
              </button>
            </p>
          )}
        </div>

        <div role="radiogroup" aria-labelledby="events-kind-title" className="flex flex-col gap-1.5">
          <h3 id="events-kind-title" className="font-bold">
            {t('kindFilter')}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <Chip checked={kind === null} onClick={() => setKind(null)} label={t('allKinds')} />
            {HAZARD_KINDS.filter((k) => counts.get(k)).map((k) => (
              <Chip key={k} checked={kind === k} onClick={() => setKind(k)} label={`${t(`kind.${k}`)} · ${counts.get(k)}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="font-bold">{t('legend')}</h3>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {GROUPS.map((g) => (
              <li key={g} className="flex items-center gap-2">
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: GROUP_COLOR[g] }} />
                {t(`group.${g}`)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">{t('legendShape')}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="font-bold">{t('nearCenter')}</h3>
          {status !== 'loading' && !nearest.length && <p className="text-sm text-ink-muted">{t('none')}</p>}
          <ul className="flex flex-col gap-1.5">
            {nearest.map(({ e, km }) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    select([e]);
                    const map = getMap();
                    flyTo({ lng: e.lon, lat: e.lat, zoom: Math.max(map?.getZoom() ?? 0, 7.5) });
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-left ring-1 ring-line hover:bg-white/10"
                >
                  <KindBadge kind={e.kind} ring={e.source === 'community'} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {t(`kind.${e.kind}`)}
                      {e.place ? ` · ${e.place}` : ''}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {dateLabel(e.date)} · {t(`source.${e.source}`)}
                      {e.source === 'community' && ` · ${t('unverified')}`}
                      {km != null && ` · ${t('km', { km: Math.round(km) })}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t border-line px-4 pt-3 pb-[calc(var(--safe-bottom)+0.75rem)]">
        <button
          type="button"
          onClick={() => openReport()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-bold text-black hover:bg-field-400"
        >
          <Megaphone aria-hidden className="size-5" />
          {t('reportEvent')}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
          <Phone aria-hidden className="size-3.5 shrink-0" />
          {t('emergency')}
        </p>
      </footer>
    </section>
  );
}

function Chip({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={clsx(
        'flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1',
        checked ? 'bg-field-500/20 ring-2 ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
      )}
    >
      {checked && <Check aria-hidden className="size-4" />}
      {label}
    </button>
  );
}
