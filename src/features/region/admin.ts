import { inBBox, type BBox } from '@/lib/bbox';
import { whenIdle } from '@/lib/idle';
import type { RegionTarget } from './store';

/**
 * Límites administrativos de Colombia (DANE, Marco Geoestadístico Nacional): departamentos y municipios con su
 * código DIVIPOLA. Los datos son TopoJSON estáticos en `public/geo/` (scripts/build-admin-co.mjs) y se cargan
 * solo cuando hacen falta: mirar Colombia o tocarla. La búsqueda "¿en qué municipio cae este punto?" se hace aquí
 * (punto en polígono), sin depender de lo que MapLibre tenga pintado.
 */

export type AdminLevel = 'dpto' | 'mpio';
type Pos = [number, number];
type Ring = Pos[];

export type AdminArea = {
  level: AdminLevel;
  /** DIVIPOLA: 2 dígitos (departamento) o 5 (municipio). */
  code: string;
  name: string;
  /** Departamento al que pertenece el municipio. */
  parentName?: string;
  /** Punto interior: cae siempre dentro del polígono. */
  label: Pos;
  bbox: BBox;
  /** Coordenadas de MultiPolygon: polígonos → anillos (el primero es el exterior) → posiciones. */
  polygons: Ring[][];
};

export type AdminIndex = {
  level: AdminLevel;
  areas: AdminArea[];
  byCode: Map<string, AdminArea>;
  /** Bordes entre municipios de un mismo departamento (solo en el archivo de municipios). */
  lines: GeoJSON.MultiLineString | null;
};

/** Colombia con San Andrés y Providencia. */
export const CO_BBOX: BBox = [-81.8, -4.3, -66.8, 13.5];
/** Por debajo de este zoom un toque elige el departamento; desde aquí, el municipio. */
export const MPIO_MIN_ZOOM = 6;
export const ADMIN_ATTRIBUTION =
  'Límites: <a href="https://geoportal.dane.gov.co/" target="_blank" rel="noopener">DANE</a> (MGN) vía <a href="https://data.humdata.org/dataset/cod-ab-col" target="_blank" rel="noopener">OCHA HDX</a>';

// ---------------------------------------------------------------- TopoJSON

type TopoGeometry =
  | { type: 'Polygon'; arcs: number[][]; properties?: Record<string, unknown> }
  | { type: 'MultiPolygon'; arcs: number[][][]; properties?: Record<string, unknown> }
  | { type: 'LineString'; arcs: number[]; properties?: Record<string, unknown> }
  | { type: 'MultiLineString'; arcs: number[][]; properties?: Record<string, unknown> }
  | { type: null; properties?: Record<string, unknown> };

export type Topology = {
  type: 'Topology';
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: Pos[][];
  objects: Record<string, { type: 'GeometryCollection'; geometries: TopoGeometry[] }>;
};

/** Arcos con coordenadas absolutas (deshace la cuantización y la codificación delta). */
function decodeArcs(topo: Topology): Pos[][] {
  const t = topo.transform;
  if (!t) return topo.arcs;
  const [sx, sy] = t.scale;
  const [tx, ty] = t.translate;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]): Pos => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

/** Une los arcos de una línea o anillo (índice negativo = arco al revés). */
function stitch(arcs: Pos[][], refs: number[]): Pos[] {
  const out: Pos[] = [];
  for (const ref of refs) {
    const arc = ref < 0 ? arcs[~ref]!.slice().reverse() : arcs[ref]!;
    // Cada arco empieza donde terminó el anterior: ese punto no se repite.
    for (let i = out.length ? 1 : 0; i < arc.length; i++) out.push(arc[i]!);
  }
  return out;
}

function bboxOf(polygons: Ring[][]): BBox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const poly of polygons)
    for (const [x, y] of poly[0] ?? []) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [w, s, e, n];
}

type Props = { c?: unknown; n?: unknown; dn?: unknown; x?: unknown; y?: unknown };

export function buildAdminIndex(level: AdminLevel, topo: Topology): AdminIndex {
  const obj = topo?.type === 'Topology' ? topo.objects?.[level] : undefined;
  if (!obj || !Array.isArray(obj.geometries) || !Array.isArray(topo.arcs))
    throw new Error(`admin: ${level} inválido`);
  const arcs = decodeArcs(topo);

  const areas: AdminArea[] = [];
  for (const g of obj.geometries) {
    const p = (g.properties ?? {}) as Props;
    if (typeof p.c !== 'string' || typeof p.n !== 'string') continue;
    const polygons =
      g.type === 'Polygon'
        ? [g.arcs.map((r) => stitch(arcs, r))]
        : g.type === 'MultiPolygon'
          ? g.arcs.map((poly) => poly.map((r) => stitch(arcs, r)))
          : [];
    if (!polygons.length) continue;
    const bbox = bboxOf(polygons);
    const label: Pos =
      typeof p.x === 'number' && typeof p.y === 'number'
        ? [p.x, p.y]
        : [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    areas.push({
      level,
      code: p.c,
      name: p.n,
      parentName: typeof p.dn === 'string' ? p.dn : undefined,
      label,
      bbox,
      polygons,
    });
  }

  const lineGeom = topo.objects.lines?.geometries[0];
  const lines =
    lineGeom?.type === 'MultiLineString'
      ? lineGeom.arcs.map((l) => stitch(arcs, l))
      : lineGeom?.type === 'LineString'
        ? [stitch(arcs, lineGeom.arcs)]
        : null;

  return {
    level,
    areas,
    byCode: new Map(areas.map((a) => [a.code, a])),
    lines: lines ? { type: 'MultiLineString', coordinates: lines } : null,
  };
}

// ---------------------------------------------------------------- punto en polígono

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Área (departamento o municipio) que contiene el punto, o null (mar, otro país). */
export function findAdminAt(index: AdminIndex, lng: number, lat: number): AdminArea | null {
  for (const area of index.areas) {
    if (!inBBox(area.bbox, lng, lat)) continue;
    for (const [outer, ...holes] of area.polygons) {
      if (outer && inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h))) return area;
    }
  }
  return null;
}

// ---------------------------------------------------------------- carga bajo demanda

const loaded = new Map<AdminLevel, AdminIndex>();
const pending = new Map<AdminLevel, Promise<AdminIndex>>();

/** Índice ya cargado (síncrono: el toque no espera a la red). */
export function getAdmin(level: AdminLevel): AdminIndex | null {
  return loaded.get(level) ?? null;
}

/** Descarga (una sola vez) y prepara el índice. El decodificado espera a que el navegador esté ocioso. */
export function loadAdmin(level: AdminLevel): Promise<AdminIndex> {
  const ready = loaded.get(level);
  if (ready) return Promise.resolve(ready);
  let p = pending.get(level);
  if (!p) {
    p = fetch(`/geo/co-${level}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`admin: HTTP ${r.status}`);
        return r.json() as Promise<Topology>;
      })
      .then((topo) => new Promise<Topology>((resolve) => whenIdle(() => resolve(topo), 600)))
      .then((topo) => {
        const index = buildAdminIndex(level, topo);
        loaded.set(level, index);
        return index;
      });
    // Si falla (sin red), el próximo intento vuelve a pedirlo.
    p.catch(() => pending.delete(level));
    pending.set(level, p);
  }
  return p;
}

export const levelOf = (code: string): AdminLevel => (code.length <= 2 ? 'dpto' : 'mpio');

// ---------------------------------------------------------------- región del drawer

/** "Medellín, Antioquia"; Bogotá D.C. es municipio y departamento a la vez: sin repetir. */
export function adminName(area: AdminArea): string {
  return area.parentName && area.parentName !== area.name ? `${area.name}, ${area.parentName}` : area.name;
}

/** Región del drawer para un área. `at` = punto tocado (los datos se piden ahí); sin él, el punto interior. */
export function adminTarget(area: AdminArea, at?: { lat: number; lon: number }): RegionTarget {
  return {
    lat: at?.lat ?? area.label[1],
    lon: at?.lon ?? area.label[0],
    name: adminName(area),
    admin: { level: area.level, code: area.code },
  };
}

/** Valor de `?region=` para un área: `co:05001` (municipio) o `co:05` (departamento). */
export const adminParam = (code: string) => `co:${code}`;

export function parseAdminParam(v: string): { level: AdminLevel; code: string } | null {
  const m = /^co:(\d{2}|\d{5})$/.exec(v);
  return m ? { level: levelOf(m[1]!), code: m[1]! } : null;
}
