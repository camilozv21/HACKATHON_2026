/**
 * Datos del terreno de Colombia por municipio y departamento: indicadores de riesgo y estados del terreno
 * (cadena de Markov). Son JSON estáticos que genera `node scripts/build-terrain-co.mjs`, a partir del export de
 * Google Earth Engine (`scripts/gee/terrain-co.js`) o, sin él, de un set sintético marcado `source: "synthetic"`.
 *
 *   /geo/terrain-co.json         índice para la capa del mapa (todos los municipios y departamentos)
 *   /geo/terrain/<dpto>.json     matriz de cambios y serie anual de los municipios de un departamento
 *
 * Formato y método: docs/terrain-risk.md. Las fracciones vienen en milésimas (0–1000) para que el archivo pese poco.
 */
import { z } from 'zod';

const Code = z.string().regex(/^\d{2}(\d{3})?$/);
const Num = z.number().finite();
const Opt = Num.nullable();
/** Cuatro fracciones en milésimas, en el orden de LAND_STATES (sana, con estrés, expuesta, agua). */
const Shares = z.array(z.number().min(0).max(1000)).length(4);

export const TerrainIndicators = z.object({
  /** Humedad del suelo en la zona de raíces, 2023–2025 frente a 2016–2022 (% de diferencia). SMAP L4. */
  smAnom: Opt,
  /** Parte del tiempo con el suelo casi saturado (%). SMAP L4. */
  smWet: Opt,
  /** Lluvia 2023–2025 frente a lo normal 2001–2022 (% de diferencia). GPM IMERG. */
  pAnom: Opt,
  /** Días al año con más de 50 mm de lluvia. GPM IMERG. */
  pHeavy: Opt,
  /** Índice de Fournier modificado (lluvia que erosiona, mm). GPM IMERG. */
  mfi: Opt,
  /** Evapotranspiración real / potencial (0–1): bajo = las plantas no consiguen el agua que piden. MODIS. */
  etRatio: Opt,
  /** Parte de las semanas con la superficie de día por encima de 35 °C (%). MODIS LST. */
  lstHot: Opt,
  /** Temperatura de superficie 2023–2025 frente a 2016–2022 (°C). MODIS LST. */
  lstAnom: Opt,
  /** Tendencia del agua guardada en el suelo y el subsuelo (cm/año). GRACE/GRACE-FO, celda de ~300 km. */
  gwTrend: Opt,
  /** Pendiente mediana (%). SRTM. */
  slope: Opt,
  /** Parte del área baja y plana, pendiente < 2 % (%). SRTM. */
  flat: Opt,
  /** Tendencia del NDVI por década (pendiente de Sen). MODIS. */
  ndviTrend: Opt,
  /** Parte del área que tenía plantas y pasó a suelo expuesto (%). Matriz de Markov. */
  toBare: Opt,
});
export type TerrainIndicators = z.infer<typeof TerrainIndicators>;

export const TerrainItem = z.object({
  /** Área (km²). */
  a: Num.min(0),
  /** Fracción de píxeles con dato válido (nubes, ciudades y nieve fuera). */
  v: Num.min(0).max(1),
  /** Estado inicial y estado final (milésimas). */
  p0: Shares,
  p1: Shares,
  i: TerrainIndicators,
});
export type TerrainItem = z.infer<typeof TerrainItem>;

const Period = z.object({ label: z.string(), years: z.tuple([z.number().int(), z.number().int()]) });

export const TerrainIndex = z.object({
  version: z.literal(1),
  source: z.enum(['gee', 'synthetic']),
  generatedAt: z.string(),
  periods: z.object({
    initial: Period,
    final: Period,
    /** Años de la serie anual (detalle). */
    years: z.array(z.number().int()).min(2),
    /** Años entre el centro del periodo inicial y el del final: un paso de la cadena. */
    stepYears: z.number().int().min(1),
  }),
  datasets: z.array(z.string()),
  items: z.record(Code, TerrainItem),
});
export type TerrainIndex = z.infer<typeof TerrainIndex>;

export const TerrainDetailItem = z.object({
  /** Fracción del área en cada pareja (estado inicial i → estado final j), fila por fila: 16 valores (milésimas). */
  t: z.array(z.number().min(0).max(1000)).length(16),
  /** Estado de cada año de `periods.years` (milésimas por estado). */
  y: z.array(Shares),
});
export type TerrainDetailItem = z.infer<typeof TerrainDetailItem>;

export const TerrainDetail = z.object({
  version: z.literal(1),
  source: z.enum(['gee', 'synthetic']),
  dpto: z.string().regex(/^\d{2}$/),
  items: z.record(Code, TerrainDetailItem),
});
export type TerrainDetail = z.infer<typeof TerrainDetail>;

export const TERRAIN_INDEX_URL = '/geo/terrain-co.json';
export const terrainDetailUrl = (dpto: string) => `/geo/terrain/${dpto}.json`;

export const terrainKeys = {
  index: ['terrain', 'index'] as const,
  detail: (dpto: string) => ['terrain', 'detail', dpto] as const,
};

async function getJson<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`terrain: HTTP ${res.status}`);
  return schema.parse(await res.json());
}

let indexPromise: Promise<TerrainIndex> | null = null;

/** Índice (una sola descarga por sesión; si falla, el próximo intento vuelve a pedirlo). */
export function fetchTerrainIndex(): Promise<TerrainIndex> {
  if (!indexPromise) {
    indexPromise = getJson(TERRAIN_INDEX_URL, TerrainIndex);
    indexPromise.catch(() => {
      indexPromise = null;
    });
  }
  return indexPromise;
}

export function fetchTerrainDetail(dpto: string, signal?: AbortSignal): Promise<TerrainDetail> {
  return getJson(terrainDetailUrl(dpto), TerrainDetail, signal);
}

/** Departamento de un código DIVIPOLA (2 primeros dígitos). */
export const dptoOf = (code: string) => code.slice(0, 2);
