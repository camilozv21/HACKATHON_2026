/**
 * Reglas de los minijuegos de inicio (puras, sin React): números de juguete pero con la física correcta, para que
 * cada reto enseñe la relación real (más sol y viento = más evapotranspiración, noche despejada y en calma = helada…).
 * Todos los valores van en métrico (mm, °C, %); la vista los convierte con useUnits().
 */

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

/* ── 1. NDVI: visión satélite ─────────────────────────────────────────────────────────────────────────────── */

/** Verdor de los 9 lotes (3×3). A simple vista todos se ven igual de verdes. */
export const NDVI_LOTS = [0.81, 0.77, 0.34, 0.84, 0.72, 0.79, 0.29, 0.83, 0.38] as const;
/** Por debajo de este verdor el lote tiene estrés (sed, plaga o suelo desnudo). */
export const NDVI_STRESS = 0.45;
export const isStressed = (ndvi: number) => ndvi < NDVI_STRESS;
export const ndviClass = (ndvi: number): 'low' | 'mid' | 'high' => (ndvi < NDVI_STRESS ? 'low' : ndvi < 0.65 ? 'mid' : 'high');
export const STRESSED_LOTS = NDVI_LOTS.flatMap((v, i) => (isStressed(v) ? [i] : []));

/* ── 2. Evapotranspiración: el campo suda ─────────────────────────────────────────────────────────────────── */

export type EtWeather = { sun: boolean; wind: boolean; bare: boolean };
/** mm por día: el sol pone la energía, el viento se lleva el vapor y el suelo desnudo evapora más que el cubierto. */
export const etPerDay = ({ sun, wind, bare }: EtWeather) => 1 + (sun ? 3 : 1) + (wind ? 1.5 : 0) + (bare ? 1.5 : 0.3);
export const ET_START: EtWeather = { sun: false, wind: false, bare: false };
export const ET_WORST: EtWeather = { sun: true, wind: true, bare: true };
export const ET_MAX = etPerDay(ET_WORST);
/** Lo que se ahorra al día al cubrir el suelo (mismo sol y viento). */
export const ET_COVER_SAVING = etPerDay(ET_WORST) - etPerDay({ ...ET_WORST, bare: false });

/* ── 3. Balance de agua: la cuenta del agua ───────────────────────────────────────────────────────────────── */

export type BalanceRound = {
  id: 'dry' | 'wet';
  /** Lluvia del mes (GPM), mm. */
  rain: number;
  /** Evapotranspiración del mes, mm. */
  out: number;
  /** Riego con el que empieza la ronda (la costumbre), mm. */
  irrigation: number;
  /** ¿Se puede cubrir el suelo en esta ronda? */
  cover: boolean;
};

export const BALANCE_ROUNDS: readonly BalanceRound[] = [
  // Mes seco: hay que regar (o regar menos si cubre el suelo).
  { id: 'dry', rain: 40, out: 120, irrigation: 0, cover: true },
  // Mes de lluvias: la costumbre de regar 60 mm encharca; la respuesta es no regar.
  { id: 'wet', rain: 140, out: 110, irrigation: 60, cover: false },
];
export const IRRIGATION_STEP = 20;
export const IRRIGATION_MAX = 120;
export const COVER_SAVING = 20;
/** Franja buena del balance (mm): ni seco ni encharcado. */
export const BALANCE_OK = { min: -10, max: 30 } as const;

export const waterBalance = (r: Pick<BalanceRound, 'rain' | 'out'>, irrigation: number, covered: boolean) =>
  r.rain + irrigation - (r.out - (covered ? COVER_SAVING : 0));
export const balanceVerdict = (b: number): 'dry' | 'ok' | 'wet' => (b < BALANCE_OK.min ? 'dry' : b > BALANCE_OK.max ? 'wet' : 'ok');
/** Nivel del tanque (0–100 %): la franja verde va de 45 a 65 %. */
export const tankLevel = (b: number) => clamp(50 + b / 2, 4, 100);
export const TANK_BAND = { min: tankLevel(BALANCE_OK.min), max: tankLevel(BALANCE_OK.max) } as const;

/* ── 4. Anomalía de humedad del suelo: ¿seco para quién? ──────────────────────────────────────────────────── */

export type AnomalyAnswer = 'drier' | 'normal' | 'wetter';
/** Humedad del suelo (% de agua en volumen) hoy y lo normal de ese mes. Dos tarjetas son trampa a propósito. */
export const ANOMALY_CARDS = [
  { id: 'boyaca', now: 18, normal: 30 },
  { id: 'guajira', now: 8, normal: 8 },
  { id: 'choco', now: 40, normal: 52 },
  { id: 'llanos', now: 38, normal: 28 },
] as const;
export type AnomalyCardId = (typeof ANOMALY_CARDS)[number]['id'];
export const ANOMALY_SCALE_MAX = 60;

export function classifyAnomaly(now: number, normal: number): AnomalyAnswer {
  const d = now - normal;
  return d <= -4 ? 'drier' : d >= 4 ? 'wetter' : 'normal';
}

/* ── 5. Riesgo de helada: la noche más fría ───────────────────────────────────────────────────────────────── */

export type FrostNight = { clear: boolean; calm: boolean; hollow: boolean };
export const FROST_START: FrostNight = { clear: false, calm: false, hollow: false };
/** °C al amanecer: sin nubes el calor se escapa, sin viento el frío se asienta y el aire frío baja a la hondonada. */
export const dawnTemp = ({ clear, calm, hollow }: FrostNight) => 8 - (clear ? 4 : 0) - (calm ? 3 : 0) - (hollow ? 2 : 0);
export const frostRisk = (t: number): 'low' | 'high' | 'frost' => (t < 0 ? 'frost' : t <= 4 ? 'high' : 'low');
export const FROST_SCALE = { min: -4, max: 12 } as const;
export const FROST_OPTIONS = ['wait', 'cover', 'fertilize'] as const;
export const FROST_BEST: (typeof FROST_OPTIONS)[number] = 'cover';

/* ── 6. Satélite y campo: detective del suelo ─────────────────────────────────────────────────────────────── */

export const SENSOR_COLS = 4;
export const SENSOR_ROWS = 3;
export const SENSOR_CELLS = SENSOR_COLS * SENSOR_ROWS;
export const MAX_SENSORS = 3;
/** Humedad real por columna (el río está a la izquierda) y un poco de variación por fila. */
const COLUMN_TRUTH = [36, 27, 17, 10];
const ROW_OFFSET = [1, 0, -1];

export const truthAt = (i: number) => COLUMN_TRUTH[i % SENSOR_COLS]! + ROW_OFFSET[Math.floor(i / SENSOR_COLS)]!;
/** El satélite ve toda la finca en un solo cuadro: el promedio. */
export const SATELLITE_MEAN = Math.round(
  Array.from({ length: SENSOR_CELLS }, (_, i) => truthAt(i)).reduce((a, b) => a + b, 0) / SENSOR_CELLS,
);

/**
 * Estimación de un lote al juntar satélite y sensores: donde hay sensor, el dato exacto; lejos de los sensores, la
 * estimación se va pareciendo al promedio del satélite (más lejos = más parecida al promedio). Así el orden de los
 * lotes se conserva y el más seco siempre se ve como el más seco.
 */
export function combinedEstimate(i: number, probes: readonly number[]): number {
  if (probes.includes(i)) return truthAt(i);
  if (probes.length === 0) return SATELLITE_MEAN;
  const col = i % SENSOR_COLS;
  const d = Math.min(...probes.map((p) => Math.abs((p % SENSOR_COLS) - col)));
  const pull = Math.min(0.6, 0.15 * d);
  return Math.round(truthAt(i) + (SATELLITE_MEAN - truthAt(i)) * pull);
}

/** Precisión del mapa (%): solo satélite 35; cada columna distinta con sensor suma 20 (máx. 95). */
export function precision(probes: readonly number[]): number {
  const cols = new Set(probes.map((p) => p % SENSOR_COLS)).size;
  return Math.min(95, 35 + 20 * cols);
}
export const SATELLITE_PRECISION = precision([]);
/** El lote que más necesita agua: cualquiera de la columna más lejana al río. */
export const isDriest = (i: number) => i % SENSOR_COLS === SENSOR_COLS - 1;

/* ── 7. La temporada: vulnerabilidad del cultivo y salud del suelo ────────────────────────────────────────── */

export type Gauges = { temp: number; moisture: number; rain: number; et: number; ndvi: number };
export type GaugeKey = keyof Gauges;
/** Qué misión mide cada dato (el aviso dice de dónde viene). */
export const GAUGE_MISSION: Record<GaugeKey, string> = { temp: 'NASA POWER', moisture: 'SMAP', rain: 'GPM', et: 'ECOSTRESS', ndvi: 'MODIS' };
export type SeasonOption = { id: string; crop: number; soil: number; best?: boolean };
/** `focus`: los 1–3 datos del satélite que importan en ese momento (los únicos que se muestran, como avisos). */
export type SeasonTurn = { id: 'storm' | 'heat' | 'stress' | 'harvest'; gauges: Gauges; focus: readonly GaugeKey[]; options: readonly SeasonOption[] };

/** 4 momentos de la temporada. La mejor opción cambia de lugar en cada turno. */
export const SEASON_TURNS: readonly SeasonTurn[] = [
  {
    id: 'storm',
    gauges: { temp: 22, moisture: 48, rain: 90, et: 2, ndvi: 0.3 },
    focus: ['rain', 'ndvi'],
    options: [
      { id: 'plow', crop: -5, soil: -20 },
      { id: 'cover', crop: 5, soil: 15, best: true },
      { id: 'nothing', crop: 0, soil: -10 },
    ],
  },
  {
    id: 'heat',
    gauges: { temp: 36, moisture: 12, rain: 0, et: 7, ndvi: 0.55 },
    focus: ['temp', 'moisture', 'et'],
    options: [
      { id: 'noon', crop: 5, soil: 0 },
      { id: 'fertilize', crop: -15, soil: -5 },
      { id: 'dawn', crop: 15, soil: 5, best: true },
    ],
  },
  {
    id: 'stress',
    gauges: { temp: 29, moisture: 18, rain: 10, et: 5, ndvi: 0.38 },
    focus: ['ndvi'],
    options: [
      { id: 'spray', crop: -5, soil: -10 },
      { id: 'scout', crop: 10, soil: 0, best: true },
      { id: 'ignore', crop: -15, soil: 0 },
    ],
  },
  {
    id: 'harvest',
    gauges: { temp: 24, moisture: 25, rain: 30, et: 3, ndvi: 0.2 },
    focus: ['ndvi'],
    options: [
      { id: 'repeat', crop: 0, soil: -10 },
      { id: 'burn', crop: 0, soil: -25 },
      { id: 'legume', crop: 5, soil: 20, best: true },
    ],
  },
];

export type Health = { crop: number; soil: number };
export const SEASON_START: Health = { crop: 60, soil: 55 };
export const applyChoice = (h: Health, o: SeasonOption): Health => ({ crop: clamp(h.crop + o.crop), soil: clamp(h.soil + o.soil) });
export const vulnerability = (crop: number): 'low' | 'medium' | 'high' => (crop >= 70 ? 'low' : crop >= 45 ? 'medium' : 'high');
export const soilStatus = (soil: number): 'good' | 'fair' | 'poor' => (soil >= 70 ? 'good' : soil >= 45 ? 'fair' : 'poor');
export const optionTone = (o: SeasonOption): 'ok' | 'info' | 'bad' => (o.best ? 'ok' : o.crop + o.soil >= 0 ? 'info' : 'bad');
