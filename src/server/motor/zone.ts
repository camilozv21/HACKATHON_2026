/**
 * Datos de la zona de la finca que el motor agronómico necesita, pedidos ANTES de llamar al motor.
 *
 * La zona no es el polígono: es el rectángulo de sus extremos (mín./máx. de longitud y latitud). Se toman las
 * esquinas y el centro de ese rectángulo, se buscan las celdas de NASA POWER que tocan (0,5° × 0,625°) y, si
 * son varias, para cada día queda el valor MÁXIMO entre celdas. Igual con la altura y la pendiente.
 *
 * Fuentes: NASA POWER diario (comunidad AG) y, en Colombia, la pendiente SRTM del municipio (zonas de riesgo,
 * Google Earth Engine). Solo servidor.
 */
import { loadTerrain } from '@/server/terrain/data';
import { locate } from '@/server/terrain/service';
import { memo } from '@/server/memo';
import type { MotorZone, ZoneDay } from '@/lib/api/motor';

export type Bbox = [west: number, south: number, east: number, north: number];

/** Parámetros diarios de POWER que usa el motor (ver docs/motor-api.md). */
export const ZONE_POWER_PARAMS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'RH2M', 'PRECTOTCORR', 'GWETROOT', 'GWETTOP', 'WS2M', 'ALLSKY_SFC_SW_DWN'] as const;
type ZoneParam = (typeof ZONE_POWER_PARAMS)[number];

/** Días de serie: suficiente para lluvia de 7 y 30 días, persistencia y tendencia. */
export const ZONE_DAYS = 90;
/** POWER publica con ~2–3 días de atraso. */
const LAG_DAYS = 3;

const CELL_LAT = 0.5;
const CELL_LON = 0.625;

const round = (n: number, d = 5) => Math.round(n * 10 ** d) / 10 ** d;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Rectángulo de los extremos de la finca. Un punto da un rectángulo de tamaño cero. */
export function bboxOf(geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'Polygon'; coordinates: [number, number][][] }): Bbox {
  if (geometry.type === 'Point') {
    const [x, y] = geometry.coordinates;
    return [x, y, x, y];
  }
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of geometry.coordinates[0] ?? []) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [round(w), round(s), round(e), round(n)];
}

export const bboxCenter = ([w, s, e, n]: Bbox): [number, number] => [round((w + e) / 2), round((s + n) / 2)];

/** Esquinas y centro del rectángulo (sin repetir: un punto da uno solo). */
export function samplePoints(b: Bbox): [number, number][] {
  const [w, s, e, n] = b;
  const pts: [number, number][] = [bboxCenter(b), [w, s], [w, n], [e, s], [e, n]];
  const seen = new Set<string>();
  return pts.filter(([x, y]) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Celda de NASA POWER (rejilla MERRA-2) que contiene el punto. */
export const powerCellOf = ([lon, lat]: [number, number]) =>
  `${Math.floor((lat + 90) / CELL_LAT)}:${Math.floor((lon + 180) / CELL_LON)}`;

/** Un punto por celda de POWER distinta dentro del rectángulo (casi siempre una sola). */
export function powerSamples(b: Bbox): { cell: string; point: [number, number] }[] {
  const out = new Map<string, [number, number]>();
  for (const p of samplePoints(b)) {
    const cell = powerCellOf(p);
    if (!out.has(cell)) out.set(cell, p);
  }
  return [...out].map(([cell, point]) => ({ cell, point }));
}

type CellSeries = { elevationM: number | null; days: Map<string, Partial<Record<ZoneParam, number>>> };

async function fetchCell([lon, lat]: [number, number], start: string, end: string): Promise<CellSeries> {
  const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  url.search = new URLSearchParams({
    parameters: ZONE_POWER_PARAMS.join(','),
    community: 'AG',
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start: start.replaceAll('-', ''),
    end: end.replaceAll('-', ''),
    format: 'JSON',
  }).toString();
  // Sin la señal de quien pidió: la llamada se comparte en la caché con otras fincas de la misma celda.
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`NASA POWER ${res.status}`);
  const raw = (await res.json()) as {
    geometry?: { coordinates?: number[] };
    header?: { fill_value?: number };
    properties?: { parameter?: Record<string, Record<string, number>> };
  };
  const p = raw.properties?.parameter;
  if (!p) throw new Error('NASA POWER sin datos');
  const fill = raw.header?.fill_value ?? -999;
  const days = new Map<string, Partial<Record<ZoneParam, number>>>();
  for (const param of ZONE_POWER_PARAMS) {
    for (const [k, v] of Object.entries(p[param] ?? {})) {
      if (typeof v !== 'number' || v === fill || v < -900) continue;
      const date = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
      const row = days.get(date) ?? {};
      row[param] = v;
      days.set(date, row);
    }
  }
  const elev = raw.geometry?.coordinates?.[2];
  return { elevationM: typeof elev === 'number' && elev > -500 ? Math.round(elev) : null, days };
}

const maxOf = (vals: (number | undefined)[]) => {
  const ok = vals.filter((v): v is number => typeof v === 'number');
  return ok.length ? Math.max(...ok) : null;
};
const mean = (vals: (number | null)[]) => {
  const ok = vals.filter((v): v is number => v != null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
};
const sum = (vals: (number | null)[]) => {
  const ok = vals.filter((v): v is number => v != null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) : null;
};
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

/** Pendiente y altura del terreno en Colombia: el máximo entre los municipios que tocan las esquinas. */
async function terrainOf(b: Bbox) {
  try {
    const terrain = await loadTerrain();
    let slope: number | null = null;
    let flat: number | null = null;
    const places: string[] = [];
    for (const [lon, lat] of samplePoints(b)) {
      const { mpio } = locate(terrain, lat, lon);
      if (!mpio || places.includes(mpio.name)) continue;
      places.push(mpio.name);
      const s = mpio.item.i.slope;
      if (s != null) slope = Math.max(slope ?? -Infinity, s);
      const f = mpio.item.i.flat;
      if (f != null) flat = Math.max(flat ?? -Infinity, f);
    }
    if (!places.length) return null;
    return { slopePct: r1(slope), flatPct: r1(flat), places, synthetic: terrain.meta.source !== 'gee' };
  } catch {
    return null;
  }
}

/**
 * Reúne los datos de la zona. Cada celda de POWER se cachea 6 h (las fincas vecinas comparten la llamada).
 * Si POWER no responde, la zona sale sin serie y el motor trabaja con lo que haya (y lo dice).
 */
export async function gatherZone(b: Bbox, opts: { now?: Date } = {}): Promise<MotorZone> {
  const now = opts.now ?? new Date();
  const endD = new Date(now.getTime() - LAG_DAYS * 86_400_000);
  const startD = new Date(endD.getTime() - (ZONE_DAYS - 1) * 86_400_000);
  const start = ymd(startD);
  const end = ymd(endD);
  const samples = powerSamples(b);

  const [cells, terrain] = await Promise.all([
    Promise.all(
      samples.map(({ cell, point }) =>
        memo(`motor-zone:${cell}:${start}:${end}`, 6 * 3_600_000, () => fetchCell(point, start, end)).catch(
          () => null,
        ),
      ),
    ),
    terrainOf(b),
  ]);
  const ok = cells.filter((c): c is CellSeries => c !== null);

  const dates = [...new Set(ok.flatMap((c) => [...c.days.keys()]))].sort();
  const days: ZoneDay[] = dates.map((date) => {
    const at = (p: ZoneParam) => maxOf(ok.map((c) => c.days.get(date)?.[p]));
    const soil = at('GWETROOT');
    const top = at('GWETTOP');
    return {
      date,
      t2m: r1(at('T2M')),
      tmax: r1(at('T2M_MAX')),
      tmin: r1(at('T2M_MIN')),
      rh: r1(at('RH2M')),
      precip: r1(at('PRECTOTCORR')),
      // GWET (0–1, fracción de poros con agua) → %.
      soilRoot: soil == null ? null : Math.round(soil * 100),
      soilTop: top == null ? null : Math.round(top * 100),
      wind: r1(at('WS2M')),
      solar: r1(at('ALLSKY_SFC_SW_DWN')),
    };
  });

  const last = (n: number) => days.slice(-n);
  const lastWith = (k: keyof ZoneDay) => [...days].reverse().find((d) => d[k] != null)?.[k] as number | undefined;

  return {
    bbox: b,
    center: bboxCenter(b),
    point: b[0] === b[2] && b[1] === b[3],
    powerCells: samples.length,
    powerCellsOk: ok.length,
    period: { start, end },
    days,
    summary: {
      temperature: r1(mean(last(7).map((d) => d.t2m))),
      tmax7d: maxOf(last(7).map((d) => d.tmax ?? undefined)),
      relativeHumidity: r1(mean(last(7).map((d) => d.rh))),
      rain7d: r1(sum(last(7).map((d) => d.precip))),
      rain30d: r1(sum(last(30).map((d) => d.precip))),
      soilMoisture: lastWith('soilRoot') ?? null,
      elevationM: maxOf(ok.map((c) => c.elevationM ?? undefined)),
      slopePct: terrain?.slopePct ?? null,
      flatPct: terrain?.flatPct ?? null,
    },
    terrain: terrain ? { places: terrain.places, synthetic: terrain.synthetic } : null,
  };
}
