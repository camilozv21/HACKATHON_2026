/**
 * Contrato de `GET /api/market?lat&lon&locale&products` (mercado de Colombia de la zona de un punto).
 * zod completo: solo para chunks diferidos (drawer de región, publicar finca).
 */
import { z } from 'zod';
import { Confidence, Level } from './contract';

const Trend = z.enum(['up', 'flat', 'down']);

export const ProductMarket = z.object({
  product: z.string(),
  market: z.object({ id: z.string(), name: z.string(), city: z.string(), distanceKm: z.number().nullable() }).nullable(),
  article: z.string().nullable(),
  priceCopKg: z.number().nullable(),
  lastPriceCopKg: z.number().nullable(),
  lastMonth: z.string().nullable(),
  nationalPriceCopKg: z.number().nullable(),
  change12mPct: z.number().nullable(),
  cv: z.number().nullable(),
  volatility: Level.nullable(),
  supplyChangePct: z.number().nullable(),
  supplyTrend: Trend.nullable(),
  yieldTHa: z.number().nullable(),
  yieldScope: z.enum(['dept', 'national']).nullable(),
  yieldYear: z.number().nullable(),
  nationalYieldTHa: z.number().nullable(),
  areaHa: z.number().nullable(),
  areaTrendPct: z.number().nullable(),
  revenueCopHa: z.number().nullable(),
  credit: z.object({ chain: z.string(), n: z.number(), small: z.number(), cop: z.number(), from: z.string(), to: z.string() }).nullable(),
  monthsToFirstHarvest: z.number().nullable(),
  perennial: z.boolean(),
  perishable: z.boolean(),
  outlook: z
    .object({ label: z.enum(['favorable', 'neutral', 'unfavorable']), why: z.string(), by: z.enum(['claude', 'rules']), confidence: Confidence })
    .nullable(),
});
export type ProductMarket = z.infer<typeof ProductMarket>;

export const MarketArea = z.object({
  deptCode: z.string(),
  deptName: z.string(),
  mpioCode: z.string(),
  place: z.string(),
  nearestMarket: z.object({ name: z.string(), city: z.string(), distanceKm: z.number() }).nullable(),
  trm: z.object({ value: z.number(), date: z.string(), change12mPct: z.number().nullable() }).nullable(),
  inputs: z
    .object({
      month: z.string(),
      total: z.number(),
      fertilizers: z.number(),
      change12mPct: z.number().nullable(),
      fertChange12mPct: z.number().nullable(),
    })
    .nullable(),
  asOf: z.string(),
  source: z.enum(['db', 'seed']),
  products: z.array(ProductMarket),
  headline: z.string().nullable(),
  outlookBy: z.enum(['claude', 'rules']).nullable(),
  outlookAt: z.string().nullable(),
});
export type MarketArea = z.infer<typeof MarketArea>;

/** `{ market: null }` fuera de Colombia. */
export const MarketResponse = z.object({ market: MarketArea.nullable() });
export type MarketResponse = z.infer<typeof MarketResponse>;

export function marketUrl(lat: number, lon: number, locale: string, products: string[] = []) {
  const p = new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3), locale });
  if (products.length) p.set('products', products.join(','));
  return `/api/market?${p}`;
}
