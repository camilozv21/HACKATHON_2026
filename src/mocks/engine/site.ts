/**
 * Perfil agroclimático de la finca a partir del clima mensual (NASA POWER real, o la plantilla si no hay red).
 *
 *  - ET0 (lo que el campo pierde por evaporación y transpiración): Hargreaves–Samani, FAO-56 ec. 52,
 *      ET0 = 0.0023 · (Tmedia + 17.8) · √(Tmáx − Tmín) · Ra, con Ra (radiación en el tope de la atmósfera) de FAO-56 ec. 21.
 *  - Lluvia que entra al suelo: 90 % de la del mes hasta 150 mm y 75 % de lo que pase de ahí (el resto escurre).
 *    El balance de agua (score.ts) guarda lo que sobra en el suelo para los meses siguientes.
 *  - Altitud: la celda de NASA POWER (~50 km) promedia montañas y valles; si conocemos la altitud de la finca,
 *    corregimos la temperatura con el gradiente típico de 6,5 °C por km.
 *  - Periodo de crecimiento (FAO, zonas agroecológicas): meses con lluvia ≥ ½ ET0 y temperatura ≥ 5 °C.
 *  - Lluvia erosiva: índice de Fournier modificado (Arnoldus 1980), IFM = Σ p² / P.
 *  - Pendiente: SRTM en las fincas demo; en las demás se supone una típica de la zona (y se dice).
 */
import type { ClimateProfile, FieldInsights, Level } from '@/lib/api/contract';

export type Zone =
  | 'arid'
  | 'semi-arid'
  | 'savanna'
  | 'humid-tropics'
  | 'tropical-highland'
  | 'cold-highland'
  | 'monsoon'
  | 'mediterranean'
  | 'continental'
  | 'subtropical';

export type SiteMonth = {
  month: number;
  t: number;
  tmax: number;
  tmin: number;
  p: number;
  peff: number;
  et0: number;
  frost: number;
  heat: number;
  soil: number | null;
  smAnom: number | null;
};

export type Site = {
  lat: number;
  lon: number;
  elevationM: number | null;
  months: SiteMonth[];
  annualP: number;
  annualEt0: number;
  /** Lluvia ÷ ET0 del año (índice de aridez de la UNEP). */
  aridity: number;
  tAnnual: number;
  tColdest: number;
  tWarmest: number;
  /** Meses del periodo de crecimiento FAO. */
  growing: boolean[];
  lgp: number;
  dryMonths: number[];
  frostMonths: number[];
  heatMonths: number[];
  /** Meses con mucho más lluvia que evaporación (encharcamiento posible). */
  wetMonths: number[];
  /** Meses en los que llueve más de lo que se evapora (el nitrógeno sobrante se lava). */
  leachMonths: number[];
  mfi: number;
  erosivity: Level;
  /** 0–1 */
  erosivity01: number;
  slopePct: number;
  slopeKnown: boolean;
  zone: Zone;
  source: 'power' | 'template';
  precipChangePct: number | null;
  tempChangeC: number | null;
  waterTrend: FieldInsights['waterTrend'] | null;
};

const MID_DAY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Radiación extraterrestre diaria (MJ m⁻² día⁻¹), FAO-56 ec. 21. */
export function extraterrestrialRadiation(latDeg: number, dayOfYear: number): number {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * dayOfYear);
  const delta = 0.409 * Math.sin(((2 * Math.PI) / 365) * dayOfYear - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  return ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

/** ET0 mensual (mm) por Hargreaves–Samani. */
export function et0Hargreaves(latDeg: number, month: number, t: number, tmax: number, tmin: number): number {
  const ra = extraterrestrialRadiation(latDeg, MID_DAY[month - 1]!) * 0.408; // MJ → mm de agua evaporada
  const daily = 0.0023 * (t + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * ra;
  return Math.max(0, daily) * DAYS[month - 1]!;
}

/** Lluvia del mes que entra al suelo (mm), descontando la escorrentía. */
export function effectiveRain(p: number): number {
  return p <= 150 ? 0.9 * p : 135 + 0.75 * (p - 150);
}

const LAPSE_C_PER_M = 0.0065;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Clasificación agroclimática simple a partir de temperatura, lluvia y periodo de crecimiento. */
function classify(s: Pick<Site, 'lat' | 'months' | 'aridity' | 'annualP' | 'tAnnual' | 'tColdest' | 'tWarmest' | 'lgp'>): Zone {
  const { months, aridity, annualP, tAnnual, tColdest, tWarmest, lgp } = s;
  if (aridity < 0.2 || annualP < 250) return 'arid';
  // Trópico: casi la misma temperatura todo el año; lo que cambia con la altura es qué tan fresco es.
  const tropics = Math.abs(s.lat) <= 24 && tWarmest - tColdest < 7;
  if (tropics && tAnnual < 15) return 'cold-highland';
  if (tropics && tAnnual < 23.5) return 'tropical-highland';
  if (tColdest < -1) return 'continental';
  const byT = [...months].sort((a, b) => a.t - b.t);
  const coolHalf = sum(byT.slice(0, 6).map((m) => m.p));
  const warmHalf = sum(byT.slice(6).map((m) => m.p));
  if (coolHalf > 1.8 * warmHalf && tColdest < 15) return 'mediterranean';
  if (tColdest >= 17 && lgp <= 4) return 'semi-arid';
  const max4 = Math.max(...months.map((_, i) => sum([0, 1, 2, 3].map((k) => months[(i + k) % 12]!.p))));
  if (max4 / annualP >= 0.65 && tWarmest >= 29 && tColdest >= 5 && tColdest < 20) return 'monsoon';
  if (tColdest >= 17 && lgp >= 9) return 'humid-tropics';
  if (tColdest >= 15) return lgp <= 4 ? 'semi-arid' : 'savanna';
  return 'subtropical';
}

/** Factor S de RUSLE (McCool et al. 1987): 1 ≈ pendiente del 9 %. */
export function slopeFactor(slopePct: number): number {
  const sin = Math.sin(Math.atan(slopePct / 100));
  return slopePct < 9 ? 10.8 * sin + 0.03 : 16.8 * sin - 0.5;
}

export type SiteExtras = {
  slopePct?: number | null;
  source: 'power' | 'template';
  waterTrend?: FieldInsights['waterTrend'] | null;
  /** Altitud real de la finca (m), para corregir la temperatura de la celda del clima. */
  farmElevationM?: number | null;
  /**
   * Rango diario medio por mes (°C, T2M_RANGE de la climatología de NASA POWER). Hace falta porque en la serie
   * mensual de POWER, T2M_MAX y T2M_MIN son los EXTREMOS del mes, no el promedio de las máximas y mínimas diarias.
   */
  dailyRangeC?: (number | null)[] | null;
};

/** Sin T2M_RANGE: el rango diario medio es ~la mitad del rango entre extremos del mes (comprobado en 5 sitios). */
const EXTREME_TO_DAILY_RANGE = 0.52;

/** Días al mes con máxima > 35 °C a partir de la máxima diaria media (dispersión diaria típica de 3 °C). */
function heatDaysFrom(meanTmax: number, days: number): number {
  const z = (35 - meanTmax) / 3;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const above = z > 0 ? p : 1 - p;
  return Math.round(days * above * 10) / 10;
}

export function buildSite(climate: ClimateProfile, at: { lat: number; lon: number }, extras: SiteExtras): Site {
  const sorted = [...climate.months].sort((a, b) => a.month - b.month);
  const cellElev = climate.location.elevationM;
  const farmElev = extras.farmElevationM ?? null;
  const dT = cellElev != null && farmElev != null ? (cellElev - farmElev) * LAPSE_C_PER_M : 0;
  const months: SiteMonth[] = sorted.map((c, i) => {
    const t = (c.tMean.value ?? 15) + dT;
    let tmax = (c.tMax.value ?? t - dT + 5) + dT;
    let tmin = (c.tMin.value ?? t - dT - 5) + dT;
    let heat = c.heatDays.value ?? 0;
    if (extras.source === 'power') {
      const range = extras.dailyRangeC?.[i] ?? (tmax - tmin) * EXTREME_TO_DAILY_RANGE;
      tmax = t + range / 2;
      tmin = t - range / 2;
      heat = heatDaysFrom(tmax, DAYS[c.month - 1]!);
    }
    const p = Math.max(0, c.precip.value ?? 0);
    return {
      month: c.month,
      t,
      tmax,
      tmin,
      p,
      peff: effectiveRain(p),
      et0: et0Hargreaves(at.lat, c.month, t, tmax, tmin),
      // Si la finca es más cálida que la celda, las heladas de la celda no aplican tal cual.
      frost: dT >= 2 && tmin > 2 ? 0 : (c.frostDays.value ?? (tmin < 0 ? 10 : 0)),
      heat,
      soil: c.soilMoisture.value,
      smAnom: c.soilMoistureAnomaly.value,
    };
  });

  const annualP = sum(months.map((m) => m.p));
  const annualEt0 = sum(months.map((m) => m.et0));
  const growing = months.map((m) => m.p >= 0.5 * m.et0 && m.t >= 5);
  const lgp = growing.filter(Boolean).length;
  const ts = months.map((m) => m.t);
  const sumP2 = sum(months.map((m) => m.p * m.p));
  const mfi = annualP > 0 ? sumP2 / annualP : 0;
  const erosivity: Level = mfi >= 120 ? 'high' : mfi >= 75 ? 'medium' : 'low';

  const base = {
    lat: at.lat,
    months,
    annualP,
    aridity: annualEt0 > 0 ? annualP / annualEt0 : 1,
    tAnnual: sum(ts) / 12,
    tColdest: Math.min(...ts),
    tWarmest: Math.max(...ts),
    lgp,
  };
  const zone = classify(base);
  const slopeKnown = extras.slopePct != null;
  const slopePct = extras.slopePct ?? (zone === 'tropical-highland' || zone === 'cold-highland' ? 15 : 4);

  return {
    ...base,
    lon: at.lon,
    elevationM: farmElev ?? climate.location.elevationM,
    annualEt0,
    growing,
    dryMonths: months.filter((m, i) => m.t >= 5 && !growing[i]).map((m) => m.month),
    frostMonths: months.filter((m) => m.frost >= 1).map((m) => m.month),
    heatMonths: months.filter((m) => m.heat >= 3 || m.tmax >= 34).map((m) => m.month),
    wetMonths: months.filter((m) => m.p - m.et0 > 150 || (m.p > 250 && (m.soil ?? 0) >= 80)).map((m) => m.month),
    leachMonths: months.filter((m) => m.p > m.et0).map((m) => m.month),
    mfi,
    erosivity,
    erosivity01: Math.max(0.05, Math.min(1, (mfi - 40) / 140)),
    slopePct,
    slopeKnown,
    zone,
    source: extras.source,
    precipChangePct: climate.summary.precipChangePct,
    tempChangeC: climate.summary.tempChangeC,
    waterTrend: extras.waterTrend ?? null,
  };
}

/** Riesgo de erosión del sitio (sin contar la cobertura): lluvia erosiva × pendiente, 0–1. */
export function siteErosionSeverity(site: Site): number {
  const rain = 1 - Math.exp(-1.2 * site.erosivity01 * slopeFactor(site.slopePct));
  // Viento y costra en meses secos sin cultivo (Sahel, zonas áridas): se suma aunque el terreno sea plano.
  const wind = site.zone === 'semi-arid' || site.zone === 'arid' ? 0.35 : site.zone === 'savanna' ? 0.15 : 0;
  return Math.min(1, rain + wind);
}
