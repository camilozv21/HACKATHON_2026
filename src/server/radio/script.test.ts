import { describe, expect, it } from 'vitest';
import { RadioSegment } from '@/lib/api/contract';
import { keepsNumbers, mergeRewrite } from './claudeScript';
import type { Facts } from './facts';
import { rulesProgram, type ScriptOpts } from './script';

const FACTS: Facts = {
  lat: 4.5,
  lon: -75.75,
  place: 'Salento, Quindío',
  today: '2026-11-15',
  colombia: { code: '63690', mpio: 'Salento', dept: 'Quindío' },
  rain: { last7: 12, last30: 98, normal30: 180, pct: -46, date: '2026-11-13', simulated: false },
  heat: { maxT: 27, hotDays: 0, minT7: 9, frost: false, date: '2026-11-13' },
  soil: { value: 22, normal: 30, status: 'alert', date: '2026-11-12', simulated: true },
  ndvi: { value: 0.62, normal: 0.7, status: 'watch', date: '2026-10-01', simulated: true },
  et: { value: 4, normal: 3, status: 'watch', date: '2026-11-12', simulated: true },
  groundwater: { value: 0.1, normal: 2, status: 'good', date: '2022-12-01', simulated: true },
  slope: { value: 28, normal: null, status: 'alert', date: '2000-02-11', simulated: true },
  events: {
    nearby: [{ date: '2026-11-03', kind: 'landslide', source: 'community', verified: false, place: 'Salento, Quindío', lat: 4.6, lon: -75.6, distanceKm: 12 }],
    ungrd: { total: 45, from: 2019, to: 2025, topKind: 'landslide' },
  },
  terrain: { place: 'Salento, Quindío', level: 'medium', score: 48, top: 'drought', topLevel: 'medium', confidence: 'high', synthetic: false, healthy0: 92, healthy1: 88, periods: ['2016–2018', '2023–2025'] },
  market: { asOf: '2026-09-30', nearestMarket: 'Armenia', products: [{ product: 'cafe', priceCopKg: 18500, change12mPct: 12, outlook: 'favorable' }] },
  listings: 2,
};

const OPTS: ScriptOpts = {
  locale: 'es',
  units: 'metric',
  mode: 'full',
  stationId: 'local:4.50,-75.75',
  stationName: 'Radio Campo Salento',
  names: { product: (id) => (id === 'cafe' ? 'Café' : id), hazard: (k) => (k === 'landslide' ? 'Deslizamiento' : k) },
  now: new Date('2026-11-15T14:00:00Z'),
};

describe('programa de plantillas', () => {
  const program = rulesProgram(FACTS, OPTS);

  it('cumple el contrato y va en el orden de los temas', () => {
    for (const s of program) expect(RadioSegment.safeParse(s).success).toBe(true);
    expect(program.map((s) => s.topic)).toEqual(['intro', 'weather', 'soil', 'vegetation', 'events', 'terrain', 'market', 'advice', 'outro']);
  });

  it('se escribe para oírse: sin símbolos ni abreviaturas de unidades', () => {
    const all = program.map((s) => s.transcript).join(' ');
    expect(all).not.toMatch(/\bmm\b|°|%/);
    expect(all).toContain('98 milímetros');
    expect(all).toContain('46 por ciento menos');
  });

  it('dice en voz alta lo que es de demostración y lo que no está verificado', () => {
    const soil = program.find((s) => s.topic === 'soil')!;
    expect(soil.simulated).toBe(true);
    expect(soil.confidence).toBe('low');
    expect(soil.transcript).toMatch(/demostración/);
    expect(program.find((s) => s.topic === 'events')!.transcript).toMatch(/no están verificados/);
  });

  it('cada bloque con datos trae su fuente, su confianza y lo que no dice', () => {
    for (const s of program.filter((x) => !['intro', 'outro'].includes(x.topic!))) {
      expect(s.sources?.length).toBeGreaterThan(0);
      expect(s.confidence).toBeDefined();
      expect(s.caveat).toBeTruthy();
    }
  });

  it('el cierre recuerda que la radio no reemplaza el criterio del agricultor', () => {
    expect(program.at(-1)!.transcript).toMatch(/no reemplaza tu criterio/);
  });

  it('mueve el globo en las frases del guion', () => {
    expect(program[0]!.cues?.[0]?.action).toMatchObject({ type: 'flyTo', lat: 4.5, lon: -75.75 });
    expect(program.find((s) => s.topic === 'terrain')!.cues?.[0]?.action).toMatchObject({ type: 'setLayer', layerId: 'risk', risk: 'drought' });
    const market = program.find((s) => s.topic === 'market')!;
    const listings = market.cues!.find((c) => c.action.type === 'showListings')!;
    expect(market.transcript.split(/(?<=[.!?])\s+/)[listings.sentence]).toMatch(/fincas de la zona/);
  });

  it('en modo sencillo es más corto, pero no esconde los riesgos', () => {
    const lite = rulesProgram(FACTS, { ...OPTS, mode: 'lite' });
    expect(lite.map((s) => s.topic)).not.toContain('market');
    expect(lite.map((s) => s.topic)).toContain('terrain');
    expect(lite.find((s) => s.topic === 'soil')!.transcript).toMatch(/demostración/);
    expect(lite.reduce((a, s) => a + s.durationSec, 0)).toBeLessThan(program.reduce((a, s) => a + s.durationSec, 0));
  });

  it('en inglés y con unidades imperiales', () => {
    const en = rulesProgram(FACTS, { ...OPTS, locale: 'en', units: 'imperial' });
    const all = en.map((s) => s.transcript).join(' ');
    expect(all).toContain('3.9 inches');
    expect(all).toMatch(/does not replace your judgement/);
  });

  it('fuera de Colombia no hay terreno, precios ni UNGRD', () => {
    const out = rulesProgram({ ...FACTS, colombia: null, terrain: null, market: null, events: null }, OPTS);
    expect(out.map((s) => s.topic)).toEqual(['intro', 'weather', 'soil', 'vegetation', 'advice', 'outro']);
  });
});

describe('reescritura con Claude', () => {
  const draft = rulesProgram(FACTS, OPTS);

  it('rechaza números que no estaban en el borrador', () => {
    expect(keepsNumbers('Llovieron 98 milímetros.', 'Cayeron 98 milímetros de agua.')).toBe(true);
    expect(keepsNumbers('Llovieron 98 milímetros.', 'Cayeron 120 milímetros.')).toBe(false);
  });

  it('cambia solo el texto y conserva datos, fuentes y pistas', () => {
    const weather = draft.find((s) => s.topic === 'weather')!;
    const { segments, replaced } = mergeRewrite(
      draft,
      [
        { topic: 'weather', title: 'Poca lluvia', script: 'Amigos, en 30 días llovieron 98 milímetros. Es 46 por ciento menos de lo normal. En la semana, 12 milímetros. Es lo medido, no un pronóstico.' },
        { topic: 'soil', title: 'Suelo', script: 'El suelo tiene 999 de humedad.' },
      ],
      { lite: false },
    );
    expect(replaced).toBe(1);
    const w = segments.find((s) => s.topic === 'weather')!;
    expect(w.title).toBe('Poca lluvia');
    expect(w.id).toBe(weather.id);
    expect(w.sources).toEqual(weather.sources);
    expect(w.confidence).toBe(weather.confidence);
    expect(w.cues?.[0]).toEqual(weather.cues?.[0]);
    // El bloque con un número inventado queda como estaba.
    expect(segments.find((s) => s.topic === 'soil')).toBe(draft.find((s) => s.topic === 'soil'));
  });
});
