import { describe, expect, it } from 'vitest';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';
import { toFieldInput } from '@/features/field/toFieldInput';
import { rankStrategies } from '@/features/priorities/ranking';
import { AnalysisResponse, DEFAULT_PRIORITIES, type CropSeason, type FarmerPriorities, type FieldInput } from '@/lib/api/contract';
import { buildMockAnalysis } from '@/mocks/analysis';
import { DEMO_ARCHETYPE, mockClimate, TEMPLATES } from '@/mocks/climateTemplates';
import { DEMO_CURRENT } from '@/mocks/strategies';
import { recommend } from './recommend';
import { windows } from './schedule';
import { evaluate, lerOf, type EvalCtx } from './score';
import { buildSite, effectiveRain, extraterrestrialRadiation, slopeFactor, type Site } from './site';

const S = (crop: CropSeason['crop'], startMonth: number, endMonth: number, extra: Partial<CropSeason> = {}): CropSeason => ({
  crop,
  startMonth,
  endMonth,
  year: 1,
  role: 'cash',
  ...extra,
});

function demoSite(id: string): Site {
  const arch = DEMO_ARCHETYPE[id]!;
  const demo = DEMO_FARMS.find((d) => d.id === id)!;
  const [lon, lat] = demo.center;
  return buildSite(mockClimate(arch, { lat, lon }, id), { lat, lon }, { source: 'template', slopePct: 3 });
}

const ctxFor = (site: Site, irrigation: EvalCtx['irrigation'] = 'none'): EvalCtx => ({
  site,
  clim: { tMean: site.months.map((m) => m.t), precip: site.months.map((m) => m.p), frost: site.months.map((m) => m.frost) },
  irrigation,
  retention: 0.8,
  markets: [],
});

const point = (id: string, lon: number, lat: number, currentRotation: CropSeason[] = []): FieldInput => ({
  id,
  name: id,
  geometry: { type: 'Point', coordinates: [lon, lat] },
  areaHa: 1,
  currentRotation,
});

const analyze = (field: FieldInput, priorities: FarmerPriorities = DEFAULT_PRIORITIES) =>
  buildMockAnalysis({ field, priorities, locale: 'es' });

describe('perfil del sitio (FAO-56, Fournier, RUSLE)', () => {
  it('radiación extraterrestre: ejemplo 8 de FAO-56 (20° S, 3 de septiembre) = 32.2 MJ/m²/día', () => {
    expect(extraterrestrialRadiation(-20, 246)).toBeCloseTo(32.2, 1);
  });

  it('la lluvia que entra al suelo nunca supera a la que cae y descuenta más en meses muy lluviosos', () => {
    for (const p of [0, 40, 150, 300]) expect(effectiveRain(p)).toBeLessThanOrEqual(p);
    expect(effectiveRain(300) / 300).toBeLessThan(effectiveRain(100) / 100);
  });

  it('factor de pendiente de RUSLE ≈ 1 al 9 % y crece con la ladera', () => {
    expect(slopeFactor(9)).toBeCloseTo(1, 0);
    expect(slopeFactor(28)).toBeGreaterThan(slopeFactor(9));
    expect(slopeFactor(1)).toBeLessThan(0.3);
  });

  it('clasifica la zona por el clima, no por cajas de latitud', () => {
    expect(demoSite('cafe-quindio').zone).toBe('tropical-highland');
    expect(demoSite('cornbelt-iowa').zone).toBe('continental');
    expect(demoSite('punjab-ludhiana').zone).toBe('monsoon');
    expect(demoSite('sahel-maradi').zone).toBe('semi-arid');
    expect(demoSite('pampa-pergamino').zone).toBe('subtropical');
  });

  it('corrige la temperatura de la celda por la altitud real de la finca (6,5 °C/km)', () => {
    const climate = mockClimate('tropical-highland', { lat: 4.5, lon: -75.8 }, 'x');
    const high = { ...climate, location: { ...climate.location, elevationM: 2290 } };
    const site = buildSite(high, { lat: 4.5, lon: -75.8 }, { source: 'template', farmElevationM: 1290 });
    expect(site.months[0]!.t - climate.months[0]!.tMean.value!).toBeCloseTo(6.5, 1);
  });

  it('con NASA POWER usa el rango diario medio y no los extremos del mes', () => {
    const climate = mockClimate('temperate', { lat: 42, lon: -93.5 }, 'x');
    const extremes = { ...climate, months: climate.months.map((m) => ({ ...m, tMax: { ...m.tMax, value: m.tMean.value! + 11 }, tMin: { ...m.tMin, value: m.tMean.value! - 11 } })) };
    const raw = buildSite(extremes, { lat: 42, lon: -93.5 }, { source: 'template' });
    const fixed = buildSite(extremes, { lat: 42, lon: -93.5 }, { source: 'power', dailyRangeC: Array(12).fill(11) });
    expect(fixed.months[6]!.tmax - fixed.months[6]!.tmin).toBeCloseTo(11, 5);
    expect(fixed.annualEt0).toBeLessThan(raw.annualEt0 * 0.8);
  });
});

describe('calendario a partir del clima', () => {
  it('Iowa: la temporada empieza en mayo (sin heladas y ≥ 12 °C)', () => {
    expect(windows(demoSite('cornbelt-iowa')).main.start).toBe(5);
  });

  it('Sahel: la temporada empieza con las lluvias de julio y es corta', () => {
    const w = windows(demoSite('sahel-maradi'));
    expect(w.main.start).toBe(7);
    expect(w.main.len).toBeLessThanOrEqual(4);
  });

  it('Andes: llueve todo el año y hay dos temporadas (bimodal)', () => {
    const w = windows(demoSite('cafe-quindio'));
    expect(w.main.len).toBe(12);
    expect(w.second).not.toBeNull();
  });
});

describe('modelo de puntajes', () => {
  const iowa = demoSite('cornbelt-iowa');
  const cornSoy = [S('maize', 5, 10), S('soybean', 5, 10, { year: 2 })];

  it('una cobertura de invierno sube erosión, materia orgánica y nitrógeno frente al suelo desnudo', () => {
    const bare = evaluate(cornSoy, 24, ctxFor(iowa));
    const covered = evaluate([...cornSoy, S('rye', 11, 4, { role: 'cover' }), S('rye', 11, 4, { role: 'cover', year: 2 })], 24, ctxFor(iowa));
    expect(covered.scores.erosion).toBeGreaterThan(bare.scores.erosion);
    expect(covered.scores.soilOrganicMatter).toBeGreaterThan(bare.scores.soilOrganicMatter);
    expect(covered.scores.nitrogen).toBeGreaterThan(bare.scores.nitrogen);
    expect(covered.coveredMonths).toBeGreaterThan(bare.coveredMonths);
  });

  it('el arroz inundado pide mucho más riego que el maíz en la misma finca', () => {
    const punjab = demoSite('punjab-ludhiana');
    const rice = evaluate([S('rice', 6, 10), S('wheat', 11, 4)], 12, ctxFor(punjab, 'full'));
    const maize = evaluate([S('maize', 7, 10), S('wheat', 11, 3)], 12, ctxFor(punjab, 'full'));
    expect(rice.irrigationMm).toBeGreaterThan(maize.irrigationMm + 500);
    expect(rice.scores.water).toBeLessThan(maize.scores.water);
  });

  it('quemar el rastrojo baja la materia orgánica', () => {
    const punjab = demoSite('punjab-ludhiana');
    const seasons = [S('rice', 6, 10), S('wheat', 11, 4)];
    const burn = evaluate(seasons, 12, { ...ctxFor(punjab, 'full'), flags: { burn: true } });
    const mulch = evaluate(seasons, 12, { ...ctxFor(punjab, 'full'), flags: { mulch: true } });
    expect(mulch.scores.soilOrganicMatter).toBeGreaterThan(burn.scores.soilOrganicMatter + 20);
  });

  it('cultivos mixtos: la milpa rinde como más de 1.25 ha por separado y el intercalado suma nitrógeno', () => {
    expect(lerOf(['maize', 'beans', 'squash'])).toBeGreaterThanOrEqual(1.25);
    expect(lerOf(['maize', 'sorghum'])).toBeLessThan(1);
    const sahel = demoSite('sahel-maradi');
    const sole = evaluate([S('millet', 7, 9)], 12, ctxFor(sahel));
    const mixed = evaluate([S('millet', 7, 9), S('cowpea', 7, 9, { role: 'intercrop' })], 12, ctxFor(sahel));
    expect(mixed.ler).toBeGreaterThanOrEqual(1.25);
    expect(mixed.scores.nitrogen).toBeGreaterThan(sole.scores.nitrogen);
    expect(mixed.scores.income).toBeGreaterThan(sole.scores.income);
  });

  it('un cultivo fuera de su clima rinde poco (café con heladas de Iowa)', () => {
    const coffee = evaluate([S('coffee', 1, 12, { role: 'perennial' })], 12, ctxFor(iowa)).fits[0]!;
    expect(coffee.yield).toBeLessThan(0.45);
    expect(coffee.stress).toBe('frost');
  });

  it('la avena se muere con el invierno de Iowa; el centeno no', () => {
    const oats = evaluate([S('oats', 11, 4, { role: 'cover' })], 12, ctxFor(iowa)).fits[0]!;
    const rye = evaluate([S('rye', 11, 4, { role: 'cover' })], 12, ctxFor(iowa)).fits[0]!;
    expect(rye.thermal).toBeGreaterThan(oats.thermal);
  });
});

describe('recomendaciones', () => {
  it('lo de hoy es la rotación que contó el agricultor, no la de la región', () => {
    const demo = toFieldInput(demoField(DEMO_FARMS[0]!, 'es'));
    const res = analyze({ ...demo, currentRotation: [S('potato', 3, 6), S('beans', 9, 12)] });
    const current = res.strategies.find((s) => s.isCurrent)!;
    expect(current.seasons.map((s) => s.crop)).toEqual(['potato', 'beans']);
    expect(current.name).toMatch(/Papa – frijol/);
    expect(res.field.currentRotation.map((s) => s.crop)).toEqual(['potato', 'beans']);
  });

  it('si no nos dio su rotación, la supone y lo dice', () => {
    const res = analyze(point('llanos', -72.9, 4.1));
    const current = res.strategies.find((s) => s.isCurrent)!;
    expect(current.dataGaps[0]).toMatch(/^Supusimos/);
  });

  it('propone variedad: mejorar lo de hoy, cultivos mixtos y otra rotación, sin repetir', () => {
    const res = analyze(toFieldInput(demoField(DEMO_FARMS[1]!, 'es')));
    const ids = res.strategies.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.strategies.length).toBe(4);
    expect(ids).toContain('current');
    expect(ids.some((id) => id.startsWith('current-cover-'))).toBe(true);
    const names = res.strategies.map((s) => s.name);
    expect(names.some((n) => /^Maíz – soya con .+ de cobertura$/.test(n))).toBe(true);
  });

  it('en una finca cafetera mantiene el café y propone cobertura y sombrío', () => {
    const res = analyze(toFieldInput(demoField(DEMO_FARMS[0]!, 'es')));
    const alts = res.strategies.filter((s) => !s.isCurrent);
    expect(alts[0]!.seasons.some((s) => s.crop === 'coffee')).toBe(true);
    const dropsCoffee = alts.filter((s) => !s.seasons.some((x) => x.crop === 'coffee'));
    for (const s of dropsCoffee) expect(s.risks.join(' ')).toMatch(/decisión de varios años/);
  });

  it('Iowa (como en las e2e): con ingresos y menos trabajo lo de hoy va primero; con erosión, último', () => {
    const res = analyze(toFieldInput(demoField(DEMO_FARMS[1]!, 'es')));
    const w = (x: Partial<FarmerPriorities>): FarmerPriorities => ({
      ...DEFAULT_PRIORITIES,
      waterSaving: 1,
      soilHealth: 1,
      income: 1,
      forage: 1,
      erosionControl: 1,
      laborEquipment: 1,
      ...x,
    });
    const money = rankStrategies(res.strategies, w({ income: 5, laborEquipment: 5 }));
    const erosion = rankStrategies(res.strategies, w({ erosionControl: 5 }));
    expect(money[0]!.strategy.isCurrent).toBe(true);
    expect(erosion.at(-1)!.strategy.isCurrent).toBe(true);
  });

  it('las opciones con más cobertura ganan cuando importa frenar la erosión', () => {
    const res = analyze(toFieldInput(demoField(DEMO_FARMS[1]!, 'es')));
    const current = res.strategies.find((s) => s.isCurrent)!;
    for (const s of res.strategies.filter((x) => !x.isCurrent)) expect(s.scores.erosion).toBeGreaterThan(current.scores.erosion);
  });

  it('sin riego, lo que necesita mucho riego lo dice; si lo de hoy ya riega, lo supone y avisa', () => {
    const res = analyze(toFieldInput(demoField(DEMO_FARMS[2]!, 'es')));
    const current = res.strategies.find((s) => s.isCurrent)!;
    expect(current.risks.join(' ')).toMatch(/lo de hoy ya lo necesita/);
    expect(current.risks.join(' ')).toMatch(/Quemar el rastrojo/);
  });

  it('las restricciones cambian el texto: mercados cercanos y siembras sin tractor', () => {
    const demo = toFieldInput(demoField(DEMO_FARMS[1]!, 'es'));
    const res = analyze(demo, { ...DEFAULT_PRIORITIES, constraints: { irrigation: 'none', equipment: ['hand-tools'], markets: ['soybean'] } });
    expect(res.strategies.find((s) => s.isCurrent)!.benefits[0]).toMatch(/vender cerca/);
  });

  it('la encuesta cuenta: quemar el rastrojo baja la materia orgánica de lo de hoy', () => {
    const demo = toFieldInput(demoField(DEMO_FARMS[1]!, 'es'));
    const leave = analyze({ ...demo, survey: { usualCrops: [], lastCrop: null, fertilization: null, residues: 'leave', pests: null, purpose: null } });
    const burn = analyze({ ...demo, survey: { usualCrops: [], lastCrop: null, fertilization: null, residues: 'burn', pests: null, purpose: null } });
    const cur = (r: typeof leave) => r.strategies.find((s) => s.isCurrent)!;
    expect(cur(burn).scores.soilOrganicMatter).toBeLessThan(cur(leave).scores.soilOrganicMatter);
  });

  it('es determinista: la misma finca da la misma respuesta', () => {
    const f = toFieldInput(demoField(DEMO_FARMS[3]!, 'es'));
    const a = analyze(f);
    const b = analyze(f);
    expect(a.strategies).toEqual(b.strategies);
  });

  it.each([
    ['Andes fríos', -71.97, -13.5],
    ['Llanos', -72.9, 4.1],
    ['Kenia', 36.1, -0.3],
    ['Andalucía', -4.8, 37.9],
    ['Mekong', 105.8, 10],
    ['Jalisco', -103.4, 20.6],
    ['Sahara', 5, 25],
    ['Escandinavia', 15, 62],
  ])('cumple el contrato en cualquier lugar: %s', (_, lon, lat) => {
    for (const locale of ['es', 'en'] as const) {
      const res = buildMockAnalysis({ field: point(`p-${lon}-${lat}`, lon, lat), priorities: DEFAULT_PRIORITIES, locale });
      const parsed = AnalysisResponse.safeParse(res);
      if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3)));
      expect(res.strategies.length).toBeGreaterThanOrEqual(3);
      const evIds = res.strategies.flatMap((s) => s.evidence.map((e) => e.id));
      expect(new Set(evIds).size).toBe(evIds.length);
      for (const s of res.strategies) {
        expect(s.evidence.length).toBeGreaterThan(0);
        expect(s.risks.length).toBeGreaterThan(0);
        expect(s.dataGaps.length).toBeGreaterThan(0);
      }
    }
  });

  it('la evaluación de lo de hoy es la misma cuenta que la de las opciones', () => {
    const site = demoSite('sahel-maradi');
    const cur = DEMO_CURRENT.sahel;
    const rec = recommend({ site, locale: 'es', current: cur.seasons, currentDuration: cur.durationMonths, currentAssumed: false, constraints: DEFAULT_PRIORITIES.constraints });
    const direct = evaluate(cur.seasons, cur.durationMonths, { ...ctxFor(site), retention: 0.8 });
    expect(rec.strategies[0]!.scores).toEqual(direct.scores);
    expect(TEMPLATES.sahel.elevationM).toBeGreaterThan(0);
  });
});
