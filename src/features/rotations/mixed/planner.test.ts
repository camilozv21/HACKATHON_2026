import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIORITIES, type FieldSurvey } from '@/lib/api/contract';
import { mockClimate, type Archetype } from '@/mocks/climateTemplates';
import { bestWindow, climateFit, monthlyClimate } from './climate';
import { matchGuild } from './guilds';
import { bestAdditions, evaluateMix, mainCrop, rankGuilds, recommend, spaceUse, twoYearPlan, type MixContext } from './planner';
import { pairRelation } from './relations';
import { traitsOf } from './traits';

const ctxFor = (arch: Archetype, survey: FieldSurvey | null = null, extra: Partial<MixContext> = {}): MixContext => ({
  climate: monthlyClimate(mockClimate(arch, { lat: 0, lon: 0 }, 'test')),
  water: { irrigation: 'none' },
  survey,
  priorities: DEFAULT_PRIORITIES,
  ...extra,
});

const SURVEY: FieldSurvey = { usualCrops: [], lastCrop: null, fertilization: null, residues: null, pests: null, purpose: null };

describe('parejas de cultivos', () => {
  it('milpa: el maíz sostiene al frijol y el frijol abona al maíz', () => {
    const r = pairRelation('maize', 'beans');
    expect(r.curated).toBe(true);
    expect(r.kind).toBe('helps');
    expect(r.reasons).toContainEqual({ id: 'support', kind: 'helps', from: 'maize', to: 'beans' });
    expect(r.reasons).toContainEqual({ id: 'nitrogen', kind: 'helps', from: 'beans', to: 'maize' });
    // Simétrica: el orden de los argumentos no cambia el resultado.
    expect(pairRelation('beans', 'maize').value).toBe(r.value);
  });

  it('dos gramíneas altas compiten y comparten plagas', () => {
    const r = pairRelation('maize', 'sorghum');
    expect(r.kind).toBe('careful');
    expect(r.reasons.map((x) => x.id)).toEqual(expect.arrayContaining(['sharedPests', 'light']));
  });

  it('las parejas no curadas se deducen de los rasgos (arroz inundado con maíz: agua)', () => {
    const r = pairRelation('rice', 'maize');
    expect(r.curated).toBe(false);
    expect(r.reasons.find((x) => x.id === 'water')).toMatchObject({ from: 'rice', to: 'maize' });
    expect(Math.abs(r.value)).toBeLessThanOrEqual(2);
  });
});

describe('alturas, volumen y raíces', () => {
  it('las tres hermanas ocupan más espacio que el maíz solo y el frijol trepa por el maíz', () => {
    const alone = spaceUse(['maize']);
    const milpa = spaceUse(['maize', 'beans', 'squash']);
    expect(milpa.aboveUse).toBeGreaterThan(alone.aboveUse);
    expect(milpa.support).toBe('maize');
    expect(milpa.groundCovered).toBe(true);
    expect(alone.groundCovered).toBe(false);
    expect(milpa.strata).toEqual(expect.arrayContaining(['ground', 'mid']));
  });

  it('un trepador sin tutor queda a ras del suelo y se avisa', () => {
    const e = evaluateMix([{ crop: 'beans' }, { crop: 'squash' }], ctxFor('tropical-highland'));
    expect(e.space.support).toBeNull();
    expect(e.missing).toContain('support');
    expect(e.notes.some((n) => n.id === 'needsSupport')).toBe(true);
  });
});

describe('clima (NASA POWER mes a mes)', () => {
  it('la yuca y el café no aguantan el invierno de Iowa; el maíz sí, sembrado en primavera', () => {
    const c = ctxFor('temperate');
    expect(climateFit(traitsOf('cassava')!, c.climate!, c.water)).toBeLessThan(45);
    expect(climateFit(traitsOf('coffee')!, c.climate!, c.water)).toBeLessThan(45);
    const maize = bestWindow(traitsOf('maize')!, c.climate!, c.water);
    expect(maize.score).toBeGreaterThan(0.6);
    expect(maize.sow).toBeGreaterThanOrEqual(4);
    expect(maize.sow).toBeLessThanOrEqual(6);
  });

  it('corrige la temperatura de la celda de NASA POWER a la altura de la finca (6,5 °C por km)', () => {
    const profile = mockClimate('tropical-highland', { lat: 4.5, lon: -75.8 }, 'test');
    const cellHigh = { ...profile, location: { ...profile.location, elevationM: 2267 } };
    const raw = monthlyClimate(cellHigh);
    const fixed = monthlyClimate(cellHigh, 1290);
    expect(raw.shiftC).toBe(0);
    expect(fixed.shiftC).toBeCloseTo(6.4, 1);
    expect(fixed.tMean[0]! - raw.tMean[0]!).toBeCloseTo(6.4, 1);
    // Diferencias chicas (< 150 m) no se tocan.
    expect(monthlyClimate(cellHigh, 2200).shiftC).toBe(0);
  });

  it('el riego completo cubre la falta de lluvia', () => {
    const dry = ctxFor('sahel');
    const irrigated = ctxFor('sahel', null, { water: { irrigation: 'full' } });
    const t = traitsOf('maize')!;
    expect(climateFit(t, irrigated.climate!, irrigated.water)).toBeGreaterThanOrEqual(climateFit(t, dry.climate!, dry.water));
  });
});

describe('finca cafetera de Quindío con NASA POWER real (celda a 2267 m, finca a ~1290 m)', () => {
  // Promedios mensuales 2015–2024 de NASA POWER en (-75.7748, 4.5352).
  const T = [15.4, 15.9, 15.8, 15.7, 15.6, 14.8, 14.8, 15.0, 15.4, 15.3, 15.3, 15.4];
  const P = [91.2, 113.1, 171.7, 212.6, 193.4, 141.5, 94.5, 86.9, 99.8, 186.5, 191.1, 116.9];
  const ctx = (shift: number): MixContext => ({
    climate: { tMean: T.map((t) => t + shift), precip: P, frost: Array(12).fill(0) },
    water: { irrigation: 'none' },
    survey: null,
    priorities: DEFAULT_PRIORITIES,
    known: ['coffee'],
  });

  it('sin corregir la altura, el café con plátano parece "no viable"; corregido, es la recomendación', () => {
    const raw = rankGuilds(ctx(0)).find((r) => r.guild.id === 'coffee-agroforestry')!;
    expect(raw.eval.viable).toBe(false);
    const shift = (2267 - 1290) * 0.0065;
    const fixed = rankGuilds(ctx(shift));
    expect(fixed.find((r) => r.guild.id === 'coffee-agroforestry')!.eval.viable).toBe(true);
    const rec = recommend(ctx(shift), ['coffee'], { climateReal: true, ranked: fixed })!;
    expect(rec.mix.guild?.id).toBe('coffee-agroforestry');
  });
});

describe('asociaciones y recomendación', () => {
  it('en Iowa, la milpa con yuca y el café no son viables; las tres hermanas sí', () => {
    const ranked = rankGuilds(ctxFor('temperate'));
    const by = Object.fromEntries(ranked.map((r) => [r.guild.id, r.eval]));
    expect(by['three-sisters']!.viable).toBe(true);
    expect(by['milpa-cassava']!.viable).toBe(false);
    expect(by['coffee-agroforestry']!.viable).toBe(false);
    // Los viables van primero.
    const firstNo = ranked.findIndex((r) => !r.eval.viable);
    expect(ranked.slice(firstNo).every((r) => !r.eval.viable)).toBe(true);
  });

  it('en el trópico la milpa con yuca aprovecha más el espacio que las tres hermanas', () => {
    const ranked = rankGuilds(ctxFor('tropical-highland'));
    const by = Object.fromEntries(ranked.map((r) => [r.guild.id, r.eval]));
    expect(by['milpa-cassava']!.viable).toBe(true);
    expect(by['milpa-cassava']!.dims.space).toBeGreaterThan(by['three-sisters']!.dims.space);
  });

  it('al maíz solo le conviene sumar algo que lo abone o cubra el suelo', () => {
    const adds = bestAdditions([{ crop: 'maize' }], ctxFor('tropical-highland'));
    expect(adds.length).toBeGreaterThan(0);
    const top = traitsOf(adds[0]!.crop)!;
    expect(Boolean(top.nFix) || top.habit === 'creeper').toBe(true);
    expect(adds[0]!.gain).toBeGreaterThan(0);
  });

  it('si no abona, la leguminosa suma; si repite la familia de lo último que sembró, se avisa', () => {
    const c = ctxFor('tropical-highland', { ...SURVEY, fertilization: 'none', lastCrop: 'maize' });
    const milpa = evaluateMix([{ crop: 'maize' }, { crop: 'beans', sowWeek: 3 }, { crop: 'squash', sowWeek: 3 }], c);
    expect(milpa.notes.map((n) => n.id)).toEqual(expect.arrayContaining(['noFertilizer', 'repeat']));
    const yuca = evaluateMix([{ crop: 'cassava' }, { crop: 'groundnut' }], c);
    expect(yuca.notes.map((n) => n.id)).toContain('rotationBreak');
    expect(yuca.dims.fit).toBeGreaterThan(milpa.dims.fit);
  });

  it('la recomendación nombra un cultivo principal, socios, confianza y lo que no sabemos', () => {
    const rec = recommend(ctxFor('tropical-highland', { ...SURVEY, usualCrops: ['maize', 'beans'] }), [], { climateReal: true })!;
    expect(rec.basedOn).toBe('survey');
    expect(rec.mix.eval.viable).toBe(true);
    expect(rec.mix.eval.crops).toContain(rec.crop);
    expect(rec.partners).not.toContain(rec.crop);
    expect(rec.gaps).toContain('varieties');
    expect(['high', 'medium', 'low']).toContain(rec.confidence);
  });

  it('en una finca de café no proponemos arrancarlo: se asocia con otros perennes', () => {
    const rec = recommend(ctxFor('tropical-highland'), ['coffee'], { climateReal: true })!;
    expect(rec.basedOn).toBe('rotation');
    expect(rec.mix.eval.members.some((m) => m.perennial)).toBe(true);
    const plan = twoYearPlan(rec, ctxFor('tropical-highland'), ['coffee']);
    expect(plan.perennial).toBe(true);
    expect(plan.years).toHaveLength(1);
  });

  it('plan de 2 años: el segundo año cambia de familia principal', () => {
    for (const arch of ['temperate', 'tropical-highland', 'sahel'] as Archetype[]) {
      const c = ctxFor(arch);
      const rec = recommend(c, [], { climateReal: true })!;
      const plan = twoYearPlan(rec, c, []);
      if (plan.perennial || plan.years.length < 2) continue;
      const f1 = traitsOf(mainCrop(plan.years[0]!.candidate))!.family;
      const f2 = traitsOf(mainCrop(plan.years[1]!.candidate))!.family;
      expect(f2, arch).not.toBe(f1);
    }
  });

  it('una mezcla con los mismos cultivos que una asociación conocida toma su nombre', () => {
    expect(matchGuild(['squash', 'maize', 'beans'])?.id).toBe('three-sisters');
    expect(matchGuild(['maize', 'potato'])).toBeNull();
    // Sin su cultivo principal no lleva el nombre de la asociación.
    expect(matchGuild(['beans', 'cassava', 'squash'])).toBeNull();
  });
});
