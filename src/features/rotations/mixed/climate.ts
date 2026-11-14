import type { ClimateProfile, FarmerPriorities, SoilInfo } from '@/lib/api/contract';
import { cycleMonths, type CropTraits } from './traits';

/**
 * ¿Se da este cultivo con el clima de la finca y cuándo sembrarlo?
 * Usa el promedio mensual (NASA POWER: temperatura media, días con helada y lluvia) y busca el mes de siembra
 * con mejor ventana para el ciclo del cultivo.
 *
 *   mes      = temperatura (1 en la mitad central del rango, 0,75 en los bordes, 0 a 6 °C fuera)
 *              × heladas × meses muy lluviosos
 *   ventana  = promedio de los meses del ciclo × (0,35 + 0,65 × lluvia); si un mes es letal (helada fuerte,
 *              frío o calor extremo) la ventana vale 40 %: un cultivo que se muere a mitad de ciclo no cosecha
 *   lluvia   = (agua guardada en el suelo al sembrar + lluvia del ciclo) ÷ agua que pide el cultivo,
 *              llevada a 0–1 con (r − 0,4) ÷ 0,6. El suelo guarda ~100 mm (60 arenoso, 120 arcilloso); el riego suma
 */

export type MonthlyClimate = {
  tMean: (number | null)[];
  precip: (number | null)[];
  frost: (number | null)[];
  /** °C que se sumaron a la temperatura para llevarla a la altura de la finca (0 o ausente si no se ajustó). */
  shiftC?: number;
  /** Altura de la celda de datos (m), si se conoce. */
  sourceElevationM?: number | null;
};

/** Gradiente térmico estándar: la temperatura baja ~6,5 °C por cada 1000 m de altura. */
export const LAPSE_C_PER_M = 0.0065;

export type WaterContext = {
  irrigation: FarmerPriorities['constraints']['irrigation'];
  drainage?: SoilInfo['drainage'];
  texture?: SoilInfo['texture'];
};

/** Agua útil que el suelo tiene guardada al sembrar (mm): la arena guarda poco, la arcilla mucho. */
export function storedWater(w: WaterContext): number {
  return w.texture === 'sandy' ? 60 : w.texture === 'clay' ? 120 : 100;
}

/**
 * Clima mensual para el planificador. Las celdas de NASA POWER (0,5°) promedian la altura del terreno: en
 * montaña pueden estar cientos de metros más arriba o más abajo que la finca. Si conocemos la altura de la finca
 * (SRTM, vía el análisis) y difiere en más de 150 m, corregimos la temperatura con el gradiente estándar.
 */
export function monthlyClimate(c: ClimateProfile, farmElevationM?: number | null): MonthlyClimate {
  const sorted = [...c.months].sort((a, b) => a.month - b.month);
  const cell = c.location.elevationM;
  const diff = cell != null && farmElevationM != null ? cell - farmElevationM : 0;
  const shiftC = Math.abs(diff) > 150 ? Math.round(diff * LAPSE_C_PER_M * 10) / 10 : 0;
  return {
    tMean: sorted.map((m) => (m.tMean.value == null ? null : m.tMean.value + shiftC)),
    precip: sorted.map((m) => m.precip.value),
    // Más cálido: menos noches de helada (aprox.). Más frío: no inventamos heladas que el dato no muestra.
    frost: sorted.map((m) => (m.frostDays.value == null ? null : shiftC > 0 ? m.frostDays.value * Math.max(0, 1 - shiftC / 5) : m.frostDays.value)),
    shiftC,
    sourceElevationM: cell,
  };
}

/** Mes (1–12) desplazado n meses, cíclico. */
export const shiftMonth = (m: number, n: number) => ((((m - 1 + n) % 12) + 12) % 12) + 1;

export function monthScore(t: CropTraits, month: number, c: MonthlyClimate, w: WaterContext): number {
  const i = month - 1;
  const temp = c.tMean[i];
  let s = 0.7; // sin dato de temperatura: lo tomamos como "posible"
  if (temp != null) {
    const [lo, hi] = t.tempC;
    const d = temp < lo ? lo - temp : temp > hi ? temp - hi : 0;
    if (d > 0) s = Math.max(0, 0.75 * (1 - d / 6));
    else {
      // Dentro del rango: mejor cerca del centro (óptimo) que en los bordes.
      const center = (lo + hi) / 2;
      const quarter = (hi - lo) / 4;
      s = 1 - 0.25 * Math.min(1, Math.max(0, (Math.abs(temp - center) - quarter) / quarter));
    }
    // Los que aguantan helada (centeno, trigo, vicia…) pasan el frío quietos: no crecen, pero no se mueren.
    if (t.frostOk && temp < lo && temp >= lo - 15) s = Math.max(s, 0.6);
  }
  const frost = c.frost[i] ?? 0;
  if (!t.frostOk) s = Math.min(s, frost >= 5 ? 0 : frost >= 1 ? 0.5 : 1);
  const rain = c.precip[i];
  if (rain != null && rain > 220 && !t.wetOk) s *= 0.6;
  if (rain != null && rain > 180 && w.drainage === 'poor' && t.waterlog === 'low') s *= 0.7;
  return s;
}

export type Window = {
  /** Mes de siembra (1–12). */
  sow: number;
  /** Mes de cosecha (1–12; perennes: el mes antes de la siembra). */
  harvest: number;
  months: number[];
  /** 0–1 */
  score: number;
  /** Parte de temperatura y heladas (0–1). */
  temp: number;
  /** Lluvia suficiente (0–1; null si no hay dato de lluvia). */
  rain: number | null;
};

export function cropWindow(t: CropTraits, sow: number, c: MonthlyClimate, w: WaterContext): Window {
  const L = cycleMonths(t);
  const months = Array.from({ length: L }, (_, k) => shiftMonth(sow, k));
  const scores = months.map((m) => monthScore(t, m, c, w));
  const mean = scores.reduce((a, b) => a + b, 0) / L;
  const temp = Math.min(...scores) === 0 ? mean * 0.4 : mean;

  let rain: number | null = null;
  const values = months.map((m) => c.precip[m - 1]);
  if (values.every((v) => v != null)) {
    const stored = t.perennial ? 0 : storedWater(w);
    let r = (stored + values.reduce<number>((a, v) => a + (v ?? 0), 0)) / t.waterMm;
    if (t.drought === 'high') r *= 1.3;
    if (t.drought === 'low') r *= 0.9;
    if (w.irrigation === 'full') r = Math.max(r, 1.2);
    else if (w.irrigation === 'limited') r += 0.35;
    rain = Math.max(0, Math.min(1, (r - 0.4) / 0.6));
  }
  let score = temp * (0.35 + 0.65 * (rain ?? 0.75));
  // Sembrar en suelo seco cuesta: pequeña penalización si el mes de siembra casi no llueve y no hay riego.
  const first = c.precip[sow - 1];
  if (!t.perennial && w.irrigation === 'none' && first != null && first < 40) score -= 0.05;
  return { sow, harvest: months[L - 1]!, months, score: Math.max(0, Math.min(1, score)), temp, rain };
}

/** Mejor mes para sembrar (perennes: el año completo). */
export function bestWindow(t: CropTraits, c: MonthlyClimate, w: WaterContext): Window {
  if (t.perennial) return cropWindow(t, 1, c, w);
  let best: Window | null = null;
  for (let m = 1; m <= 12; m++) {
    const win = cropWindow(t, m, c, w);
    if (!best || win.score > best.score + 1e-9) best = win;
  }
  return best!;
}

/** Puntaje 0–100 del cultivo en este clima (con su mejor mes de siembra). */
export function climateFit(t: CropTraits, c: MonthlyClimate, w: WaterContext): number {
  return Math.round(bestWindow(t, c, w).score * 100);
}
