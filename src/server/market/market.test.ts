import { beforeAll, describe, expect, it } from 'vitest';
import { CROP_PRODUCT, PRODUCT_IDS } from '@/lib/market/catalog';
import { MarketArea } from '@/lib/api/market';
import { coefficientOfVariation, median, productIndicators, volatilityOf, yoyChangePct } from './indicators';
import { marketForPoint } from './index';
import { mergeClaudeOutput } from './outlook';
import { evaProduct, finagroProducts, sipsaPriceProduct, sipsaSupplyProduct } from './pipeline/mapping';
import { createXmlRecordStream, sipsaNum } from './pipeline/sipsa';
import { addMonths, buildCredit, buildEva, centralLocation, createPriceAggregator, monthDiff, type Municipios } from './pipeline/snapshot';
import type { CentralSnapshot, DeptSnapshot } from './pipeline/types';
import { ruleLabel, rulesOutlook } from './rules';

beforeAll(() => {
  // Las pruebas usan el seed comiteado, nunca la base de datos.
  process.env.DATABASE_URL = '';
});

const rec = (r: Record<string, string>) => `<return>${Object.entries(r).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</return>`;

describe('SIPSA: parser en streaming', () => {
  const xml =
    `<?xml version='1.0'?><S:Envelope><S:Body><ns2:x>` +
    rec({ artiNombre: 'Tomate chonto', fuenNombre: 'Bogotá, D.C., Corabastos', fechaMesIni: '2026-10-01T00:00:00-05:00', promedioKg: '3818' }) +
    rec({ artiNombre: 'Pl&#225;tano hart&#243;n verde', fuenNombre: 'Armenia, Mercar', fechaMesIni: '2026-09-01T00:00:00-05:00', promedioKg: '1631' }) +
    rec({ artiNombre: 'Fr&amp;jol', fuenNombre: 'Cali, Cavasa', fechaMesIni: '2026-09-01T00:00:00-05:00', promedioKg: '9000,5' }) +
    `</ns2:x></S:Body></S:Envelope>`;

  it('da los mismos registros sin importar cómo llegan los pedazos de la red', () => {
    const whole: Record<string, string>[] = [];
    const p = createXmlRecordStream('return', (r) => whole.push(r));
    p.push(xml);
    expect(p.end()).toBe(3);
    for (let seed = 1; seed <= 25; seed++) {
      const got: Record<string, string>[] = [];
      const q = createXmlRecordStream('return', (r) => got.push(r));
      let i = 0;
      let s = seed;
      while (i < xml.length) {
        s = (s * 9301 + 49297) % 233280;
        const n = 1 + (s % 37);
        q.push(xml.slice(i, i + n));
        i += n;
      }
      q.end();
      expect(got).toEqual(whole);
    }
    expect(whole[1]!.artiNombre).toBe('Plátano hartón verde');
    expect(whole[2]!.artiNombre).toBe('Fr&jol');
  });

  it('números con punto o coma decimal', () => {
    expect(sipsaNum('3818')).toBe(3818);
    expect(sipsaNum('2850.5')).toBe(2850.5);
    expect(sipsaNum('9000,5')).toBe(9000.5);
    expect(sipsaNum('1.234,5')).toBe(1234.5);
    expect(Number.isNaN(sipsaNum(''))).toBe(true);
  });
});

describe('cruce de nombres', () => {
  it('SIPSA → producto (precio y abastecimiento)', () => {
    expect(sipsaPriceProduct('Plátano hartón verde')).toEqual({ product: 'platano', rank: 0 });
    expect(sipsaPriceProduct('Papa criolla limpia')?.product).toBe('papa-criolla');
    expect(sipsaPriceProduct('Plátano hartón verde ecuatoriano')).toBeNull();
    expect(sipsaSupplyProduct('Papa criolla sucia')).toBe('papa-criolla');
    expect(sipsaSupplyProduct('Papa parda pastusa')).toBe('papa');
    expect(sipsaSupplyProduct('Arveja verde seca importada')).toBeNull();
  });

  it('EVA y Finagro → producto', () => {
    expect(evaProduct('Café', 'Café')).toBe('cafe');
    expect(evaProduct('Caña', 'Caña panelera')).toBe('panela');
    expect(evaProduct('Caña', 'Caña de azúcar')).toBeNull();
    expect(evaProduct('Cebolla de bulbo')).toBe('cebolla-cabezona');
    expect(finagroProducts('Citricos')).toEqual(['naranja', 'limon', 'mandarina']);
    expect(finagroProducts('Ganado DP')).toEqual([]);
  });

  it('central → municipio (capital si el nombre se repite)', () => {
    const m: Municipios = {
      '63001': [4.536, -75.681, 'Armenia', 'Quindío'],
      '05059': [6.155, -75.786, 'Armenia', 'Antioquia'],
      '11001': [4.649, -74.107, 'Bogotá, D.C.', 'Bogotá, D.C.'],
      '15806': [5.75, -72.97, 'Tibasosa', 'Boyacá'],
    };
    expect(centralLocation('Armenia, Mercar', m).muniCode).toBe('63001');
    expect(centralLocation('Bogotá, D.C., Corabastos', m).muniCode).toBe('11001');
    expect(centralLocation('Tibasosa (Boyacá), Coomproriente', m).muniCode).toBe('15806');
    expect(centralLocation('Ciudad inventada, X', m).lat).toBeNull();
  });
});

describe('agregación', () => {
  it('elige el artículo preferido con datos recientes y arma 24 meses', () => {
    const agg = createPriceAggregator();
    for (let i = 0; i < 12; i++) {
      const month = addMonths('2025-11', i);
      agg.add({ artiNombre: 'Tomate larga vida', fuenNombre: 'Cali, Cavasa', fechaMesIni: `${month}-01`, promedioKg: '5000' });
      agg.add({ artiNombre: 'Tomate chonto', fuenNombre: 'Cali, Cavasa', fechaMesIni: `${month}-01`, promedioKg: String(3000 + i * 10) });
    }
    const out = agg.result().get('cali-cavasa')!;
    expect(out.prices.tomate!.article).toBe('Tomate chonto');
    expect(out.prices.tomate!.v).toHaveLength(24);
    expect(out.prices.tomate!.v.at(-1)).toBe(3110);
    expect(monthDiff(out.prices.tomate!.from, '2026-10')).toBe(23);
  });

  it('EVA suma semestres y calcula el rendimiento nacional; Finagro suma por departamento', () => {
    const { depts, national } = buildEva([
      { dept: '63', deptName: 'QUINDIO', cultivo: 'Plátano', desag: 'x', year: 2025, sown: 100, harvested: 100, production: 1000 },
      { dept: '63', deptName: 'QUINDIO', cultivo: 'Plátano', desag: 'y', year: 2025, sown: 50, harvested: 50, production: 500 },
      { dept: '05', deptName: 'ANTIOQUIA', cultivo: 'Plátano', desag: 'x', year: 2025, sown: 100, harvested: 100, production: 500 },
    ]);
    expect(depts.get('63')!.eva.platano).toEqual([[2025, 150, 150, 1500]]);
    expect(depts.get('63')!.name).toBe('Quindio');
    expect(national.platano).toEqual({ year: 2025, yieldTHa: 8 });
    const credit = buildCredit([{ mpio: '63130', chain: 'Café', n: 10, small: 6, cop: 1e8 }, { mpio: '63001', chain: 'Café', n: 5, small: 1, cop: 5e7 }], '2025-05-01', '2026-06-30');
    expect(credit.get('63')!.cafe).toMatchObject({ chain: 'Café', n: 15, small: 7, cop: 150000000 });
  });
});

describe('indicadores', () => {
  it('mediana, cambio interanual, volatilidad', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const s = { from: '2025-01', v: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 120, 120, 120] };
    expect(yoyChangePct(s, 3)).toBe(20);
    expect(coefficientOfVariation([100, 100, 100, 100, 100, 100])).toBe(0);
    expect(volatilityOf(0.3)).toBe('high');
    expect(volatilityOf(0.05)).toBe('low');
  });

  it('central más cercana, precio local vs nacional, rendimiento del departamento', () => {
    const series = (base: number) => ({ from: '2024-11', v: Array.from({ length: 24 }, () => base), article: 'Plátano hartón verde' });
    const centrals: CentralSnapshot[] = [
      { id: 'a', name: 'Armenia, Mercar', city: 'Armenia', dept: 'Quindío', muniCode: '63001', lat: 4.536, lon: -75.68, prices: { platano: series(1500) } },
      { id: 'b', name: 'Bogotá, D.C., Corabastos', city: 'Bogotá', dept: 'Bogotá', muniCode: '11001', lat: 4.65, lon: -74.1, prices: { platano: series(2500) } },
    ];
    const dept: DeptSnapshot = { code: '63', name: 'Quindío', eva: { platano: [[2023, 900, 900, 9000], [2024, 950, 950, 9500], [2025, 1200, 1000, 12000]] } };
    const x = productIndicators({ centrals, dept, national: { trm: null, inputs: null, evaYield: { platano: { year: 2025, yieldTHa: 8 } } } }, 'platano', 4.53, -75.68);
    expect(x.market?.name).toBe('Armenia, Mercar');
    expect(x.priceCopKg).toBe(1500);
    expect(x.nationalPriceCopKg).toBe(2000);
    expect(x.yieldTHa).toBe(12);
    expect(x.yieldScope).toBe('dept');
    expect(x.areaTrendPct).toBe(33.3);
    expect(x.revenueCopHa).toBe(18_000_000);
  });
});

describe('mercado de un punto (seed comiteado)', () => {
  it('Quindío: central cercana, productos del departamento y cumple el contrato', async () => {
    const m = await marketForPoint({ lat: 4.53, lon: -75.68, products: ['platano', 'cafe'] });
    expect(m).not.toBeNull();
    expect(m!.deptCode).toBe('63');
    expect(m!.source).toBe('seed');
    expect(m!.nearestMarket!.distanceKm).toBeLessThan(30);
    expect(m!.products.map((p) => p.product)).toEqual(expect.arrayContaining(['platano', 'cafe']));
    const platano = m!.products.find((p) => p.product === 'platano')!;
    expect(platano.priceCopKg).toBeGreaterThan(0);
    expect(platano.outlook?.why).not.toMatch(/\d/);
    expect(MarketArea.safeParse(m).success).toBe(true);
  });

  it('fuera de Colombia no hay mercado', async () => {
    expect(await marketForPoint({ lat: 42, lon: -93.5 })).toBeNull();
  });

  it('todos los productos del motor existen en el catálogo', () => {
    for (const p of Object.values(CROP_PRODUCT)) expect(PRODUCT_IDS).toContain(p);
  });
});

describe('conclusiones', () => {
  const base = { market: null, article: null, lastPriceCopKg: null, lastMonth: null, nationalPriceCopKg: null, cv: null, supplyChangePct: null, yieldYear: null, nationalYieldTHa: null, areaHa: null, revenueCopHa: null, credit: null, monthsToFirstHarvest: null, perennial: false, perishable: false, yieldTHa: null, yieldScope: null } as const;

  it('reglas: sobreoferta con precio bajando es desfavorable; sin señales, neutral', () => {
    expect(ruleLabel({ ...base, product: 'tomate', priceCopKg: 3000, change12mPct: -20, volatility: 'high', supplyTrend: 'up', areaTrendPct: 30 })).toBe('unfavorable');
    expect(ruleLabel({ ...base, product: 'tomate', priceCopKg: 3000, change12mPct: 2, volatility: 'low', supplyTrend: 'flat', areaTrendPct: 0 })).toBe('neutral');
  });

  it('Claude: los textos con cifras y los productos que faltan se reemplazan por la regla', () => {
    const items = [
      { ...base, product: 'tomate' as const, priceCopKg: 3000, change12mPct: -20, volatility: 'high' as const, supplyTrend: 'up' as const, areaTrendPct: 30 },
      { ...base, product: 'platano' as const, priceCopKg: 1500, change12mPct: 1, volatility: 'low' as const, supplyTrend: 'flat' as const, areaTrendPct: 0 },
    ];
    const rules = rulesOutlook('63', items);
    const out = mergeClaudeOutput(
      {
        headline_es: 'Buen momento para el plátano.',
        headline_en: 'Good time for plantain.',
        crops: [
          { product: 'tomate', label: 'favorable', why_es: 'Sube 20 % el precio.', why_en: 'Price up 20%.', confidence: 'high' },
          { product: 'yuca', label: 'favorable', why_es: 'Inventado.', why_en: 'Made up.', confidence: 'high' },
        ],
      },
      '63',
      items,
    );
    expect(out.by).toBe('claude');
    expect(out.crops.map((c) => c.product)).toEqual(['tomate', 'platano']);
    expect(out.crops[0]).toEqual(rules.crops[0]);
    expect(out.crops[1]).toEqual(rules.crops[1]);
    expect(out.headline.es).toBe('Buen momento para el plátano.');
  });
});
