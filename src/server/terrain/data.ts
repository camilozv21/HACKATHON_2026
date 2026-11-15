/**
 * Datos de la API del terreno: los mismos JSON que usa el globo (`public/geo/`, generados por
 * `scripts/build-terrain-co.mjs` desde Google Earth Engine) más los límites del DANE para ubicar un punto.
 * Se leen del disco una vez por proceso y se guardan en memoria (son ~1,4 MB en total).
 *
 * En Vercel, `outputFileTracingIncludes` (next.config.ts) copia estos archivos junto a las funciones de /api/terrain.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAdminIndex, type AdminIndex, type Topology } from '@/features/region/admin';
import { LAND_STATES } from '@/features/terrain/kinds';
import { fromJoint, normalize, project, summarize, type Matrix, type Vec } from '@/features/terrain/markov';
import { scoreTerrain, type TerrainRisk } from '@/features/terrain/score';
import type { BBox } from '@/lib/bbox';
import { TerrainDetail, TerrainIndex, dptoOf, type TerrainItem } from '@/lib/api/terrain';
import { memo } from '@/server/memo';
import type { Row } from './fields';

const GEO_DIR = path.join(process.cwd(), 'public', 'geo');
/** Los archivos cambian solo al regenerarlos y desplegar; en desarrollo, a los 10 min se vuelven a leer. */
const TTL_MS = 10 * 60_000;
/** Máximo de pasos de la cadena hacia adelante (3 × 7 años ≈ 2045). Más allá la suposición ya no se sostiene. */
export const MAX_PROJECTION_STEPS = 3;

export type Place = {
  code: string;
  level: 'mpio' | 'dpto';
  name: string;
  dpto: string;
  dptoName: string;
  lat: number;
  lon: number;
  bbox: BBox;
  item: TerrainItem;
  risk: TerrainRisk;
  /** Campos planos de alcance `place` (ver fields.ts), ya redondeados. */
  row: Row;
};

export type TerrainMeta = Omit<TerrainIndex, 'items'>;

export type Terrain = {
  meta: TerrainMeta;
  places: Place[];
  byCode: Map<string, Place>;
  mpio: AdminIndex;
  dpto: AdminIndex;
};

/** Un año de la línea de tiempo de un lugar: fracciones (0–1) en el orden de LAND_STATES. */
export type TimePoint = { year: number; kind: 'observed' | 'projected'; shares: Vec };

export type PlaceDynamics = {
  /** Matriz de transición del periodo inicial al final (filas suman 1). */
  P: Matrix;
  p0: Vec;
  p1: Vec;
  timeline: TimePoint[];
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(GEO_DIR, file), 'utf8'));
}

/** Matriz identidad: `summarize` solo necesita p0 y p1 para la tendencia. */
const IDENTITY: Matrix = LAND_STATES.map((_, i) => LAND_STATES.map((__, j) => (i === j ? 1 : 0)));

function placeRow(p: Omit<Place, 'row'>): Row {
  const { item, risk } = p;
  const p0 = normalize(item.p0);
  const p1 = normalize(item.p1);
  const row: Row = {
    code: p.code,
    level: p.level,
    name: p.name,
    dpto: p.dpto,
    dptoName: p.dptoName,
    lat: r4(p.lat),
    lon: r4(p.lon),
    areaKm2: item.a,
    distanceKm: null,
    validShare: item.v,
    confidence: risk.confidence,
    ...item.i,
  };
  LAND_STATES.forEach((s, i) => {
    row[`${s}Initial`] = r3(p0[i]!);
    row[`${s}Final`] = r3(p1[i]!);
    row[`${s}Change`] = r3(p1[i]! - p0[i]!);
  });
  row.riskScore = risk.all.score;
  row.riskLevel = risk.all.level;
  row.riskTop = risk.all.top;
  for (const [h, res] of Object.entries(risk.hazards)) {
    row[`${h}Risk`] = res.score;
    row[`${h}Level`] = res.level;
  }
  row.trend = summarize(p0, p1, IDENTITY).trend;
  return row;
}

/** Índice del terreno + límites, con un registro por municipio y departamento. */
export function loadTerrain(): Promise<Terrain> {
  return memo('terrain-api:index', TTL_MS, async () => {
    const [rawIndex, rawMpio, rawDpto] = await Promise.all([
      readJson('terrain-co.json'),
      readJson('co-mpio.json'),
      readJson('co-dpto.json'),
    ]);
    const index = TerrainIndex.parse(rawIndex);
    const mpio = buildAdminIndex('mpio', rawMpio as Topology);
    const dpto = buildAdminIndex('dpto', rawDpto as Topology);
    const synthetic = index.source === 'synthetic';

    const places: Place[] = [];
    for (const [code, item] of Object.entries(index.items)) {
      const area = (code.length === 2 ? dpto : mpio).byCode.get(code);
      // Sin límite no hay ubicación ni nombre: no se publica.
      if (!area) continue;
      const base = {
        code,
        level: area.level,
        name: area.name,
        dpto: dptoOf(code),
        dptoName: dpto.byCode.get(dptoOf(code))?.name ?? area.parentName ?? '',
        lat: area.label[1],
        lon: area.label[0],
        bbox: area.bbox,
        item,
        risk: scoreTerrain(item, { synthetic }),
      };
      places.push({ ...base, row: placeRow(base) });
    }
    places.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    const { items: _items, ...meta } = index;
    return { meta, places, byCode: new Map(places.map((p) => [p.code, p])), mpio, dpto };
  });
}

/** Detalle de un departamento (matriz de cambios y serie anual). null si el archivo no existe. */
function loadDetail(dpto: string): Promise<TerrainDetail | null> {
  if (!/^\d{2}$/.test(dpto)) return Promise.resolve(null);
  return memo(`terrain-api:detail:${dpto}`, TTL_MS, async () => {
    try {
      return TerrainDetail.parse(await readJson(path.join('terrain', `${dpto}.json`)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  });
}

/** Año central del periodo final: de ahí arranca la proyección. */
export function finalCenter(meta: TerrainMeta): number {
  return Math.round((meta.periods.final.years[0] + meta.periods.final.years[1]) / 2);
}

/** Años con dato: la serie observada y los pasos de la proyección. */
export function availableYears(meta: TerrainMeta): { observed: number[]; projected: number[] } {
  const start = finalCenter(meta);
  return {
    observed: [...meta.periods.years],
    projected: Array.from({ length: MAX_PROJECTION_STEPS }, (_, k) => start + (k + 1) * meta.periods.stepYears),
  };
}

function dynamicsOf(meta: TerrainMeta, d: TerrainDetail['items'][string]): PlaceDynamics {
  const { P, p0, p1 } = fromJoint(d.t);
  const observed: TimePoint[] = meta.periods.years.map((year, i) => ({
    year,
    kind: 'observed',
    shares: normalize(d.y[i] ?? [0, 0, 0, 0]).map(r3),
  }));
  const { projected } = availableYears(meta);
  const future: TimePoint[] = projected.map((year, k) => ({
    year,
    kind: 'projected',
    shares: project(p1, P, k + 1).map(r3),
  }));
  return { P, p0, p1, timeline: [...observed, ...future] };
}

/** Matriz y línea de tiempo de varios lugares (carga solo los departamentos que hacen falta). */
export async function loadDynamics(terrain: Terrain, codes: Iterable<string>): Promise<Map<string, PlaceDynamics>> {
  const wanted = [...new Set(codes)];
  const dptos = [...new Set(wanted.map(dptoOf))];
  const details = new Map(await Promise.all(dptos.map(async (d) => [d, await loadDetail(d)] as const)));
  const out = new Map<string, PlaceDynamics>();
  for (const code of wanted) {
    const d = details.get(dptoOf(code))?.items[code];
    if (d) out.set(code, dynamicsOf(terrain.meta, d));
  }
  return out;
}
