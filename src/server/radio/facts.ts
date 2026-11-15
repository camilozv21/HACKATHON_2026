/**
 * Datos de un punto para el programa de la radio. Solo servidor.
 *  - Lluvia y temperatura reales de NASA POWER (si responde); el resto de sensores sale de las tarjetas de región
 *    (las simuladas van marcadas y el locutor lo dice).
 *  - Eventos cercanos: NASA EONET, registro oficial UNGRD (Colombia) y reportes de la comunidad (sin verificar).
 *  - Colombia: zona de riesgo del municipio (Google Earth Engine + Markov) y mercado (DANE SIPSA).
 * Cada fuente tiene su propio tope de tiempo: si una falla, el programa sale igual sin ese bloque.
 */
import { eventWindow } from '@/features/events/window';
import type { Hazard } from '@/features/terrain/kinds';
import { scoreTerrain } from '@/features/terrain/score';
import type { Confidence, HazardKind, Level, RegionSensorCard } from '@/lib/api/contract';
import { TerrainIndex } from '@/lib/api/terrain';
import { haversineKm } from '@/lib/geo';
import type { ProductId } from '@/lib/market/catalog';
import { buildMockRegion, type PowerRecent } from '@/mocks/region';
import { eventHistory } from '../events';
import { nearestMunicipio } from '../events/divipola';
import { listListings } from '../listings';
import { marketForPoint } from '../market';
import { memo } from '../memo';
import { powerRecent } from '../powerRecent';

export type Loc = 'es' | 'en';
type Status = RegionSensorCard['status'];

export type RainFacts = {
  last7: number;
  last30: number;
  normal30: number;
  /** % sobre (+) o bajo (−) lo normal en 30 días. */
  pct: number;
  date: string;
  simulated: boolean;
};
export type HeatFacts = { maxT: number; hotDays: number; minT7: number; frost: boolean; date: string };
export type CardFact = { value: number; normal: number | null; status: Status; date: string; simulated: boolean };
export type EventFact = {
  date: string;
  kind: HazardKind;
  source: 'eonet' | 'ungrd' | 'community';
  verified: boolean;
  place: string | null;
  lat: number;
  lon: number;
  distanceKm: number;
};
export type TerrainFact = {
  place: string;
  level: Level | null;
  score: number | null;
  top: Hazard | null;
  topLevel: Level | null;
  confidence: Confidence;
  synthetic: boolean;
  /** % de tierra sana al inicio y al final (0–100). */
  healthy0: number;
  healthy1: number;
  periods: [string, string];
};
export type MarketFact = {
  asOf: string;
  nearestMarket: string | null;
  products: {
    product: ProductId;
    priceCopKg: number;
    change12mPct: number | null;
    outlook: 'favorable' | 'neutral' | 'unfavorable' | null;
  }[];
};

export type Facts = {
  lat: number;
  lon: number;
  place: string;
  today: string;
  colombia: { code: string; mpio: string; dept: string } | null;
  rain: RainFacts | null;
  heat: HeatFacts | null;
  soil: CardFact | null;
  ndvi: CardFact | null;
  et: CardFact | null;
  groundwater: CardFact | null;
  slope: CardFact | null;
  events: { nearby: EventFact[]; ungrd: { total: number; from: number; to: number; topKind: HazardKind | null } | null } | null;
  terrain: TerrainFact | null;
  market: MarketFact | null;
  /** Fincas de la zona que publicaron su cosecha en la app. */
  listings: number;
};

const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Lluvia y calor de NASA POWER (mismo cálculo que la tarjeta de región). */
export function powerFacts(power: PowerRecent | null, month: number): { rain: RainFacts | null; heat: HeatFacts | null } {
  if (!power) return { rain: null, heat: null };
  const valid = power.days.filter((d) => d.precip != null);
  let rain: RainFacts | null = null;
  if (valid.length >= 20) {
    const last30 = valid.slice(-30);
    const r30 = sum(last30.map((d) => d.precip!));
    const normal30 = (power.climPrecipMmDay[month] ?? 0) * last30.length;
    rain = {
      last7: round(sum(last30.slice(-7).map((d) => d.precip!))),
      last30: round(r30),
      normal30: round(normal30),
      pct: normal30 > 0 ? round(((r30 - normal30) / normal30) * 100) : 0,
      date: last30.at(-1)!.date,
      simulated: false,
    };
  }
  const tdays = power.days.filter((d) => d.tmax != null && d.tmin != null).slice(-30);
  let heat: HeatFacts | null = null;
  if (tdays.length >= 20) {
    const minT7 = Math.min(...tdays.slice(-7).map((d) => d.tmin!));
    heat = {
      maxT: round(Math.max(...tdays.map((d) => d.tmax!))),
      hotDays: tdays.filter((d) => d.tmax! > 35).length,
      minT7: round(minT7),
      frost: minT7 <= 2,
      date: tdays.at(-1)!.date,
    };
  }
  return { rain, heat };
}

function cardFact(c: RegionSensorCard | undefined): CardFact | null {
  if (!c || c.value == null) return null;
  return {
    value: c.value,
    normal: c.comparison?.value ?? null,
    status: c.status,
    date: c.date,
    simulated: Boolean(c.simulated),
  };
}

// ---------------------------------------------------------------- terreno (Colombia)

let terrainIndex: Promise<TerrainIndex | null> | null = null;
function loadTerrainIndex() {
  // El índice viaja con la función (import estático del JSON): no depende de leer `public/` del disco.
  terrainIndex ??= import('../../../public/geo/terrain-co.json')
    .then((m) => TerrainIndex.parse((m as { default?: unknown }).default ?? m))
    .catch(() => null);
  return terrainIndex;
}

async function terrainFact(code: string, place: string): Promise<TerrainFact | null> {
  const index = await loadTerrainIndex();
  const item = index?.items[code] ?? index?.items[code.slice(0, 2)];
  if (!index || !item) return null;
  const synthetic = index.source === 'synthetic';
  const r = scoreTerrain(item, { synthetic });
  return {
    place,
    level: r.all.level,
    score: r.all.score,
    top: r.all.top,
    topLevel: r.all.top ? r.hazards[r.all.top].level : null,
    confidence: r.confidence,
    synthetic,
    healthy0: round((item.p0[0] ?? 0) / 10),
    healthy1: round((item.p1[0] ?? 0) / 10),
    periods: [index.periods.initial.label, index.periods.final.label],
  };
}

// ---------------------------------------------------------------- todo junto

export type FactsQuery = { lat: number; lon: number; name?: string | null; locale: Loc; now?: Date };

async function collect(q: FactsQuery): Promise<Facts> {
  const { lat, lon, locale } = q;
  const now = q.now ?? new Date();
  const mpio = nearestMunicipio(lat, lon, 40);
  const colombia = mpio ? { code: mpio.code, mpio: mpio.name, dept: mpio.dept } : null;
  const place = q.name?.trim() || (colombia ? `${colombia.mpio}, ${colombia.dept}` : `${round(lat, 2)}, ${round(lon, 2)}`);
  const w = eventWindow(null, now);
  const d = 0.55;

  // Topes cortos: la radio espera al programa unos 9 s (con la identificación sonando). Lo que llegue tarde
  // queda en la caché de cada fuente para la próxima vez.
  const [power, history, terrain, market, shop] = await Promise.all([
    withTimeout(powerRecent(lat, lon), 6000),
    withTimeout(eventHistory(lat, lon, w.from, w.to), 6000),
    colombia ? withTimeout(terrainFact(colombia.code, `${colombia.mpio}, ${colombia.dept}`), 3000) : null,
    colombia ? withTimeout(marketForPoint({ lat, lon, locale, maxProducts: 4 }), 4000) : null,
    colombia ? withTimeout(listListings({ bbox: [lon - d, lat - d, lon + d, lat + d], limit: 20 }), 3000) : null,
  ]);

  const region = buildMockRegion({ lat, lon, name: place, locale, now }, power);
  const byId = new Map(region.cards.map((c) => [c.id, c]));
  const { rain: realRain, heat } = powerFacts(power, now.getUTCMonth());
  const rainCard = byId.get('rain');
  // Sin POWER, la tarjeta de lluvia es de demostración: se dice así.
  const rain: RainFacts | null =
    realRain ??
    (rainCard && rainCard.value != null && rainCard.comparison?.value != null
      ? {
          last7: rainCard.value,
          last30: rainCard.comparison.value,
          // "30 días (normal 180 mm)": lo normal solo viene en el texto de la comparación.
          normal30: Number(/normal (\d+)/.exec(rainCard.comparison.label)?.[1] ?? rainCard.comparison.value),
          pct: 0,
          date: rainCard.date,
          simulated: true,
        }
      : null);
  if (rain?.simulated && rain.normal30 > 0) rain.pct = round(((rain.last30 - rain.normal30) / rain.normal30) * 100);

  const here = { lat, lng: lon };
  const nearby: EventFact[] = (history?.nearby ?? []).map((e) => ({
    date: e.date,
    kind: e.kind,
    source: e.source,
    verified: e.verified,
    place: e.place,
    lat: e.lat,
    lon: e.lon,
    distanceKm: round(haversineKm(here, { lat: e.lat, lng: e.lon })),
  }));
  const topKind = history?.byKind.length ? [...history.byKind].sort((a, b) => b.count - a.count)[0]!.kind : null;
  const ungrd = history?.place && history.total > 0 ? { total: history.total, from: history.years.from, to: history.years.to, topKind } : null;

  return {
    lat,
    lon,
    place,
    today: now.toISOString().slice(0, 10),
    colombia,
    rain,
    heat,
    soil: cardFact(byId.get('soil-moisture')),
    ndvi: cardFact(byId.get('ndvi')),
    et: cardFact(byId.get('et')),
    groundwater: cardFact(byId.get('groundwater')),
    slope: cardFact(byId.get('relief')),
    events: history ? { nearby, ungrd } : null,
    terrain,
    market: market
      ? {
          asOf: market.asOf,
          nearestMarket: market.nearestMarket ? market.nearestMarket.city || market.nearestMarket.name : null,
          products: market.products
            .filter((p) => p.priceCopKg != null)
            .slice(0, 3)
            .map((p) => ({ product: p.product, priceCopKg: Math.round(p.priceCopKg!), change12mPct: p.change12mPct == null ? null : round(p.change12mPct), outlook: p.outlook?.label ?? null })),
        }
      : null,
    listings: shop?.listings.filter((l) => !l.sample).length ?? 0,
  };
}

/** Datos de un punto, guardados 10 minutos (el programa con IA y el de plantillas comparten la misma consulta). */
export function gatherFacts(q: FactsQuery): Promise<Facts> {
  const key = `radio:facts:${q.lat.toFixed(2)},${q.lon.toFixed(2)}:${q.locale}:${q.name ?? ''}:${(q.now ?? new Date()).toISOString().slice(0, 13)}`;
  return memo(key, 10 * 60_000, () => collect(q));
}
