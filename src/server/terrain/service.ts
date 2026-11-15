/**
 * Consultas de la API del terreno. Devuelven objetos planos; las rutas (`src/app/api/terrain/**`) solo los
 * convierten en JSON, CSV o GeoJSON. Formato y ejemplos: docs/terrain-api.md.
 */
import { findAdminAt, type AdminArea } from '@/features/region/admin';
import { LAND_STATES } from '@/features/terrain/kinds';
import { stationary, summarize } from '@/features/terrain/markov';
import { dptoOf } from '@/lib/api/terrain';
import {
  availableYears,
  loadDynamics,
  loadTerrain,
  type Place,
  type PlaceDynamics,
  type Terrain,
  type TerrainMeta,
  type TimePoint,
} from './data';
import { PLACE_FIELDS, TIME_FIELDS, type Row } from './fields';
import { QueryError, fold, matchesAll, pick, sortRows, type Lang, type Query, type SortKey } from './query';

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const msg = (lang: Lang, es: string, en: string) => (lang === 'en' ? en : es);

export const DEFAULT_SERIES_FIELDS = ['code', 'name', 'level', 'year', 'kind', ...LAND_STATES] as const;

// ---------------------------------------------------------------- honestidad

/** Lo que toda respuesta recuerda: de dónde sale el dato y qué no dice. */
export function caveats(lang: Lang, meta: TerrainMeta): string[] {
  const list =
    lang === 'en'
      ? [
          'Averages for a municipality or department, not a single farm.',
          'Projected years (kind = projected) assume land changes keep the 2016–2018 → 2023–2025 pace.',
          'GRACE sees ~300 km cells: gwTrend is a regional trend.',
          'NDVI does not tell forest from a healthy crop; a freshly ploughed field counts as bare soil.',
          'MODIS Terra orbit drift lowers daytime land temperature since 2020: lstAnom underestimates heat.',
          "This tool supports, and does not replace, the farmer's judgement or local experts.",
        ]
      : [
          'Promedios del municipio o departamento, no de una finca.',
          'Los años proyectados (kind = projected) suponen que los cambios de 2016–2018 → 2023–2025 siguen igual.',
          'GRACE ve celdas de ~300 km: gwTrend es una tendencia regional.',
          'El NDVI no distingue bosque de cultivo sano; un potrero recién arado cuenta como suelo expuesto.',
          'La deriva de MODIS Terra baja la temperatura de superficie de día desde 2020: lstAnom subestima el calor.',
          'La herramienta apoya, no reemplaza, el criterio del agricultor ni a los técnicos locales.',
        ];
  if (meta.source === 'synthetic')
    list.unshift(
      msg(lang, 'Datos SIMULADOS para la demo: no son mediciones.', 'SIMULATED data for the demo: these are not measurements.'),
    );
  return list;
}

export function baseMeta(terrain: Terrain, q: Query) {
  return {
    source: terrain.meta.source,
    generatedAt: terrain.meta.generatedAt,
    periods: terrain.meta.periods,
    years: availableYears(terrain.meta),
    query: {
      filters: q.filters.map((f) => ({ field: f.field.name, op: f.op, value: f.value })),
      sort: q.sort.map((s) => (s.desc ? `-${s.field}` : s.field)),
      fields: q.fields,
      q: q.q,
      point: q.point,
      bbox: q.bbox,
      near: q.near,
      year: q.year,
      from: q.from,
      to: q.to,
    },
    caveats: caveats(q.lang, terrain.meta),
  };
}

// ---------------------------------------------------------------- ubicación

const intersects = (a: readonly number[], b: readonly number[]) =>
  a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;

/**
 * Distancia (km) de un punto al límite de un área; 0 si cae dentro. Proyección equirectangular local: el error es
 * pequeño a las distancias que se piden (≤ 1000 km). Primero descarta por la caja, que es barato.
 */
export function distanceToAreaKm(area: AdminArea, lat: number, lon: number, maxKm = Infinity): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const [w, s, e, n] = area.bbox;
  const boxKm = Math.hypot(Math.max(w - lon, 0, lon - e) * kx, Math.max(s - lat, 0, lat - n) * ky);
  if (boxKm > maxKm) return boxKm;
  let min = Infinity;
  for (const poly of area.polygons) {
    let inside = false;
    poly.forEach((ring, ri) => {
      let inRing = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = (ring[j]![0] - lon) * kx;
        const ay = (ring[j]![1] - lat) * ky;
        const bx = (ring[i]![0] - lon) * kx;
        const by = (ring[i]![1] - lat) * ky;
        // Punto en polígono (rayo hacia +x desde el origen, que es el punto).
        if (by > 0 !== ay > 0 && 0 < ((ax - bx) * (0 - by)) / (ay - by) + bx) inRing = !inRing;
        // Distancia del origen al segmento a–b.
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < min) min = d;
      }
      // El primer anillo es el exterior; los demás, huecos.
      if (ri === 0) inside = inRing;
      else if (inRing) inside = false;
    });
    if (inside) return 0;
  }
  return min;
}

/** Municipio y departamento que contienen el punto (punto en polígono sobre los límites del DANE). */
export function locate(terrain: Terrain, lat: number, lon: number): { mpio: Place | null; dpto: Place | null } {
  const m = findAdminAt(terrain.mpio, lon, lat);
  const d = findAdminAt(terrain.dpto, lon, lat);
  const mpio = m ? (terrain.byCode.get(m.code) ?? null) : null;
  const dpto = (d && terrain.byCode.get(d.code)) || (mpio && terrain.byCode.get(dptoOf(mpio.code))) || null;
  return { mpio, dpto };
}

function nearest(terrain: Terrain, lat: number, lon: number, maxKm: number) {
  let best: Place | null = null;
  let bestKm = Infinity;
  for (const p of terrain.places) {
    const area = p.level === 'mpio' ? terrain.mpio.byCode.get(p.code) : undefined;
    if (!area) continue;
    const km = distanceToAreaKm(area, lat, lon, Math.min(maxKm, bestKm));
    if (km < bestKm) [best, bestKm] = [p, km];
  }
  return best && bestKm <= maxKm ? { code: best.code, name: best.name, dptoName: best.dptoName, distanceKm: r1(bestKm) } : null;
}

/** Lugares que cumplen la ubicación (punto, caja, cercanía, texto) y los filtros de alcance `place`. */
export function selectPlaces(terrain: Terrain, q: Query): { place: Place; row: Row }[] {
  let candidates: Place[] = terrain.places;
  if (q.point) {
    const { mpio, dpto } = locate(terrain, q.point.lat, q.point.lon);
    candidates = [dpto, mpio].filter((p): p is Place => p != null);
  }
  if (q.bbox) candidates = candidates.filter((p) => intersects(p.bbox, q.bbox!));
  if (q.q) {
    const tokens = fold(q.q).split(/\s+/).filter(Boolean);
    candidates = candidates.filter((p) => {
      const hay = fold(`${p.name} ${p.dptoName}`);
      return tokens.every((t) => hay.includes(t));
    });
  }
  const placeFilters = q.filters.filter((f) => f.field.scope === 'place');
  const out: { place: Place; row: Row }[] = [];
  for (const place of candidates) {
    let row = place.row;
    if (q.near) {
      const area = (place.level === 'mpio' ? terrain.mpio : terrain.dpto).byCode.get(place.code);
      const km = area ? distanceToAreaKm(area, q.near.lat, q.near.lon, q.near.radiusKm) : Infinity;
      if (km > q.near.radiusKm) continue;
      row = { ...row, distanceKm: r1(km) };
    }
    if (matchesAll(row, placeFilters)) out.push({ place, row });
  }
  return out;
}

// ---------------------------------------------------------------- tiempo

/** Años pedidos: `year`, o el rango from–to (por defecto, la serie observada). Valida contra los años con dato. */
export function resolveYears(meta: TerrainMeta, q: Query): number[] {
  const { observed, projected } = availableYears(meta);
  const all = [...observed, ...projected];
  const hint = { observed, projected };
  if (q.year != null) {
    if (!all.includes(q.year))
      throw new QueryError(
        'invalid-year',
        msg(
          q.lang,
          `No hay datos de ${q.year}. Hay ${observed[0]}–${observed.at(-1)} (observado) y ${projected.join(', ')} (proyección).`,
          `No data for ${q.year}. Available: ${observed[0]}–${observed.at(-1)} (observed) and ${projected.join(', ')} (projection).`,
        ),
        hint,
      );
    return [q.year];
  }
  const from = q.from ?? observed[0]!;
  const to = q.to ?? observed.at(-1)!;
  const years = all.filter((y) => y >= from && y <= to);
  if (!years.length)
    throw new QueryError('no-years', msg(q.lang, `No hay años con dato entre ${from} y ${to}.`, `No years with data between ${from} and ${to}.`), hint);
  return years;
}

function timeRow(tp: TimePoint): Row {
  const row: Row = { year: tp.year, kind: tp.kind };
  LAND_STATES.forEach((s, i) => (row[s] = tp.shares[i] ?? null));
  return row;
}

const emptyTimeRow = (year: number): Row => ({ year, kind: null, ...Object.fromEntries(LAND_STATES.map((s) => [s, null])) });

function page<T>(rows: T[], q: Query) {
  return { total: rows.length, rows: rows.slice(q.offset, q.offset + q.limit) };
}

const DEFAULT_PLACE_SORT: SortKey[] = [{ field: 'code', desc: false }];

// ---------------------------------------------------------------- /places

/** Lista de lugares con sus campos planos; con `year`, también el estado del terreno ese año. */
export async function queryPlaces(q: Query) {
  const terrain = await loadTerrain();
  const timeFilters = q.filters.filter((f) => f.field.scope === 'time');
  const wantsTime = q.fields?.some((f) => ['year', 'kind', ...LAND_STATES].includes(f));
  if (q.year == null && (timeFilters.length || wantsTime))
    throw new QueryError(
      'year-required',
      msg(q.lang, 'Los campos por año (year, kind, healthy…) necesitan year=AAAA.', 'Per-year fields (year, kind, healthy…) need year=YYYY.'),
    );

  let rows = selectPlaces(terrain, q).map((s) => s.row);
  if (q.year != null) {
    const [year] = resolveYears(terrain.meta, q);
    const dyn = await loadDynamics(terrain, rows.map((r) => r.code as string));
    rows = rows
      .map((r) => {
        const tp = dyn.get(r.code as string)?.timeline.find((t) => t.year === year);
        return { ...r, ...(tp ? timeRow(tp) : emptyTimeRow(year!)) };
      })
      .filter((r) => matchesAll(r, timeFilters));
  }
  const sorted = sortRows(rows, q.sort.length ? q.sort : q.near ? [{ field: 'distanceKm', desc: false }] : DEFAULT_PLACE_SORT);
  const { total, rows: slice } = page(sorted, q);
  const fields = q.fields ?? (q.year != null ? [...PLACE_FIELDS, ...TIME_FIELDS] : [...PLACE_FIELDS]);
  return { terrain, total, fields, rows: slice, data: slice.map((r) => pick(r, fields)) };
}

// ---------------------------------------------------------------- detalle de un lugar

const byState = (v: readonly number[], round = r3) =>
  Object.fromEntries(LAND_STATES.map((s, i) => [s, round(v[i] ?? 0)])) as Record<(typeof LAND_STATES)[number], number>;

export function placeDetail(terrain: Terrain, place: Place, dyn: PlaceDynamics | undefined, years: readonly number[]) {
  const { meta } = terrain;
  const row = place.row;
  const stateOf = (suffix: string) => Object.fromEntries(LAND_STATES.map((s) => [s, row[`${s}${suffix}`] ?? null]));
  const markov = dyn
    ? (() => {
        const s = summarize(dyn.p0, dyn.p1, dyn.P);
        return {
          stepYears: meta.periods.stepYears,
          from: meta.periods.initial.label,
          to: meta.periods.final.label,
          /** matrix[desde][hacia] = probabilidad de pasar de un estado a otro en un paso. */
          matrix: Object.fromEntries(LAND_STATES.map((s1, i) => [s1, byState(dyn.P[i] ?? [], r4)])),
          stay: byState(LAND_STATES.map((st) => s.stay[st]), r4),
          trend: s.trend,
          biggestChange: { state: s.biggest.state, from: r3(s.biggest.from), to: r3(s.biggest.to), delta: r3(s.biggest.delta) },
          mainFlow: s.mainFlow
            ? { from: s.mainFlow.from, to: s.mainFlow.to, prob: r4(s.mainFlow.prob), share: r4(s.mainFlow.share) }
            : null,
          longRun: byState(stationary(dyn.P)),
        };
      })()
    : null;
  return {
    code: place.code,
    level: place.level,
    name: place.name,
    dpto: place.dpto,
    dptoName: place.dptoName,
    location: { lat: row.lat, lon: row.lon, bbox: place.bbox.map(r4) },
    areaKm2: place.item.a,
    validShare: place.item.v,
    confidence: place.risk.confidence,
    indicators: { ...place.item.i },
    states: {
      initial: { period: meta.periods.initial.label, ...stateOf('Initial') },
      final: { period: meta.periods.final.label, ...stateOf('Final') },
      change: stateOf('Change'),
    },
    risk: {
      score: place.risk.all.score,
      level: place.risk.all.level,
      top: place.risk.all.top,
      hazards: Object.fromEntries(
        Object.entries(place.risk.hazards).map(([h, r]) => [
          h,
          {
            score: r.score,
            level: r.level,
            evidence: r.evidence.map((e) => ({ indicator: e.id, value: e.value, points: e.points, source: e.source })),
            missing: r.missing,
          },
        ]),
      ),
    },
    markov,
    series: dyn ? dyn.timeline.filter((t) => years.includes(t.year)).map(timeRow) : [],
  };
}

export async function queryPlace(code: string, q: Query) {
  const terrain = await loadTerrain();
  const place = terrain.byCode.get(code);
  if (!place)
    throw new QueryError(
      'not-found',
      msg(q.lang, `No hay datos del código ${code}. Busca con /api/terrain/places?q=nombre.`, `No data for code ${code}. Search with /api/terrain/places?q=name.`),
      undefined,
      404,
    );
  const years = resolveYears(terrain.meta, q);
  const dyn = (await loadDynamics(terrain, [code])).get(code);
  return { terrain, data: placeDetail(terrain, place, dyn, years) };
}

// ---------------------------------------------------------------- /at

/** ¿Qué hay en este punto? Municipio y departamento que lo contienen, con su detalle y su serie. */
export async function queryAt(q: Query) {
  if (!q.point)
    throw new QueryError('location-required', msg(q.lang, 'Falta lat y lon.', 'lat and lon are required.'));
  const terrain = await loadTerrain();
  const { lat, lon } = q.point;
  const { mpio, dpto } = locate(terrain, lat, lon);
  if (!mpio && !dpto)
    throw new QueryError(
      'outside-coverage',
      msg(q.lang, 'El punto no cae en ningún municipio de Colombia.', 'The point is not inside any Colombian municipality.'),
      { nearest: nearest(terrain, lat, lon, 50) },
      404,
    );
  const years = resolveYears(terrain.meta, q);
  const dyn = await loadDynamics(terrain, [mpio?.code, dpto?.code].filter((c): c is string => !!c));
  return {
    terrain,
    data: {
      point: { lat, lon },
      mpio: mpio ? placeDetail(terrain, mpio, dyn.get(mpio.code), years) : null,
      dpto: dpto ? placeDetail(terrain, dpto, dyn.get(dpto.code), years) : null,
    },
  };
}

// ---------------------------------------------------------------- /series

/**
 * Lugar × año. Sin `aggregate`: una fila por lugar y año. Con `aggregate=true`: una fila por año con el promedio
 * ponderado por el área con dato válido de los lugares elegidos (municipios; si solo hay departamentos, esos).
 */
export async function querySeries(q: Query) {
  const terrain = await loadTerrain();
  const years = resolveYears(terrain.meta, q);
  const selected = selectPlaces(terrain, q);
  const timeFilters = q.filters.filter((f) => f.field.scope === 'time');
  const dyn = await loadDynamics(terrain, selected.map((s) => s.place.code));

  if (q.aggregate) {
    const mpios = selected.filter((s) => s.place.level === 'mpio');
    const pool = (mpios.length ? mpios : selected).filter((s) => dyn.has(s.place.code));
    const rows: Row[] = [];
    for (const year of years) {
      const acc = LAND_STATES.map(() => 0);
      let weight = 0;
      let area = 0;
      let kind: TimePoint['kind'] | null = null;
      for (const { place } of pool) {
        const tp = dyn.get(place.code)!.timeline.find((t) => t.year === year);
        if (!tp) continue;
        const w = place.item.a * place.item.v;
        tp.shares.forEach((x, i) => (acc[i]! += x * w));
        weight += w;
        area += place.item.a;
        kind = tp.kind;
      }
      const row: Row = { year, kind, places: pool.length, areaKm2: Math.round(area) };
      LAND_STATES.forEach((s, i) => (row[s] = weight > 0 ? r3(acc[i]! / weight) : null));
      if (matchesAll(row, timeFilters)) rows.push(row);
    }
    const sorted = sortRows(rows, q.sort.length ? q.sort : [{ field: 'year', desc: false }]);
    const { total, rows: slice } = page(sorted, q);
    return {
      terrain,
      total,
      fields: q.fields ?? ['year', 'kind', ...LAND_STATES, 'places', 'areaKm2'],
      data: q.fields ? slice.map((r) => pick(r, q.fields)) : slice,
      aggregate: { places: pool.length, codes: pool.length <= 50 ? pool.map((s) => s.place.code) : undefined },
    };
  }

  const fields = q.fields ?? [...DEFAULT_SERIES_FIELDS];
  const placeFields = [...new Set([...fields, ...q.sort.map((s) => s.field)])].filter((f) => !['year', 'kind', ...LAND_STATES].includes(f));
  const rows: Row[] = [];
  for (const { place, row } of selected) {
    const base = pick(row, placeFields);
    const timeline = dyn.get(place.code)?.timeline;
    for (const year of years) {
      const tp = timeline?.find((t) => t.year === year);
      const r = { ...base, ...(tp ? timeRow(tp) : emptyTimeRow(year)) };
      if (matchesAll(r, timeFilters)) rows.push(r);
    }
  }
  const sorted = q.sort.length ? sortRows(rows, q.sort) : rows; // ya va por código y año
  const { total, rows: slice } = page(sorted, q);
  return { terrain, total, fields, data: slice.map((r) => pick(r, fields)), aggregate: null };
}
