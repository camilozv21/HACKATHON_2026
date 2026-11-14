/**
 * NASA POWER (Prediction Of Worldwide Energy Resources) — llamada directa desde el navegador (CORS abierto).
 * API temporal mensual por punto, comunidad AG (agroclimatología).
 * Documentación y parámetros: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
 * Parámetros verificados (nov-2026) contra la API:
 *  T2M, T2M_MAX, T2M_MIN (°C) · PRECTOTCORR_SUM (mm/mes; YYYY13 = total anual) · RH2M (%)
 *  ALLSKY_SFC_SW_DWN (MJ/m²/día) · GWETROOT (0–1, humedad relativa del suelo en zona de raíces)
 *  EVPTRNS (MJ/m²/día de flujo de energía latente → mm/día dividiendo por 2.45) · FROST_DAYS (días)
 */
import { z } from 'zod';
import { roundTo } from '@/lib/geo';
import type { ClimateMonth, ClimateProfile, Confidence, Metric } from './contract';

export const POWER_PARAMS = [
  'T2M',
  'T2M_MAX',
  'T2M_MIN',
  'PRECTOTCORR_SUM',
  'RH2M',
  'ALLSKY_SFC_SW_DWN',
  'GWETROOT',
  'EVPTRNS',
  'FROST_DAYS',
] as const;
type PowerParam = (typeof POWER_PARAMS)[number];

export const POWER_START_YEAR = 2001;
const RESOLUTION = '0.5° × 0.625° (~55 km)';
const LATENT_HEAT_MJ_PER_KG = 2.45;

export const PowerMonthlyResponse = z.object({
  geometry: z.object({ coordinates: z.array(z.number()).min(2) }),
  properties: z.object({ parameter: z.record(z.string(), z.record(z.string(), z.number())) }),
  header: z.object({ fill_value: z.number().optional() }).optional(),
});
export type PowerMonthlyResponse = z.infer<typeof PowerMonthlyResponse>;

/** Redondeo a 0.1° para cachear (una celda de POWER mide ~0.5°, no se pierde nada). */
export const powerCacheKey = (lat: number, lon: number) =>
  ['power', roundTo(lat, 0.1).toFixed(1), roundTo(lon, 0.1).toFixed(1)] as const;

export async function fetchPowerMonthly(
  lat: number,
  lon: number,
  opts: { signal?: AbortSignal; endYear?: number } = {},
): Promise<PowerMonthlyResponse> {
  const endYear = opts.endYear ?? new Date().getUTCFullYear() - 1;
  const url = new URL('https://power.larc.nasa.gov/api/temporal/monthly/point');
  url.search = new URLSearchParams({
    parameters: POWER_PARAMS.join(','),
    community: 'AG',
    latitude: roundTo(lat, 0.1).toFixed(1),
    longitude: roundTo(lon, 0.1).toFixed(1),
    start: String(POWER_START_YEAR),
    end: String(endYear),
    format: 'JSON',
  }).toString();

  const res = await fetch(url, { signal: opts.signal ?? AbortSignal.timeout(20_000) });
  // A comienzos de año el año anterior puede no estar procesado todavía: se reintenta un año antes.
  if (res.status === 422 && !opts.endYear) return fetchPowerMonthly(lat, lon, { ...opts, endYear: endYear - 1 });
  if (!res.ok) throw new Error(`NASA POWER ${res.status}`);
  return PowerMonthlyResponse.parse(await res.json());
}

// ---------------------------------------------------------------- transformación

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v: number | null, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Φ(x) aproximada (Abramowitz–Stegun) para estimar días de calor a partir de la máxima media. */
function normalCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Días al mes con máxima > 35 °C, estimados con una dispersión diaria típica de 3 °C. */
export function estimateHeatDays(meanTmax: number | null, days = 30) {
  if (meanTmax == null) return null;
  return round(days * (1 - normalCdf((35 - meanTmax) / 3)), 1);
}

export function powerToClimate(raw: PowerMonthlyResponse, at: { lat: number; lon: number }): ClimateProfile {
  const fill = raw.header?.fill_value ?? -999;
  const p = raw.properties.parameter;
  const get = (param: PowerParam, year: number, month: number) => {
    const v = p[param]?.[`${year}${String(month).padStart(2, '0')}`];
    return v == null || v === fill ? null : v;
  };

  const years = [
    ...new Set(
      Object.keys(p.T2M ?? {})
        .filter((k) => !k.endsWith('13'))
        .map((k) => Number(k.slice(0, 4))),
    ),
  ].sort((a, b) => a - b);

  const completeYears = years.filter((y) =>
    Array.from({ length: 12 }, (_, i) => i + 1).every((m) => get('T2M', y, m) != null && get('PRECTOTCORR_SUM', y, m) != null),
  );
  const latestYear = completeYears.at(-1) ?? years.at(-1) ?? new Date().getUTCFullYear() - 1;
  const baseline = completeYears.filter((y) => y !== latestYear);
  const baselineLabel = baseline.length ? `${baseline[0]}–${baseline.at(-1)}` : String(latestYear);

  const metric = (
    value: number | null,
    unit: string,
    period: string,
    confidence: Confidence = 'medium',
    extra: Partial<Metric> = {},
  ): Metric => ({ value, unit, source: 'NASA POWER', resolution: RESOLUTION, period, confidence, ...extra });

  const baseMean = (param: PowerParam, month: number) =>
    mean(baseline.map((y) => get(param, y, month)).filter((v): v is number => v != null));

  const months: ClimateMonth[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const period = `${baselineLabel} (promedio)`;
    const tMax = baseMean('T2M_MAX', m);
    const evp = baseMean('EVPTRNS', m);
    const sm = baseMean('GWETROOT', m);
    const smLatest = get('GWETROOT', latestYear, m);
    return {
      month: m,
      tMean: metric(round(baseMean('T2M', m)), '°C', period, 'high'),
      tMax: metric(round(tMax), '°C', period, 'high'),
      tMin: metric(round(baseMean('T2M_MIN', m)), '°C', period, 'high'),
      precip: metric(round(baseMean('PRECTOTCORR_SUM', m), 0), 'mm', period, 'medium'),
      et: metric(evp == null ? null : round((evp / LATENT_HEAT_MJ_PER_KG) * daysInMonth(2001, m), 0), 'mm', period, 'medium', {
        estimated: true,
      }),
      soilMoisture: metric(sm == null ? null : round(sm * 100, 0), '%', period, 'medium'),
      soilMoistureAnomaly: metric(
        sm == null || smLatest == null ? null : round((smLatest - sm) * 100, 0),
        'pp',
        `${latestYear} vs. ${baselineLabel}`,
        'medium',
      ),
      ndvi: { value: null, unit: '', source: 'MODIS', resolution: '1 km', period, confidence: 'low' },
      frostDays: metric(round(baseMean('FROST_DAYS', m)), 'días', period, 'medium'),
      heatDays: metric(estimateHeatDays(tMax, daysInMonth(2001, m)), 'días', period, 'low', { estimated: true }),
    };
  });

  const annual = (param: PowerParam, y: number) => {
    const v = p[param]?.[`${y}13`];
    return v == null || v === fill ? null : v;
  };
  const trend = completeYears.map((y) => ({
    year: y,
    tMean: round(annual('T2M', y), 2),
    precip: round(annual('PRECTOTCORR_SUM', y), 0),
  }));

  const firstN = trend.slice(0, 5);
  const lastN = trend.slice(-5);
  const avg = (xs: (number | null)[]) => mean(xs.filter((v): v is number => v != null));
  const precipFirst = avg(firstN.map((t) => t.precip));
  const precipLast = avg(lastN.map((t) => t.precip));
  const baselineTrend = trend.filter((t) => t.year !== latestYear);
  const basePrecip = avg(baselineTrend.map((t) => t.precip));
  const baseTemp = avg(baselineTrend.map((t) => t.tMean));
  const latest = trend.find((t) => t.year === latestYear);

  return {
    location: { lat: at.lat, lon: at.lon, elevationM: raw.geometry.coordinates[2] ?? null },
    baselinePeriod: baselineLabel,
    latestYear,
    months,
    trend,
    summary: {
      annualPrecipMm: round(basePrecip, 0),
      precipChangePct:
        precipFirst && precipLast != null && trend.length >= 10 ? round(((precipLast - precipFirst) / precipFirst) * 100, 0) : null,
      tempChangeC: trend.length >= 10 ? round((avg(lastN.map((t) => t.tMean)) ?? 0) - (avg(firstN.map((t) => t.tMean)) ?? 0), 1) : null,
      latestYearPrecipAnomalyPct:
        basePrecip && latest?.precip != null ? round(((latest.precip - basePrecip) / basePrecip) * 100, 0) : null,
      latestYearTempAnomalyC: baseTemp != null && latest?.tMean != null ? round(latest.tMean - baseTemp, 1) : null,
    },
    sources: ['NASA POWER'],
  };
}

export async function fetchPowerClimate(lat: number, lon: number, signal?: AbortSignal) {
  const raw = await fetchPowerMonthly(lat, lon, { signal });
  return powerToClimate(raw, { lat, lon });
}

// ---------------------------------------------------------------- diario (máquina del tiempo)

export type PowerDay = {
  date: string;
  precip: number | null;
  tmax: number | null;
  tmin: number | null;
  /** Temperatura media del día (T2M, promedio de 24 h). */
  tmean?: number | null;
  soil: number | null;
};

/**
 * Datos diarios de un periodo (YYYY-MM-DD, inclusivo): lluvia (mm), máxima, mínima y media (°C) y humedad de la zona de
 * raíces (GWETROOT, 0–1 → %). NASA POWER responde con CORS abierto, así que se pide directo desde el teléfono.
 */
export async function fetchPowerDaily(lat: number, lon: number, start: string, end: string, signal?: AbortSignal): Promise<PowerDay[]> {
  const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  url.search = new URLSearchParams({
    parameters: 'PRECTOTCORR,T2M_MAX,T2M_MIN,T2M,GWETROOT',
    community: 'AG',
    latitude: roundTo(lat, 0.1).toFixed(1),
    longitude: roundTo(lon, 0.1).toFixed(1),
    start: start.replaceAll('-', ''),
    end: end.replaceAll('-', ''),
    format: 'JSON',
  }).toString();
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`NASA POWER ${res.status}`);
  const raw = PowerMonthlyResponse.parse(await res.json());
  const p = raw.properties.parameter;
  const fill = raw.header?.fill_value ?? -999;
  const val = (v: number | undefined) => (v == null || v === fill || v < -900 ? null : v);
  return Object.keys(p.PRECTOTCORR ?? {})
    .sort()
    .map((k) => {
      const soil = val(p.GWETROOT?.[k]);
      return {
        date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`,
        precip: val(p.PRECTOTCORR?.[k]),
        tmax: val(p.T2M_MAX?.[k]),
        tmin: val(p.T2M_MIN?.[k]),
        tmean: val(p.T2M?.[k]),
        soil: soil == null ? null : Math.round(soil * 100),
      };
    });
}
