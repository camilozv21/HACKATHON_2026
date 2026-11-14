/**
 * Indicadores de mercado por producto para un punto de Colombia, a partir de las instantáneas (pipeline/types.ts).
 * Funciones puras y deterministas: las cifras nunca salen de la IA.
 *
 * - Precio de referencia: MEDIANA de los últimos 12 meses en la central SIPSA más cercana que lo publica
 *   (no el último mes: perseguir un pico de precio lleva a que todos siembren lo mismo y el precio caiga).
 * - Tendencia: promedio de los últimos 3 meses frente a los mismos 3 meses del año anterior.
 * - Volatilidad: coeficiente de variación de los últimos 12 meses (baja < 12 %, media < 25 %, alta).
 * - Oferta: toneladas que llegaron a esa central en los últimos 3 meses frente al año anterior.
 * - Rendimiento: EVA del departamento (último año); si hay menos de 50 ha cosechadas, el nacional.
 * - Ingreso bruto aproximado por hectárea y cosecha = precio mayorista × rendimiento. NO es el margen: no
 *   descuenta costos (no hay costos por hectárea publicados en formato abierto) y el precio en finca es menor.
 */
import { haversineKm } from '@/lib/geo';
import { PRODUCT_META, type ProductId } from '@/lib/market/catalog';
import { addMonths, monthDiff } from './pipeline/snapshot';
import type { CentralSnapshot, CreditStats, DeptSnapshot, MonthSeries, NationalSnapshot } from './pipeline/types';

export type Trend = 'up' | 'flat' | 'down';
export type Level3 = 'low' | 'medium' | 'high';

export type ProductIndicators = {
  product: ProductId;
  /** Central SIPSA de referencia (la más cercana con precio de este producto). */
  market: { id: string; name: string; city: string; distanceKm: number | null } | null;
  article: string | null;
  priceCopKg: number | null;
  lastPriceCopKg: number | null;
  lastMonth: string | null;
  nationalPriceCopKg: number | null;
  change12mPct: number | null;
  cv: number | null;
  volatility: Level3 | null;
  supplyChangePct: number | null;
  supplyTrend: Trend | null;
  yieldTHa: number | null;
  yieldScope: 'dept' | 'national' | null;
  yieldYear: number | null;
  nationalYieldTHa: number | null;
  areaHa: number | null;
  areaTrendPct: number | null;
  revenueCopHa: number | null;
  credit: CreditStats | null;
  monthsToFirstHarvest: number | null;
  perennial: boolean;
  perishable: boolean;
};

const MAX_MARKET_KM = 650;

// ---------------------------------------------------------------- series

/** Valores no nulos de los últimos `n` meses de la serie. */
export function lastValues(s: MonthSeries, n: number): number[] {
  return s.v.slice(-n).filter((x): x is number => x !== null);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Cambio (%) de los últimos `k` meses frente a los mismos meses de un año antes. */
export function yoyChangePct(s: MonthSeries, k = 3): number | null {
  const n = s.v.length;
  if (n < 12 + k) return null;
  const recent = s.v.slice(n - k).filter((x): x is number => x !== null);
  const before = s.v.slice(n - 12 - k, n - 12).filter((x): x is number => x !== null);
  if (recent.length < Math.ceil(k / 2) || before.length < Math.ceil(k / 2)) return null;
  const a = mean(recent)!;
  const b = mean(before)!;
  return b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null;
}

export function coefficientOfVariation(xs: number[]): number | null {
  if (xs.length < 6) return null;
  const m = mean(xs)!;
  if (m <= 0) return null;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
  return Math.round((sd / m) * 1000) / 1000;
}

export const volatilityOf = (cv: number | null): Level3 | null => (cv === null ? null : cv < 0.12 ? 'low' : cv < 0.25 ? 'medium' : 'high');

export const trendOf = (pct: number | null, band = 10): Trend | null => (pct === null ? null : pct > band ? 'up' : pct < -band ? 'down' : 'flat');

/** Último mes con dato (YYYY-MM) y su valor. */
export function lastPoint(s: MonthSeries): { month: string; value: number } | null {
  for (let i = s.v.length - 1; i >= 0; i--) {
    const v = s.v[i];
    if (v !== null && v !== undefined) return { month: addMonths(s.from, i), value: v };
  }
  return null;
}

// ---------------------------------------------------------------- centrales

export function nearestCentrals(centrals: CentralSnapshot[], lat: number, lon: number) {
  return centrals
    .filter((c) => c.lat !== null && c.lon !== null)
    .map((c) => ({ c, km: haversineKm({ lat, lng: lon }, { lat: c.lat!, lng: c.lon! }) }))
    .sort((a, b) => a.km - b.km);
}

/** Mediana nacional del precio: la mediana de las medianas de 12 meses de cada central. */
export function nationalPrice(centrals: CentralSnapshot[], product: ProductId): number | null {
  const meds = centrals.map((c) => c.prices[product]).flatMap((s) => (s ? [median(lastValues(s, 12))] : [])).filter((x): x is number => x !== null);
  return median(meds);
}

// ---------------------------------------------------------------- indicadores por producto

export type MarketData = {
  centrals: CentralSnapshot[];
  dept: DeptSnapshot | null;
  national: NationalSnapshot;
};

export function productIndicators(data: MarketData, product: ProductId, lat: number, lon: number): ProductIndicators {
  const meta = PRODUCT_META[product];
  const near = nearestCentrals(data.centrals, lat, lon);
  const hit = near.find(({ c, km }) => c.prices[product] && km <= MAX_MARKET_KM);
  const series = hit?.c.prices[product] ?? null;
  const recent = series ? lastValues(series, 12) : [];
  const priceCopKg = recent.length >= 6 ? Math.round(median(recent)!) : null;
  const last = series ? lastPoint(series) : null;
  const cv = coefficientOfVariation(recent);
  const supply = hit?.c.supply?.[product];
  const supplyChangePct = supply ? yoyChangePct(supply, 3) : null;

  // Rendimiento: el del departamento si hay suficiente área; si no, el nacional.
  const evaRows = data.dept?.eva[product] ?? [];
  const lastEva = [...evaRows].reverse().find((r) => r[2] > 0);
  const deptYield = lastEva && lastEva[2] >= 50 ? Math.round((lastEva[3] / lastEva[2]) * 100) / 100 : null;
  const nat = data.national.evaYield[product] ?? null;
  const yieldTHa = deptYield ?? nat?.yieldTHa ?? null;
  const lastSown = evaRows.at(-1);
  const prevSown = evaRows.length >= 3 ? evaRows.at(-3) : evaRows.at(0);
  const areaTrendPct =
    lastSown && prevSown && prevSown !== lastSown && prevSown[1] >= 50 ? Math.round(((lastSown[1] - prevSown[1]) / prevSown[1]) * 1000) / 10 : null;

  return {
    product,
    market: hit ? { id: hit.c.id, name: hit.c.name, city: hit.c.city, distanceKm: Math.round(hit.km) } : null,
    article: series?.article ?? null,
    priceCopKg,
    lastPriceCopKg: last ? Math.round(last.value) : null,
    lastMonth: last?.month ?? null,
    nationalPriceCopKg: (() => {
      const p = nationalPrice(data.centrals, product);
      return p === null ? null : Math.round(p);
    })(),
    change12mPct: series ? yoyChangePct(series, 3) : null,
    cv,
    volatility: volatilityOf(cv),
    supplyChangePct,
    supplyTrend: trendOf(supplyChangePct),
    yieldTHa,
    yieldScope: deptYield !== null ? 'dept' : nat ? 'national' : null,
    yieldYear: deptYield !== null ? lastEva![0] : (nat?.year ?? null),
    nationalYieldTHa: nat?.yieldTHa ?? null,
    areaHa: lastSown ? lastSown[1] : null,
    areaTrendPct,
    revenueCopHa: priceCopKg !== null && yieldTHa !== null ? Math.round((priceCopKg * yieldTHa * 1000) / 10_000) * 10_000 : null,
    credit: data.dept?.credit?.[product] ?? null,
    monthsToFirstHarvest: meta.monthsToFirstHarvest ?? null,
    perennial: Boolean(meta.perennial),
    perishable: Boolean(meta.perishable),
  };
}

/** Productos que más se siembran en el departamento (por área del último año de EVA). */
export function topDeptProducts(dept: DeptSnapshot | null, n = 6): ProductId[] {
  if (!dept) return [];
  return (Object.entries(dept.eva) as [ProductId, NonNullable<DeptSnapshot['eva'][ProductId]>][])
    .map(([p, rows]) => ({ p, area: rows.at(-1)?.[1] ?? 0 }))
    .filter((x) => x.area > 0)
    .sort((a, b) => b.area - a.area)
    .slice(0, n)
    .map((x) => x.p);
}

/** Meses entre el último dato de precios y `now` (para avisar si el dato está viejo). */
export const staleMonths = (asOf: string, now = new Date()) => monthDiff(asOf.slice(0, 7), now.toISOString().slice(0, 7));
