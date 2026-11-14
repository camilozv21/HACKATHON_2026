/**
 * Generador de respuestas mock de /analysis con el mismo contrato que el backend (src/lib/api/contract.ts).
 *
 *  - Clima: NASA POWER real del punto si el route lo pudo leer (opts.climate); si no, la plantilla de la zona.
 *  - Rotación actual: la que dio el agricultor; si no dio ninguna, la de la finca demo o la más común de su zona.
 *  - Estrategias y puntajes: el motor (src/mocks/engine/recommend.ts), con el mismo modelo para todas.
 *  - Hallazgos: fincas demo → los curados de su región; demás fincas → calculados del clima y de la rotación.
 */
import type { AnalysisRequest, AnalysisResponse, ClimateProfile, CropSeason, FieldInsights, Level } from '@/lib/api/contract';
import { archetypeFor, DEMO_ARCHETYPE, mockClimate, TEMPLATES, type Archetype } from './climateTemplates';
import { recommend, monthsLabel, type SurveyLike } from './engine/recommend';
import type { EngineMarket } from './engine/market';
import { seasonLength } from './engine/schedule';
import { buildSite, siteErosionSeverity, type Site } from './engine/site';
import { applyFarmerData } from './farmerData';
import { DEMO_CURRENT, defaultRotationFor, type CurrentRotation } from './strategies';

type Loc = 'es' | 'en';
const tr = (locale: Loc, es: string, en: string) => (locale === 'en' ? en : es);

/** Pendiente media (SRTM) de las fincas demo. */
const DEMO_SLOPE: Record<Archetype, number> = { 'tropical-highland': 28, temperate: 3, monsoon: 1, sahel: 2, pampa: 1.5 };

const INSIGHTS: Record<Archetype, (l: Loc) => FieldInsights> = {
  'tropical-highland': (l) => ({
    bareSoilPeriods: [
      { startMonth: 1, endMonth: 3, reason: tr(l, 'Calles entre surcos limpias de maleza', 'Weeded inter-rows') },
      { startMonth: 7, endMonth: 8, reason: tr(l, 'Calles sin cobertura en meses secos', 'Uncovered inter-rows in dry months') },
    ],
    stressSeasons: [
      { kind: 'drought', months: [7, 8], severity: 'medium', source: 'SMAP', note: tr(l, 'Más fuerte en años de El Niño', 'Stronger in El Niño years') },
      { kind: 'waterlogging', months: [4, 5, 10, 11], severity: 'low', source: 'GPM' },
    ],
    waterTrend: { direction: 'stable', cmPerYear: 0.1, period: '2002–2025', source: 'GRACE', confidence: 'low' },
    erosionRisk: {
      level: 'high',
      slopePct: 28,
      extremeRainDaysPerYear: 14,
      explanation: tr(
        l,
        'Laderas empinadas y 14 días al año con lluvias muy fuertes: el suelo desnudo se lava.',
        'Steep slopes and 14 days a year with very heavy rain: bare soil washes away.',
      ),
      source: ['SRTM', 'GPM'],
    },
    waterloggingRisk: { level: 'low', explanation: tr(l, 'Pendiente alta: el agua escurre rápido.', 'Steep slope: water drains fast.') },
  }),
  temperate: (l) => ({
    bareSoilPeriods: [{ startMonth: 11, endMonth: 4, reason: tr(l, 'Después de la cosecha, sin cobertura', 'After harvest, no cover') }],
    stressSeasons: [
      { kind: 'frost', months: [11, 12, 1, 2, 3], severity: 'high', source: 'NASA POWER' },
      { kind: 'drought', months: [7, 8], severity: 'medium', source: 'SMAP', note: tr(l, 'Durante el llenado del grano', 'During grain fill') },
    ],
    waterTrend: { direction: 'stable', cmPerYear: -0.2, period: '2002–2025', source: 'GRACE', confidence: 'medium' },
    erosionRisk: {
      level: 'medium',
      slopePct: 3,
      extremeRainDaysPerYear: 6,
      explanation: tr(l, 'Lomas suaves, pero el suelo desnudo en primavera pierde tierra con las tormentas.', 'Gentle slopes, but bare soil in spring loses topsoil in storms.'),
      source: ['SRTM', 'GPM'],
    },
    waterloggingRisk: { level: 'medium', explanation: tr(l, 'Suelos húmedos en marzo–abril con el deshielo.', 'Wet soils in March–April with snowmelt.') },
  }),
  monsoon: (l) => ({
    bareSoilPeriods: [
      { startMonth: 5, endMonth: 5, reason: tr(l, 'Entre la cosecha de trigo y el arroz', 'Between wheat harvest and rice') },
      { startMonth: 10, endMonth: 11, reason: tr(l, 'Quema de paja tras el arroz', 'Straw burning after rice') },
    ],
    stressSeasons: [
      { kind: 'heat', months: [5, 6], severity: 'high', source: 'NASA POWER' },
      { kind: 'drought', months: [4, 5], severity: 'high', source: 'SMAP' },
    ],
    waterTrend: { direction: 'down', cmPerYear: -1.6, period: '2002–2025', source: 'GRACE', confidence: 'high' },
    erosionRisk: {
      level: 'low',
      slopePct: 1,
      extremeRainDaysPerYear: 4,
      explanation: tr(l, 'Terreno plano: poca erosión por agua.', 'Flat land: little water erosion.'),
      source: ['SRTM', 'GPM'],
    },
    waterloggingRisk: { level: 'medium', explanation: tr(l, 'Encharcamiento en julio–agosto con el monzón.', 'Waterlogging in July–August with the monsoon.') },
  }),
  sahel: (l) => ({
    bareSoilPeriods: [{ startMonth: 11, endMonth: 5, reason: tr(l, 'Época seca sin cultivo', 'Dry season without crop') }],
    stressSeasons: [
      { kind: 'heat', months: [3, 4, 5], severity: 'high', source: 'NASA POWER' },
      { kind: 'drought', months: [6, 10], severity: 'medium', source: 'SMAP', note: tr(l, 'Inicio y fin de lluvias inciertos', 'Uncertain start and end of rains') },
    ],
    waterTrend: { direction: 'up', cmPerYear: 0.4, period: '2002–2025', source: 'GRACE', confidence: 'low' },
    erosionRisk: {
      level: 'medium',
      slopePct: 2,
      extremeRainDaysPerYear: 5,
      explanation: tr(l, 'Las primeras tormentas y el viento arrastran el suelo desnudo y con costra.', 'First storms and wind carry away bare, crusted soil.'),
      source: ['SRTM', 'GPM'],
    },
  }),
  pampa: (l) => ({
    bareSoilPeriods: [{ startMonth: 5, endMonth: 10, reason: tr(l, 'Barbecho después de la soya', 'Fallow after soybean') }],
    stressSeasons: [
      { kind: 'frost', months: [6, 7, 8], severity: 'medium', source: 'NASA POWER' },
      { kind: 'drought', months: [12, 1, 2], severity: 'medium', source: 'SMAP', note: tr(l, 'Último año más seco de lo normal', 'Last year drier than normal') },
    ],
    waterTrend: { direction: 'down', cmPerYear: -0.5, period: '2002–2025', source: 'GRACE', confidence: 'medium' },
    erosionRisk: {
      level: 'low',
      slopePct: 1.5,
      extremeRainDaysPerYear: 6,
      explanation: tr(l, 'Terreno casi plano; el riesgo sube con suelo desnudo en otoño.', 'Almost flat land; risk rises with bare soil in fall.'),
      source: ['SRTM', 'GPM'],
    },
    waterloggingRisk: { level: 'medium', explanation: tr(l, 'Bajos que se encharcan en otoños lluviosos.', 'Low spots that flood in rainy autumns.') },
  }),
};

/** Meses sin cultivo agrupados en tramos seguidos (para los hallazgos). */
function bareRanges(months: number[]): { startMonth: number; endMonth: number }[] {
  const set = new Set(months);
  const out: { startMonth: number; endMonth: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(m === 1 ? 12 : m - 1)) continue;
    let end = m;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== m) end = (end % 12) + 1;
    out.push({ startMonth: m, endMonth: end });
  }
  return out;
}

const levelOf = (v: number, med: number, high: number): Level => (v >= high ? 'high' : v >= med ? 'medium' : 'low');

/** Hallazgos calculados del clima del sitio (fincas que no son demo). */
function derivedInsights(site: Site, l: Loc): Omit<FieldInsights, 'bareSoilPeriods'> {
  const stress: FieldInsights['stressSeasons'] = [];
  const climSrc = site.source === 'power' ? 'NASA POWER' : 'SMAP';
  if (site.heatMonths.length) {
    const max = Math.max(...site.heatMonths.map((m) => site.months[m - 1]!.heat));
    stress.push({ kind: 'heat', months: site.heatMonths, severity: levelOf(max, 3, 10), source: 'NASA POWER' });
  }
  const dry = site.dryMonths.length ? site.dryMonths : site.months.filter((m) => (m.smAnom ?? 0) <= -8).map((m) => m.month);
  if (dry.length) stress.push({ kind: 'drought', months: dry, severity: levelOf(dry.length, 3, 6), source: climSrc });
  if (site.frostMonths.length) {
    const max = Math.max(...site.frostMonths.map((m) => site.months[m - 1]!.frost));
    stress.push({ kind: 'frost', months: site.frostMonths, severity: levelOf(max, 3, 10), source: 'NASA POWER' });
  }
  if (site.wetMonths.length) stress.push({ kind: 'waterlogging', months: site.wetMonths, severity: levelOf(site.wetMonths.length, 2, 4), source: site.source === 'power' ? 'NASA POWER' : 'GPM' });

  const sev = siteErosionSeverity(site);
  const erosionLevel = levelOf(sev, 0.25, 0.6);
  const top = [...site.months].sort((a, b) => b.p - a.p).slice(0, 3).map((m) => m.month);
  return {
    stressSeasons: stress,
    waterTrend: site.waterTrend ?? { direction: 'stable', cmPerYear: null, period: '2002–2025', source: 'GRACE', confidence: 'low' },
    erosionRisk: {
      level: erosionLevel,
      slopePct: site.slopeKnown ? site.slopePct : null,
      extremeRainDaysPerYear: null,
      explanation: tr(
        l,
        `Lluvia erosiva ${{ low: 'baja', medium: 'media', high: 'alta' }[site.erosivity]} (más fuerte en ${monthsLabel(top, l)})${site.slopeKnown ? '' : ' y pendiente supuesta'}: el suelo desnudo en esos meses es el que más se pierde.`,
        `${site.erosivity} erosive rain (heaviest in ${monthsLabel(top, l)})${site.slopeKnown ? '' : ' and an assumed slope'}: bare soil in those months is what washes away most.`,
      ),
      source: [site.source === 'power' ? 'NASA POWER' : 'GPM', 'SRTM'],
    },
    waterloggingRisk: site.wetMonths.length
      ? {
          level: levelOf(site.wetMonths.length, 2, 4),
          explanation: tr(l, `Llueve mucho más de lo que se evapora en ${monthsLabel(site.wetMonths, l)}.`, `It rains far more than evaporates in ${monthsLabel(site.wetMonths, l)}.`),
        }
      : undefined,
  };
}

/** El clima real de NASA POWER no trae NDVI: se conserva el verdor (MODIS) de la plantilla para el calendario. */
function withTemplateNdvi(real: ClimateProfile, template: ClimateProfile): ClimateProfile {
  return {
    ...real,
    months: real.months.map((m, i) => ({ ...m, ndvi: m.ndvi.value == null ? template.months[i]!.ndvi : m.ndvi })),
    sources: [...new Set([...real.sources, 'MODIS' as const])],
  };
}

/**
 * La celda de NASA POWER (~50 km) promedia montañas y valles: si conocemos la altitud de la finca y difiere más de
 * 150 m, el clima de la respuesta se corrige a la finca (6,5 °C por km) y lo dice en location.elevationM.
 * Así quien use este clima (motor, calendario, planificador de asociaciones) no lo corrige dos veces.
 */
function atFarmElevation(c: ClimateProfile, farmElevationM: number | null): ClimateProfile {
  const cell = c.location.elevationM;
  if (farmElevationM == null || cell == null || Math.abs(cell - farmElevationM) <= 150) return c;
  const dT = (cell - farmElevationM) * 0.0065;
  const shift = (m: ClimateProfile['months'][number]['tMean']) => (m.value == null ? m : { ...m, value: Math.round((m.value + dT) * 10) / 10, estimated: true });
  return {
    ...c,
    location: { ...c.location, elevationM: farmElevationM },
    months: c.months.map((m) => ({
      ...m,
      tMean: shift(m.tMean),
      tMax: shift(m.tMax),
      tMin: shift(m.tMin),
      // Si la finca es más cálida que la celda, sus heladas no aplican tal cual (si es más fría, se dejan).
      frostDays: dT >= 2 && (m.tMin.value ?? 0) + dT > 2 ? { ...m.frostDays, value: 0, estimated: true } : m.frostDays,
    })),
  };
}

function centerOf(field: AnalysisRequest['field']): [number, number] {
  if (field.geometry.type === 'Point') return field.geometry.coordinates;
  const ring = field.geometry.coordinates[0]!.slice(0, -1);
  const lon = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  const lat = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  return [lon, lat];
}

function givenRotation(seasons: CropSeason[]): CurrentRotation | null {
  if (!seasons.some((s) => s.role !== 'fallow' && seasonLength(s) > 0)) return null;
  const years = Math.max(1, ...seasons.map((s) => s.year ?? 1));
  return { seasons, durationMonths: (Math.min(3, years) * 12) as 12 | 24 | 36, flags: {} };
}

export type MockAnalysisOptions = {
  /** Clima real de NASA POWER (el route lo pide en el servidor). Sin él, la plantilla de la zona. */
  climate?: ClimateProfile | null;
  /** Rango diario medio por mes (T2M_RANGE de POWER): corrige los extremos de T2M_MAX/T2M_MIN. */
  dailyRangeC?: (number | null)[] | null;
  /** Mercado de la zona (Colombia: SIPSA, EVA, Finagro). Sin él, "ingresos" usa valores relativos genéricos. */
  market?: EngineMarket | null;
};

export function buildMockAnalysis(req: AnalysisRequest, opts: MockAnalysisOptions = {}): AnalysisResponse {
  const { field, locale, priorities } = req;
  const [lon, lat] = centerOf(field);
  const demoArch = field.demoId ? DEMO_ARCHETYPE[field.demoId] : undefined;
  const arch = demoArch || archetypeFor(lon, lat);
  const template = mockClimate(arch, { lat, lon }, field.id);
  // Altitud de la finca: hoy solo la sabemos en las fincas demo (SRTM); en las demás queda la de la celda.
  const farmElevationM = demoArch ? TEMPLATES[demoArch].elevationM : null;
  const climate = opts.climate ? atFarmElevation(withTemplateNdvi(opts.climate, template), farmElevationM) : template;
  const curated = demoArch ? INSIGHTS[demoArch](locale) : null;
  const site = buildSite(climate, { lat, lon }, {
    slopePct: demoArch ? DEMO_SLOPE[demoArch] : null,
    source: opts.climate ? 'power' : 'template',
    waterTrend: curated?.waterTrend ?? null,
    farmElevationM,
    dailyRangeC: opts.dailyRangeC ?? null,
  });

  // La rotación de hoy: la que contó el agricultor > la de la finca demo > la más común de la zona.
  const given = givenRotation(field.currentRotation);
  const current = given ?? (demoArch ? DEMO_CURRENT[demoArch] : defaultRotationFor(site));
  const survey = (field as { survey?: SurveyLike | null }).survey ?? null;
  const flags = { ...current.flags, burn: survey?.residues ? survey.residues === 'burn' : current.flags.burn };

  const rec = recommend({
    site,
    locale,
    current: current.seasons,
    currentDuration: current.durationMonths,
    currentAssumed: !given && !demoArch,
    currentFlags: flags,
    constraints: priorities.constraints,
    survey,
    market: opts.market ?? null,
  });

  const bare = bareRanges(rec.current.bareMonths).map((r) => ({
    ...r,
    reason: tr(locale, 'Sin cultivo vivo entre cosechas', 'No living crop between harvests'),
  }));
  const insights: FieldInsights = curated
    ? { ...curated, bareSoilPeriods: given ? bare : curated.bareSoilPeriods }
    : { ...derivedInsights(site, locale), bareSoilPeriods: bare };

  // Al final: lo que contó el agricultor (suelo) y los datos que todavía faltan (src/mocks/farmerData.ts).
  return applyFarmerData(
    {
      field: { ...field, currentRotation: current.seasons },
      climate,
      insights,
      strategies: rec.strategies,
      generatedAt: new Date().toISOString(),
      disclaimer: tr(
        locale,
        'Esta herramienta te ayuda a explorar opciones. Revisa cualquier cambio con tu experiencia y con un técnico agrícola de tu zona.',
        'This tool helps you explore options. Review any change with your own experience and a local agricultural advisor.',
      ),
      mock: true,
      ...(opts.market
        ? {
            market: {
              deptCode: opts.market.deptCode,
              deptName: opts.market.deptName,
              nearestMarket: opts.market.nearestMarket ? { name: opts.market.nearestMarket.name, distanceKm: opts.market.nearestMarket.distanceKm } : null,
              trmCop: opts.market.trm?.value ?? null,
              fertilizerChange12mPct: opts.market.inputs?.fertChange12mPct ?? null,
              asOf: opts.market.asOf,
              source: opts.market.source,
            },
          }
        : {}),
    },
    req,
    arch,
  );
}
