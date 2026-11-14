'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Map as MapIcon, Megaphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { periodLabel } from '@/features/time/period';
import { useTimeStore } from '@/features/time/store';
import { EventHistory } from '@/lib/api/contract';
import { useEventDate } from './EventDetail';
import { KindBadge } from './KindIcon';
import { useEventsStore } from './store';
import { eventWindow } from './window';

async function fetchHistory(lat: number, lon: number, from: string, to: string, signal: AbortSignal) {
  const res = await fetch(`/api/events/history?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&from=${from}&to=${to}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return EventHistory.parse(await res.json());
}

/**
 * En el drawer de región: el historial oficial de emergencias del municipio (UNGRD, 2019 en adelante) y los
 * eventos cercanos del periodo (NASA EONET y la comunidad). Botones para verlos en el mapa o reportar algo aquí.
 */
export function NearbyEvents({
  lat,
  lon,
  name,
  onShowMap,
  onReport,
}: {
  lat: number;
  lon: number;
  name: string | null;
  onShowMap: () => void;
  onReport: () => void;
}) {
  const t = useTranslations('events');
  const tn = useTranslations('events.nearby');
  const locale = useLocale();
  const dateLabel = useEventDate();
  const sel = useTimeStore((s) => s.sel);
  const w = eventWindow(sel);
  const q = useQuery({
    queryKey: ['event-history', lat.toFixed(3), lon.toFixed(3), w.from, w.to],
    queryFn: ({ signal }) => fetchHistory(lat, lon, w.from, w.to, signal),
    staleTime: 10 * 60_000,
  });
  const h = q.data;
  const period = sel ? periodLabel(sel, locale) : t('recent');

  return (
    <section aria-labelledby="nearby-events-title" className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
      <h3 id="nearby-events-title" className="flex items-center gap-2 font-bold">
        <AlertTriangle aria-hidden className="size-5 text-sun" />
        {tn('title')}
      </h3>

      {q.isPending && <p className="shimmer mt-2 h-14 rounded-xl" aria-label={t('loading')} />}
      {q.isError && <p className="mt-2 text-sm text-ink-muted">{tn('error')}</p>}

      {h && (
        <div className="mt-2 flex flex-col gap-3 text-sm">
          {h.status === 'outside' && <p className="text-ink-muted">{tn('outside')}</p>}
          {h.status === 'error' && <p className="text-ink-muted">{tn('error')}</p>}
          {h.status === 'ok' && h.place && (
            <>
              <p>{tn('history', { count: h.total, place: `${h.place.name}, ${h.place.dept}`, from: h.years.from, to: h.years.to })}</p>
              {!!h.byKind.length && (
                <ul className="flex flex-wrap gap-1.5">
                  {h.byKind.slice(0, 6).map((k) => (
                    <li key={k.kind} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-3 pl-1 text-xs font-semibold">
                      <KindBadge kind={k.kind} size="sm" />
                      {t(`kind.${k.kind}`)} · {k.count}
                    </li>
                  ))}
                </ul>
              )}
              {!!h.recent.length && (
                <div>
                  <h4 className="font-semibold">{tn('recentOfficial')}</h4>
                  <ul className="mt-1 flex flex-col gap-1 text-ink-muted">
                    {h.recent.slice(0, 3).map((e) => (
                      <li key={e.id}>
                        {dateLabel(e.date)} · {t(`kind.${e.kind}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div>
            <h4 className="font-semibold first-letter:uppercase">{tn('recentNearby', { period })}</h4>
            {h.nearby.length ? (
              <ul className="mt-1 flex flex-col gap-1.5">
                {h.nearby.slice(0, 3).map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <KindBadge kind={e.kind} ring={e.source === 'community'} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t(`kind.${e.kind}`)}</span>
                      <span className="block text-xs text-ink-muted">
                        {dateLabel(e.date)} · {t(`source.${e.source}`)}
                        {e.source === 'community' && ` · ${t('unverified')}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-muted">{tn('noneNearby')}</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            useEventsStore.getState().setVisible(true);
            onShowMap();
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
        >
          <MapIcon aria-hidden className="size-4" />
          {tn('showOnMap')}
        </button>
        <button
          type="button"
          onClick={() => {
            useEventsStore.getState().openReport({ lat, lon, place: name });
            onReport();
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
        >
          <Megaphone aria-hidden className="size-4" />
          {tn('report')}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-faint">{tn('sourceLine')}</p>
    </section>
  );
}
