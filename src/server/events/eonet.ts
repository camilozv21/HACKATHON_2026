/**
 * NASA EONET v3 (Earth Observatory Natural Event Tracker): eventos naturales seguidos con satélites y agencias
 * (incendios, inundaciones, tormentas, volcanes…). Los mismos que muestra la pestaña "Events" de NASA Worldview.
 * https://eonet.gsfc.nasa.gov/docs/v3
 */
import type { HazardEvent } from '@/lib/api/contract';
import { memo } from '@/server/memo';
import { COLOMBIA_BBOX } from './divipola';
import { EONET_NON_FIRE, eonetKind } from './kinds';

type Geo = {
  date: string;
  type: string;
  coordinates: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
};
type EonetEvent = { id: string; title: string; categories: { id: string }[]; geometry: Geo[] };

const BASE = 'https://eonet.gsfc.nasa.gov/api/v3/events';

async function eonet(params: Record<string, string>): Promise<EonetEvent[]> {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  // Las respuestas pueden pesar varios MB (polígonos): se compactan y se guardan en memoria (eonetEvents).
  const res = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  return ((await res.json()) as { events?: EonetEvent[] }).events ?? [];
}

/** Pares [lon, lat] válidos de cualquier geometría (los polígonos a veces vienen con un nivel de más). */
function pairs(c: unknown, out: [number, number][] = []): [number, number][] {
  if (!Array.isArray(c)) return out;
  if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
    const [lon, lat] = c as number[];
    if (Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180) out.push([lon!, lat!]);
    return out;
  }
  for (const x of c) pairs(x, out);
  return out;
}

function point(g: Geo): { lon: number; lat: number; approx: boolean } | null {
  const ps = pairs(g.coordinates);
  if (!ps.length) return null;
  if (ps.length === 1) return { lon: ps[0]![0], lat: ps[0]![1], approx: false };
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ps) {
    x += lon;
    y += lat;
  }
  return { lon: x / ps.length, lat: y / ps.length, approx: true };
}

export function toEvent(e: EonetEvent, to: string): HazardEvent | null {
  const kind = eonetKind(e.categories.map((c) => c.id));
  if (!kind) return null;
  // Última posición conocida dentro del periodo (las tormentas traen toda su trayectoria).
  const geos = e.geometry.filter((g) => g.date.slice(0, 10) <= to);
  const g = geos.at(-1) ?? e.geometry[0];
  const p = g && point(g);
  if (!g || !p) return null;
  return {
    id: e.id,
    source: 'eonet',
    kind,
    title: e.title.slice(0, 200),
    date: g.date.slice(0, 10),
    lat: Math.round(p.lat * 1e4) / 1e4,
    lon: Math.round(p.lon * 1e4) / 1e4,
    place: null,
    approx: p.approx,
    // Se abre en NASA Worldview con el evento seleccionado.
    url: `https://worldview.earthdata.nasa.gov/?e=${encodeURIComponent(e.id)}`,
    verified: true,
    impact: null,
    magnitude: g.magnitudeValue != null && g.magnitudeUnit ? { value: g.magnitudeValue, unit: g.magnitudeUnit.slice(0, 40) } : null,
    note: null,
  };
}

/**
 * Eventos del mundo entre dos fechas. Los incendios son la gran mayoría: se piden aparte (los más recientes),
 * y además todo lo de Colombia y alrededores, para que lo local no quede fuera por el límite.
 */
export function eonetEvents(from: string, to: string): Promise<HazardEvent[]> {
  return memo(`eonet:${from}:${to}`, 30 * 60_000, () => loadEonet(from, to));
}

async function loadEonet(from: string, to: string): Promise<HazardEvent[]> {
  const base = { status: 'all', start: from, end: to };
  const { west, north, east, south } = COLOMBIA_BBOX;
  const pages = await Promise.all([
    eonet({ ...base, category: EONET_NON_FIRE.join(','), limit: '400' }),
    eonet({ ...base, category: 'wildfires', limit: '300' }),
    // EONET: bbox = oeste, norte, este, sur.
    eonet({ ...base, bbox: `${west},${north},${east},${south}`, limit: '300' }),
  ]);
  const seen = new Set<string>();
  const out: HazardEvent[] = [];
  for (const e of pages.flat()) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const ev = toEvent(e, to);
    if (ev) out.push(ev);
  }
  return out;
}
