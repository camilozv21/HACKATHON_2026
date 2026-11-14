/**
 * Eventos y emergencias: une NASA EONET (mundo), UNGRD (registro oficial de Colombia) y los reportes de la comunidad.
 * Lo usan /api/events, /api/events/history y el agente.
 */
import type { EventHistory, EventSourceStatus, EventsResponse, HazardEvent } from '@/lib/api/contract';
import { haversineKm } from '@/lib/geo';
import { communityEvents } from './community';
import { nearestMunicipio } from './divipola';
import { eonetEvents } from './eonet';
import { UNGRD_FIRST_YEAR, ungrdEvents, ungrdHistory, ungrdLatest } from './ungrd';

const byDateDesc = (a: HazardEvent, b: HazardEvent) => b.date.localeCompare(a.date);

export async function loadEvents(from: string, to: string): Promise<EventsResponse> {
  const [eonet, ungrd] = await Promise.allSettled([
    eonetEvents(from, to),
    (async () => {
      const latest = await ungrdLatest();
      if (latest && from > latest) return { latest, events: null };
      return { latest, events: await ungrdEvents(from, latest && to > latest ? latest : to) };
    })(),
  ]);
  const community = communityEvents(from, to);

  const sources: EventSourceStatus[] = [];
  const events: HazardEvent[] = [];
  if (eonet.status === 'fulfilled') {
    events.push(...eonet.value);
    sources.push({ id: 'eonet', status: eonet.value.length ? 'ok' : 'empty', count: eonet.value.length, latest: null });
  } else sources.push({ id: 'eonet', status: 'error', count: 0, latest: null });

  if (ungrd.status === 'fulfilled') {
    const { latest, events: list } = ungrd.value;
    if (list) events.push(...list);
    sources.push({ id: 'ungrd', status: list === null ? 'not-yet' : list.length ? 'ok' : 'empty', count: list?.length ?? 0, latest });
  } else sources.push({ id: 'ungrd', status: 'error', count: 0, latest: null });

  events.push(...community);
  sources.push({ id: 'community', status: community.length ? 'ok' : 'empty', count: community.length, latest: null });

  return { from, to, events: events.sort(byDateDesc), sources };
}

const NEARBY_KM = 50;

export async function eventHistory(lat: number, lon: number, from: string, to: string): Promise<EventHistory> {
  const m = nearestMunicipio(lat, lon);
  const here = { lat, lng: lon };
  const near = (e: HazardEvent) => haversineKm(here, { lat: e.lat, lng: e.lon }) <= NEARBY_KM;

  const [history, latest, eonet] = await Promise.allSettled([
    m ? ungrdHistory(m.code) : Promise.resolve(null),
    ungrdLatest(),
    eonetEvents(from, to),
  ]);
  const nearby = [...(eonet.status === 'fulfilled' ? eonet.value.filter(near) : []), ...communityEvents(from, to).filter(near)]
    .sort(byDateDesc)
    .slice(0, 5);
  const h = history.status === 'fulfilled' ? history.value : null;
  const lastYear = latest.status === 'fulfilled' && latest.value ? Number(latest.value.slice(0, 4)) : new Date().getUTCFullYear() - 1;

  return {
    place: m ? { code: m.code, name: m.name, dept: m.dept, distanceKm: m.distanceKm } : null,
    years: { from: UNGRD_FIRST_YEAR, to: lastYear },
    total: h ? h.byKind.reduce((s, k) => s + k.count, 0) : 0,
    byKind: h?.byKind ?? [],
    recent: h?.recent ?? [],
    nearby,
    status: !m ? 'outside' : h ? 'ok' : 'error',
  };
}
