/**
 * Plantillas climáticas mensuales (valores típicos de cada región, redondeados) para los mocks.
 * No son datos reales de NASA: sirven para desarrollar y para la demo sin backend.
 * La app muestra el clima real de NASA POWER cuando está disponible (useClimate).
 */
import type { ClimateMonth, ClimateProfile, DataSource, Metric } from '@/lib/api/contract';

export type Archetype = 'tropical-highland' | 'temperate' | 'monsoon' | 'sahel' | 'pampa';

type Template = {
  tMean: number[];
  /** Mitad del rango diario (max = media + halfRange). */
  halfRange: number;
  precip: number[];
  soilMoisture: number[];
  ndvi: number[];
  frost: number[];
  heat: number[];
  /** Anomalía de humedad del último año (puntos porcentuales). */
  smAnomaly: number[];
  /** Tendencias para la serie anual sintética. */
  tempTrendPerYear: number;
  precipTrendPctPerYear: number;
  elevationM: number;
};

export const TEMPLATES: Record<Archetype, Template> = {
  'tropical-highland': {
    tMean: [21.5, 21.8, 21.9, 21.6, 21.4, 21.6, 21.9, 22.1, 21.6, 20.9, 20.8, 21.1],
    halfRange: 5,
    precip: [120, 135, 185, 245, 230, 130, 95, 100, 160, 255, 240, 155],
    soilMoisture: [72, 72, 76, 82, 82, 76, 70, 68, 72, 82, 84, 78],
    ndvi: [0.72, 0.71, 0.72, 0.75, 0.77, 0.76, 0.74, 0.73, 0.74, 0.76, 0.77, 0.75],
    frost: Array(12).fill(0),
    heat: Array(12).fill(0),
    smAnomaly: [-4, -6, -8, -3, 0, -5, -9, -10, -6, -2, 1, -3],
    tempTrendPerYear: 0.022,
    precipTrendPctPerYear: -0.35,
    elevationM: 1290,
  },
  temperate: {
    tMean: [-7, -4.5, 2, 9, 15.5, 21, 23, 22, 17.5, 10.5, 3, -4],
    halfRange: 5.5,
    precip: [22, 25, 55, 90, 120, 130, 110, 105, 85, 65, 45, 30],
    soilMoisture: [70, 72, 76, 74, 70, 64, 55, 50, 52, 58, 64, 68],
    ndvi: [0.2, 0.2, 0.22, 0.28, 0.4, 0.68, 0.85, 0.83, 0.65, 0.38, 0.26, 0.21],
    frost: [30, 26, 20, 7, 1, 0, 0, 0, 0, 4, 17, 28],
    heat: [0, 0, 0, 0, 0, 0.5, 1.5, 1, 0, 0, 0, 0],
    smAnomaly: [-2, -1, 0, -3, -5, -8, -10, -7, -4, -2, -1, -1],
    tempTrendPerYear: 0.03,
    precipTrendPctPerYear: 0.2,
    elevationM: 300,
  },
  monsoon: {
    tMean: [13, 16, 21, 27, 32, 33, 31, 30, 29.5, 25.5, 19.5, 14.5],
    halfRange: 6.5,
    precip: [25, 30, 25, 12, 20, 70, 210, 180, 90, 10, 5, 12],
    soilMoisture: [55, 52, 46, 36, 30, 38, 62, 70, 62, 46, 44, 52],
    ndvi: [0.55, 0.68, 0.7, 0.4, 0.25, 0.3, 0.55, 0.7, 0.72, 0.45, 0.35, 0.45],
    frost: [2, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    heat: [0, 0, 0, 3, 14, 16, 6, 2, 1, 0, 0, 0],
    smAnomaly: [-3, -4, -5, -6, -4, -2, -8, -6, -3, -2, -2, -3],
    tempTrendPerYear: 0.028,
    precipTrendPctPerYear: -0.4,
    elevationM: 245,
  },
  sahel: {
    tMean: [23, 26, 30, 33, 33, 30, 27.5, 26.5, 27.5, 29, 26.5, 23.5],
    halfRange: 7,
    precip: [0, 0, 1, 5, 25, 65, 150, 190, 85, 10, 0, 0],
    soilMoisture: [18, 16, 15, 16, 22, 32, 48, 58, 50, 30, 22, 19],
    ndvi: [0.15, 0.14, 0.13, 0.13, 0.15, 0.2, 0.35, 0.48, 0.45, 0.28, 0.2, 0.17],
    frost: Array(12).fill(0),
    heat: [1, 4, 14, 22, 24, 12, 3, 1, 4, 9, 3, 1],
    smAnomaly: [0, 0, 0, -1, -3, -6, -9, -5, -2, 0, 0, 0],
    tempTrendPerYear: 0.035,
    precipTrendPctPerYear: 0.5,
    elevationM: 370,
  },
  pampa: {
    tMean: [24, 22.5, 20, 16, 12.5, 9.5, 8.5, 10.5, 13, 16.5, 19.5, 22.5],
    halfRange: 6.5,
    precip: [110, 105, 120, 95, 55, 35, 30, 40, 55, 105, 110, 115],
    soilMoisture: [58, 60, 64, 66, 66, 64, 62, 58, 56, 58, 56, 54],
    ndvi: [0.7, 0.75, 0.68, 0.5, 0.38, 0.42, 0.48, 0.52, 0.48, 0.38, 0.42, 0.58],
    frost: [0, 0, 0, 0.5, 3, 8, 10, 6, 2, 0, 0, 0],
    heat: [3, 1.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.5, 2],
    smAnomaly: [-10, -12, -8, -5, -3, -2, -4, -6, -8, -9, -11, -12],
    tempTrendPerYear: 0.02,
    precipTrendPctPerYear: -0.2,
    elevationM: 65,
  },
};

export const DEMO_ARCHETYPE: Record<string, Archetype> = {
  'cafe-quindio': 'tropical-highland',
  'cornbelt-iowa': 'temperate',
  'punjab-ludhiana': 'monsoon',
  'sahel-maradi': 'sahel',
  'pampa-pergamino': 'pampa',
};

/** Arquetipo aproximado para fincas que no son demo (solo para mocks). */
export function archetypeFor(lon: number, lat: number): Archetype {
  if (lat > 10 && lat < 19 && lon > -18 && lon < 40) return 'sahel';
  if (lat > 18 && lat < 36 && lon > 60 && lon < 95) return 'monsoon';
  if (Math.abs(lat) <= 23.5) return 'tropical-highland';
  if (lat < -23.5) return 'pampa';
  return 'temperate';
}

/** Generador pseudoaleatorio determinista (misma finca → mismos números). */
export function seeded(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10_000) / 10_000;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function mockClimate(arch: Archetype, at: { lat: number; lon: number }, seed: string): ClimateProfile {
  const t = TEMPLATES[arch];
  const rand = seeded(seed);
  const period = '2001–2024 (promedio)';
  const m = (value: number | null, unit: string, source: DataSource, resolution: string, extra: Partial<Metric> = {}): Metric => ({
    value,
    unit,
    source,
    resolution,
    period,
    confidence: 'medium',
    ...extra,
  });

  const months: ClimateMonth[] = t.tMean.map((tm, i) => ({
    month: i + 1,
    tMean: m(tm, '°C', 'NASA POWER', '0.5° × 0.625°', { confidence: 'high' }),
    tMax: m(r1(tm + t.halfRange), '°C', 'NASA POWER', '0.5° × 0.625°', { confidence: 'high' }),
    tMin: m(r1(tm - t.halfRange), '°C', 'NASA POWER', '0.5° × 0.625°', { confidence: 'high' }),
    precip: m(t.precip[i]!, 'mm', 'GPM', '0.1° (~11 km)'),
    et: m(Math.round(Math.max(10, (tm + 5) * 3.2 * (0.4 + t.soilMoisture[i]! / 100))), 'mm', 'MODIS', '500 m', {
      estimated: true,
    }),
    soilMoisture: m(t.soilMoisture[i]!, '%', 'SMAP', '9 km'),
    soilMoistureAnomaly: m(t.smAnomaly[i]!, 'pp', 'SMAP', '9 km', { period: '2025 vs. 2015–2024' }),
    ndvi: m(t.ndvi[i]!, '', 'MODIS', '250 m', { confidence: 'high' }),
    frostDays: m(t.frost[i]!, 'días', 'NASA POWER', '0.5° × 0.625°'),
    heatDays: m(t.heat[i]!, 'días', 'NASA POWER', '0.5° × 0.625°', { estimated: true, confidence: 'low' }),
  }));

  const annualP = t.precip.reduce((a, b) => a + b, 0);
  const annualT = t.tMean.reduce((a, b) => a + b, 0) / 12;
  const trend = Array.from({ length: 25 }, (_, k) => {
    const year = 2001 + k;
    const dt = (year - 2013) * t.tempTrendPerYear + (rand() - 0.5) * 0.6;
    const dp = 1 + ((year - 2013) * t.precipTrendPctPerYear) / 100 + (rand() - 0.5) * 0.28;
    return { year, tMean: Math.round((annualT + dt) * 100) / 100, precip: Math.round(annualP * dp) };
  });
  const first = trend.slice(0, 5);
  const last = trend.slice(-5);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const latest = trend.at(-1)!;

  return {
    location: { lat: at.lat, lon: at.lon, elevationM: t.elevationM },
    baselinePeriod: '2001–2024',
    latestYear: 2025,
    months,
    trend,
    summary: {
      annualPrecipMm: annualP,
      precipChangePct: Math.round(((avg(last.map((x) => x.precip)) - avg(first.map((x) => x.precip))) / avg(first.map((x) => x.precip))) * 100),
      tempChangeC: r1(avg(last.map((x) => x.tMean)) - avg(first.map((x) => x.tMean))),
      latestYearPrecipAnomalyPct: Math.round(((latest.precip - annualP) / annualP) * 100),
      latestYearTempAnomalyC: r1(latest.tMean - annualT),
    },
    sources: ['NASA POWER', 'GPM', 'SMAP', 'MODIS'],
  };
}
