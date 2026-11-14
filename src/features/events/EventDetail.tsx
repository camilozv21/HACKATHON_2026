'use client';

import { CalendarSearch, ExternalLink, MapPin, Radar, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRegionStore } from '@/features/region/store';
import { useTimeStore } from '@/features/time/store';
import type { HazardEvent } from '@/lib/api/contract';
import { useUnits } from '@/lib/units';
import { KindBadge } from './KindIcon';
import { useEventsStore } from './store';

const IMPACT_ORDER = ['deaths', 'injured', 'missing', 'people', 'families', 'homesDestroyed', 'homesDamaged', 'roads', 'hectares'] as const;

export function useEventDate() {
  const format = useFormatter();
  return (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Etiqueta de la fuente: quién lo registró y si está verificado (con ícono, no solo color). */
export function SourceBadge({ event }: { event: HazardEvent }) {
  const t = useTranslations('events');
  if (event.source === 'community') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sun/15 px-2 py-0.5 text-xs font-semibold text-sun ring-1 ring-sun/40">
        <ShieldAlert aria-hidden className="size-3.5" />
        {t('unverified')}
        {event.sample && <> · {t('sample')}</>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">
      <ShieldCheck aria-hidden className="size-3.5 text-field-300" />
      {t(`by.${event.source}`)}
    </span>
  );
}

/** Detalle de un evento: qué, cuándo, dónde, afectación, qué tan seguro es el dato y qué hacer después. */
export function EventDetail({ event, compact = false, onAction }: { event: HazardEvent; compact?: boolean; onAction?: () => void }) {
  const t = useTranslations('events');
  const dateLabel = useEventDate();
  const u = useUnits();
  const data = useEventsStore((s) => s.data);
  const kindLabel = t(`kind.${event.kind}`);
  const showTitle = event.title.toLowerCase() !== kindLabel.toLowerCase() && event.source !== 'community';
  const inWindow = data && event.date >= data.from && event.date <= data.to && data.to.slice(0, 7) === data.from.slice(0, 7);

  const seeRegion = () => {
    useEventsStore.getState().select(null);
    useRegionStore.getState().openRegion({ lat: event.lat, lon: event.lon, name: event.place });
    onAction?.();
  };
  const seeMonth = () => {
    useTimeStore.getState().set({ kind: 'month', ym: event.date.slice(0, 7) });
    onAction?.();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge event={event} />
        {!compact && <span className="text-sm text-ink-muted">{dateLabel(event.date)}</span>}
      </div>
      {showTitle && <p className="text-sm">{event.title}</p>}
      {event.place && (
        <p className="flex items-center gap-1.5 text-sm">
          <MapPin aria-hidden className="size-4 shrink-0 text-ink-muted" />
          {event.place}
        </p>
      )}

      {event.impact && (
        <ul className="flex flex-wrap gap-1.5">
          {IMPACT_ORDER.filter((k) => event.impact?.[k]).map((k) => (
            <li key={k} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
              {k === 'hectares' ? t('impact.hectares', { area: u.area(event.impact!.hectares!) }) : t(`impact.${k}`, { n: event.impact![k]! })}
            </li>
          ))}
        </ul>
      )}
      {event.magnitude && (
        <p className="text-sm text-ink-muted">
          {t('magnitude', {
            value:
              event.magnitude.unit === 'hectare' || event.magnitude.unit === 'hectares'
                ? u.area(event.magnitude.value)
                : `${event.magnitude.value} ${event.magnitude.unit}`,
          })}
        </p>
      )}

      {event.source === 'community' && (
        <div className="rounded-2xl bg-sun/10 p-3 text-sm ring-1 ring-sun/30">
          {event.note && <p className="italic">“{event.note}”</p>}
          {!!event.impacts?.length && (
            <p className="mt-1">
              <span className="font-semibold">{t('affected')}</span> {event.impacts.map((i) => t(`impacts.${i}`)).join(', ')}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-muted">{event.sample ? t('sampleHint') : t('unverifiedHint')}</p>
        </div>
      )}

      {event.approx && <p className="text-xs text-ink-faint">{t(`approx.${event.source}`)}</p>}

      <div className="mt-1 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={seeRegion}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
        >
          <Radar aria-hidden className="size-4" />
          {t('seeRegion')}
        </button>
        {!inWindow && (
          <button
            type="button"
            onClick={seeMonth}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
          >
            <CalendarSearch aria-hidden className="size-4" />
            {t('seeMonth')}
          </button>
        )}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-sky-glow underline-offset-2 hover:underline"
          >
            <ExternalLink aria-hidden className="size-4" />
            {event.source === 'eonet' ? t('openWorldview') : t('openSource')}
          </a>
        )}
      </div>
    </div>
  );
}

export { KindBadge };
