import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';
import { AnalysisResponse, DEFAULT_PRIORITIES } from '@/lib/api/contract';
import { CROP_PRODUCT } from '@/lib/market/catalog';
import type { ProductMarket } from '@/server/market';
import { marketForPoint } from '@/server/market';
import { buildMockAnalysis } from '@/mocks/analysis';
import { toFieldInput } from '@/features/field/toFieldInput';
import { incomeFactor, incomeFactors } from './market';

beforeAll(() => {
  process.env.DATABASE_URL = '';
});

const P = (over: Partial<ProductMarket>): ProductMarket => ({
  product: 'tomate',
  market: { id: 'x', name: 'Central', city: 'X', distanceKm: 20 },
  article: 'Tomate chonto',
  priceCopKg: 3000,
  lastPriceCopKg: 3000,
  lastMonth: '2026-10',
  nationalPriceCopKg: 3000,
  change12mPct: 0,
  cv: 0.05,
  volatility: 'low',
  supplyChangePct: 0,
  supplyTrend: 'flat',
  yieldTHa: 40,
  yieldScope: 'dept',
  yieldYear: 2025,
  nationalYieldTHa: 40,
  areaHa: 1000,
  areaTrendPct: 0,
  revenueCopHa: 120_000_000,
  credit: null,
  monthsToFirstHarvest: 4,
  perennial: false,
  perishable: true,
  outlook: null,
  ...over,
});

describe('factor de mercado del ingreso', () => {
  it('neutro cuando lo local es igual a lo nacional y estable', () => {
    expect(incomeFactor(P({}), null)).toBe(1);
  });

  it('siempre acotado entre 0,5 y 1,5', () => {
    const worst = incomeFactor(P({ priceCopKg: 100, yieldTHa: 1, change12mPct: -50, volatility: 'high', supplyTrend: 'up', areaTrendPct: 80, market: { id: 'x', name: 'X', city: 'X', distanceKm: 900 } }), 40);
    const best = incomeFactor(P({ priceCopKg: 99_000, yieldTHa: 400, change12mPct: 80 }), null);
    expect(worst).toBeGreaterThanOrEqual(0.5);
    expect(best).toBeLessThanOrEqual(1.5);
    expect(worst).toBeLessThan(1);
    expect(best).toBeGreaterThan(1);
  });

  it('sobreoferta con precio bajando castiga más que solo precio bajando', () => {
    const down = incomeFactor(P({ change12mPct: -20 }), null);
    const glut = incomeFactor(P({ change12mPct: -20, supplyTrend: 'up', areaTrendPct: 30 }), null);
    expect(glut).toBeLessThan(down);
  });

  it('si la cosecha es para la casa, el mercado pesa menos', async () => {
    const m = await marketForPoint({ lat: 4.53, lon: -75.68, products: [...new Set(Object.values(CROP_PRODUCT))], maxProducts: 16 });
    const sale = incomeFactors(m, 'sale');
    const home = incomeFactors(m, 'home');
    for (const crop of Object.keys(sale) as (keyof typeof sale)[]) {
      expect(Math.abs(home[crop]! - 1)).toBeLessThanOrEqual(Math.abs(sale[crop]! - 1) + 1e-9);
    }
    expect(incomeFactors(null, 'sale')).toEqual({});
  });
});

describe('análisis con mercado (finca demo de Quindío)', () => {
  it('sin mercado no cambia nada; con mercado suma el bloque "Mercado", evidencia SIPSA y cumple el contrato', async () => {
    const demo = DEMO_FARMS.find((d) => d.id === 'cafe-quindio')!;
    const field = toFieldInput(demoField(demo, 'es'));
    const req = { field, priorities: DEFAULT_PRIORITIES, locale: 'es' as const };
    const [lon, lat] = demo.center;
    const market = await marketForPoint({ lat, lon, products: [...new Set(Object.values(CROP_PRODUCT))], maxProducts: 16 });
    expect(market).not.toBeNull();

    const a = buildMockAnalysis(req);
    const b = buildMockAnalysis(req);
    expect(a.strategies.map((s) => s.scores)).toEqual(b.strategies.map((s) => s.scores));
    expect(a.strategies.some((s) => s.market)).toBe(false);

    const withMarket = buildMockAnalysis(req, { market });
    expect(AnalysisResponse.safeParse(withMarket).success).toBe(true);
    expect(withMarket.market?.deptCode).toBe('63');
    const current = withMarket.strategies.find((s) => s.isCurrent)!;
    expect(current.market).toBeDefined();
    expect(current.market!.crops.length).toBeGreaterThan(0);
    expect(current.evidence.some((e) => e.source === 'SIPSA' || e.source === 'EVA')).toBe(true);
    expect(current.dataGaps.join(' ')).toMatch(/SIPSA/);
  });
});
