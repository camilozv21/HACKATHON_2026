import { haversineKm } from '@/lib/geo';
import raw from './divipola.json';
import { normalizeName } from './kinds';

/** Centro de cada municipio de Colombia por código DIVIPOLA (scripts/build-divipola.mjs). */
type Row = [lat: number, lon: number, name: string, dept: string];
const MUNICIPIOS = raw as unknown as Record<string, Row>;

export type Municipio = { code: string; lat: number; lon: number; name: string; dept: string };

/** "5656" → "05656" (algunos años de UNGRD pierden el cero inicial). */
export const padCode = (code: string | number | null | undefined) => {
  const s = String(code ?? '').replace(/\D/g, '');
  return s ? s.padStart(5, '0') : '';
};

export function municipio(code: string | number | null | undefined): Municipio | null {
  const c = padCode(code);
  const r = MUNICIPIOS[c];
  return r ? { code: c, lat: r[0], lon: r[1], name: r[2], dept: r[3] } : null;
}

/** "Bogotá, D.C." → "BOGOTA"; "SAN JOSÉ DE CÚCUTA" → "SAN JOSE DE CUCUTA". */
const key = (s: string) =>
  normalizeName(s)
    .replace(/[.,()]/g, ' ')
    .replace(/\bD ?C\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Formas en que UNGRD escribe un mismo municipio ("CALI" por "Santiago de Cali", "CARTAGENA" por "Cartagena de Indias"). */
function variants(name: string): string[] {
  const k = key(name);
  return [
    ...new Set([
      k,
      k.replace(/^(SANTIAGO DE|SAN JOSE DE|SANTA CRUZ DE|SAN SEBASTIAN DE|VILLA DE|SAN JUAN DE) /, ''),
      k.replace(/ DE INDIAS$/, ''),
    ]),
  ].filter(Boolean);
}

let index: { byDept: Map<string, string>; byName: Map<string, string | null> } | null = null;

function nameIndex() {
  if (index) return index;
  const byDept = new Map<string, string>();
  const byName = new Map<string, string | null>();
  for (const [code, r] of Object.entries(MUNICIPIOS)) {
    const dept = key(r[3]);
    for (const v of variants(r[2])) {
      byDept.set(`${dept}|${v}`, code);
      // El mismo nombre en dos departamentos (hay muchos "La Unión") no sirve sin el departamento.
      byName.set(v, byName.has(v) && byName.get(v) !== code ? null : code);
    }
  }
  index = { byDept, byName };
  return index;
}

const sameName = (a: string, b: string) => {
  const va = variants(a);
  return variants(b).some((v) => va.includes(v));
};

/**
 * Municipio de una fila de UNGRD. El código DIVIPOLA a veces viene mal (en 2025 hay filas con un consecutivo
 * en esa columna), así que solo se usa si coincide con el nombre; si no, se busca por municipio y departamento.
 */
export function resolveMunicipio(code: string | number | null | undefined, name?: string, dept?: string): Municipio | null {
  const byCode = municipio(code);
  if (!name) return byCode;
  if (byCode && sameName(byCode.name, name)) return byCode;
  const { byDept, byName } = nameIndex();
  const d = dept ? key(dept) : '';
  for (const v of variants(name)) {
    const c = (d && byDept.get(`${d}|${v}`)) || byName.get(v);
    if (c) return municipio(c);
  }
  return null;
}

/** Caja aproximada de Colombia continental e insular. */
export const COLOMBIA_BBOX = { west: -82, south: -4.5, east: -66, north: 13.6 };

export const inColombia = (lat: number, lon: number) =>
  lat >= COLOMBIA_BBOX.south && lat <= COLOMBIA_BBOX.north && lon >= COLOMBIA_BBOX.west && lon <= COLOMBIA_BBOX.east;

/** Municipio con el centro más cercano (null fuera de Colombia o a más de maxKm). */
export function nearestMunicipio(lat: number, lon: number, maxKm = 40): (Municipio & { distanceKm: number }) | null {
  if (!inColombia(lat, lon)) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const [code, r] of Object.entries(MUNICIPIOS)) {
    // Descarte rápido antes de la distancia exacta (~1° ≈ 111 km).
    if (Math.abs(r[0] - lat) > 1 || Math.abs(r[1] - lon) > 1) continue;
    const d = haversineKm({ lat, lng: lon }, { lat: r[0], lng: r[1] });
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  if (!best || bestD > maxKm) return null;
  return { ...municipio(best)!, distanceKm: Math.round(bestD * 10) / 10 };
}
