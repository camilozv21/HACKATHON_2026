import { describe, expect, it } from 'vitest';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';
import { toFieldInput } from '@/features/field/toFieldInput';
import { DEFAULT_PRIORITIES, type CropSeason } from '@/lib/api/contract';
import { OutlookRequest, OutlookResponse, type Household, type Pace } from '@/lib/api/outlook';
import { buildMockAnalysis } from '@/mocks/analysis';
import { averageRow, cashCalendar, foodCalendar, LABOR_DAYS, laborRows } from './calendar';
import { buildMockOutlook } from './index';
import { REFERENCES } from './references';

const S = (
  crop: CropSeason['crop'],
  startMonth: number,
  endMonth: number,
  extra: Partial<CropSeason> = {},
): CropSeason => ({
  crop,
  startMonth,
  endMonth,
  year: 1,
  role: 'cash',
  ...extra,
});

function outlookFor(
  demoId: string,
  opts: { household?: Household; pace?: Pace; locale?: 'es' | 'en'; region?: 'co' | 'global' } = {},
) {
  const demo = DEMO_FARMS.find((d) => d.id === demoId)!;
  const field = toFieldInput(demoField(demo, 'es'));
  const analysis = buildMockAnalysis({ field, priorities: DEFAULT_PRIORITIES, locale: opts.locale ?? 'es' });
  const req = OutlookRequest.parse({
    field: analysis.field,
    priorities: DEFAULT_PRIORITIES,
    locale: opts.locale ?? 'es',
    strategies: analysis.strategies.map(
      ({ id, name, isCurrent, durationMonths, seasons, scores, confidence }) => ({
        id,
        name,
        isCurrent,
        durationMonths,
        seasons,
        scores,
        confidence,
      }),
    ),
    site: {
      annualPrecipMm: analysis.climate.summary.annualPrecipMm,
      tMeanC: analysis.climate.months.reduce((a, m) => a + (m.tMean.value ?? 0), 0) / 12,
      elevationM: analysis.climate.location.elevationM,
      slopePct: analysis.insights.erosionRisk.slopePct,
      erosionLevel: analysis.insights.erosionRisk.level,
    },
    household: opts.household,
    pace: opts.pace ?? 'all',
  });
  const region = opts.region ?? (demoId === 'cafe-quindio' ? 'co' : 'global');
  const res = buildMockOutlook(req, { region, placeName: region === 'co' ? 'Montenegro, Quindío' : null });
  const currentId = analysis.strategies.find((s) => s.isCurrent)!.id;
  const current = res.strategies.find((s) => s.strategyId === currentId)!;
  const others = res.strategies.filter((s) => s.strategyId !== currentId);
  const scoreOf = (id: string) => analysis.strategies.find((s) => s.id === id)!.scores;
  return { analysis, res, current, others, scoreOf };
}

describe('contrato de /rotations/outlook', () => {
  it.each(DEMO_FARMS.map((d) => d.id))(
    '%s: cumple el contrato, 10 años por opción y cada cita está en las fuentes',
    (id) => {
      const { res, analysis } = outlookFor(id);
      expect(OutlookResponse.safeParse(res).success).toBe(true);
      expect(res.strategies).toHaveLength(analysis.strategies.length);
      const refs = new Set(res.references.map((r) => r.id));
      for (const o of res.strategies) {
        expect(o.years).toHaveLength(10);
        for (const id of [...o.milestones.flatMap((m) => m.refIds), ...o.social.flatMap((f) => f.refIds)])
          expect(refs).toContain(id);
      }
      for (const f of res.context.facts) for (const r of f.refIds) expect(refs).toContain(r);
      for (const r of res.references) expect(Object.keys(REFERENCES)).toContain(r.id);
    },
  );

  it('las fuentes del catálogo tienen URL https y texto en los dos idiomas', () => {
    for (const r of Object.values(REFERENCES)) {
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.finding.es.length).toBeGreaterThan(20);
      expect(r.finding.en.length).toBeGreaterThan(20);
    }
  });

  it('en inglés los textos generados vienen en inglés', () => {
    const { res } = outlookFor('cornbelt-iowa', { locale: 'en' });
    expect(res.disclaimer).toMatch(/^This is a projection/);
    expect(res.strategies.flatMap((s) => s.social).every((f) => !/[áéíóúñ¿]/.test(f.title))).toBe(true);
  });
});

describe('la rotación en el tiempo', () => {
  it('lo de hoy no tiene transición ni bache: siempre estable y "recupera" en el año 1', () => {
    for (const d of DEMO_FARMS) {
      const { current } = outlookFor(d.id);
      expect(current.years.every((y) => y.phase === 'stable' && y.adopted === 0)).toBe(true);
      expect(current.breakEvenYear).toBe(1);
    }
  });

  it('toda opción nueva empieza en transición y termina estable dentro de 10 años', () => {
    for (const d of DEMO_FARMS) {
      for (const o of outlookFor(d.id).others) {
        expect(o.years[0]!.phase).toBe('transition');
        expect(o.years.at(-1)!.phase).toBe('stable');
      }
    }
  });

  it('más materia orgánica en el puntaje → más materia orgánica a los 10 años, pero despacio (< 15 % de cambio)', () => {
    for (const d of DEMO_FARMS) {
      const { current, others, scoreOf, res } = outlookFor(d.id);
      const cur = scoreOf(current.strategyId);
      for (const o of others) {
        const s = scoreOf(o.strategyId);
        const end = o.years.at(-1)!.soilOrganicMatterPct.mid;
        const curEnd = current.years.at(-1)!.soilOrganicMatterPct.mid;
        if (s.soilOrganicMatter > cur.soilOrganicMatter + 5) expect(end).toBeGreaterThan(curEnd);
        expect(
          Math.abs(end - res.baseline.soilOrganicMatterPct) / res.baseline.soilOrganicMatterPct,
        ).toBeLessThan(0.15);
      }
    }
  });

  it('más freno a la erosión → menos suelo perdido en 10 años', () => {
    for (const d of DEMO_FARMS) {
      const { current, others, scoreOf } = outlookFor(d.id);
      for (const o of others) {
        if (scoreOf(o.strategyId).erosion > scoreOf(current.strategyId).erosion + 5) {
          expect(o.years.at(-1)!.soilLostMm).toBeLessThan(current.years.at(-1)!.soilLostMm);
        }
      }
    }
  });

  it('el suelo perdido se acumula: nunca baja de un año al siguiente', () => {
    for (const o of outlookFor('cafe-quindio').res.strategies) {
      for (let i = 1; i < o.years.length; i++)
        expect(o.years[i]!.soilLostMm).toBeGreaterThanOrEqual(o.years[i - 1]!.soilLostMm);
    }
  });

  it('cambiar poco a poco suaviza el bache del primer año y adopta ¼ → ½ → todo', () => {
    const all = outlookFor('cornbelt-iowa', { pace: 'all' });
    const gradual = outlookFor('cornbelt-iowa', { pace: 'gradual' });
    for (const o of all.others) {
      const g = gradual.others.find((x) => x.strategyId === o.strategyId)!;
      expect(g.years.slice(0, 3).map((y) => y.adopted)).toEqual([0.25, 0.5, 1]);
      const dipAll = 100 - o.years[0]!.incomeIndex.mid;
      const dipGradual = 100 - g.years[0]!.incomeIndex.mid;
      if (dipAll > 0) expect(dipGradual).toBeLessThan(dipAll);
    }
  });

  it('el rango de años buenos y malos rodea al año normal', () => {
    for (const o of outlookFor('sahel-maradi').res.strategies) {
      for (const y of o.years) {
        expect(y.incomeIndex.low).toBeLessThanOrEqual(y.incomeIndex.mid);
        expect(y.incomeIndex.high).toBeGreaterThanOrEqual(y.incomeIndex.mid);
      }
    }
  });
});

describe('contexto social', () => {
  it('menos personas en la familia → más jornales para contratar', () => {
    const one = outlookFor('cafe-quindio', { household: { workers: 1, tenure: null, association: null } });
    const five = outlookFor('cafe-quindio', { household: { workers: 5, tenure: null, association: null } });
    expect(one.current.labor.hiredDaysYear).toBeGreaterThan(five.current.labor.hiredDaysYear);
    expect(one.res.baseline.workersAssumed).toBe(false);
  });

  it('tierra arrendada: las opciones que tardan en pagarse llevan un aviso; tierra propia, a favor', () => {
    const rent = outlookFor('cafe-quindio', { household: { workers: 2, tenure: 'rent', association: null } });
    const own = outlookFor('cafe-quindio', { household: { workers: 2, tenure: 'own', association: null } });
    for (const o of rent.others)
      expect(['watch', 'alert']).toContain(o.social.find((f) => f.kind === 'tenure')!.status);
    for (const o of own.others) expect(o.social.find((f) => f.kind === 'tenure')!.status).toBe('good');
  });

  it('sin respuestas de la familia, lo dice en los supuestos', () => {
    const { res } = outlookFor('pampa-pergamino');
    expect(res.baseline.workersAssumed).toBe(true);
    expect(res.assumptions.some((a) => a.includes('2 personas'))).toBe(true);
  });

  it('en Colombia suma el contexto del país (DANE, ACFC); fuera, solo el contexto mundial', () => {
    const co = outlookFor('cafe-quindio', { region: 'co' }).res;
    const world = outlookFor('cafe-quindio', { region: 'global' }).res;
    expect(co.context.facts.map((f) => f.id)).toContain('co-smallholders');
    expect(co.references.map((r) => r.id)).toContain('dane-cna-2014');
    expect(world.context.facts.map((f) => f.id)).not.toContain('co-smallholders');
    expect(world.references.map((r) => r.id)).not.toContain('dane-cna-2014');
  });
});

describe('calendario: jornales, comida y ventas', () => {
  it('un ciclo de maíz reparte sus jornales: siembra, deshierbe y sobre todo la cosecha', () => {
    const row = averageRow(laborRows([S('maize', 5, 10)], 1, false));
    expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(LABOR_DAYS.maize, 5);
    expect(row[9]).toBeGreaterThan(row[4]!); // cosecha (oct) > siembra (may)
    expect(row[0]).toBe(0);
  });

  it('con tractor, los granos piden mucho menos trabajo a mano', () => {
    const hand = laborRows([S('maize', 5, 10)], 1, false)[0]!.reduce((a, b) => a + b, 0);
    const tractor = laborRows([S('maize', 5, 10)], 1, true)[0]!.reduce((a, b) => a + b, 0);
    expect(tractor).toBeLessThan(hand * 0.5);
  });

  it('café: 150 jornales al año con picos en la cosecha (oct–dic)', () => {
    const row = laborRows([S('coffee', 1, 12, { role: 'perennial' })], 1, false)[0]!;
    expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(150, 5);
    expect(row[10]).toBeGreaterThan(row[1]! * 2);
  });

  it('el trigo de invierno que cruza el año cae en los dos años de la rotación', () => {
    const rows = laborRows([S('wheat', 10, 7)], 2, false);
    expect(rows[0]![9]).toBeGreaterThan(0); // siembra en oct del año 1
    expect(rows[1]![6]).toBeGreaterThan(0); // cosecha en jul del año 2
  });

  it('el grano seco guardado alcanza ~6 meses; el café no es comida para la casa pero sí venta', () => {
    expect(foodCalendar([S('maize', 5, 10)]).months.filter(Boolean)).toHaveLength(6);
    expect(foodCalendar([S('coffee', 1, 12, { role: 'perennial' })]).months.some(Boolean)).toBe(false);
    expect(
      cashCalendar([S('coffee', 1, 12, { role: 'perennial' })], []).months.filter(Boolean).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it('más cultivos de comida y de familias distintas → menos meses sin comida', () => {
    const mono = foodCalendar([S('maize', 5, 10)]);
    const milpa = foodCalendar([
      S('maize', 3, 7),
      S('beans', 3, 6, { role: 'intercrop' }),
      S('cassava', 3, 12, { role: 'intercrop' }),
    ]);
    expect(milpa.gapMonths.length).toBeLessThan(mono.gapMonths.length);
    expect(milpa.families).toBeGreaterThan(mono.families);
  });
});
