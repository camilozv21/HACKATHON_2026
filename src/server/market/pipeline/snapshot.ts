/**
 * Arma las instantáneas compactas (centrales, departamentos, nacional) a partir de los registros de SIPSA, EVA,
 * Finagro, TRM e insumos. Funciones puras: las usan el seed (scripts/build-market-co.mjs) y el refresco
 * programado (src/server/market/refresh.ts).
 */
import { PRODUCT_IDS, type ProductId } from '../../../lib/market/catalog.ts';
import { evaProduct, finagroProducts, norm, sipsaPriceProduct, sipsaSupplyProduct } from './mapping.ts';
import { sipsaMonth, sipsaNum, type SipsaRecord } from './sipsa.ts';
import type { EvaRow, FinagroRow } from './sources.ts';
import type { CentralSnapshot, CreditStats, DeptSnapshot, EvaYear, MonthSeries, NationalSnapshot } from './types.ts';

/** Centros de municipio DIVIPOLA: código → [lat, lon, nombre, departamento] (src/server/events/divipola.json). */
export type Municipios = Record<string, [number, number, string, string]>;

export const PRICE_MONTHS = 24;
export const SUPPLY_MONTHS = 15;

// ---------------------------------------------------------------- meses

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export const monthDiff = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number) as [number, number];
  const [yb, mb] = b.split('-').map(Number) as [number, number];
  return (yb - ya) * 12 + (mb - ma);
};

function toSeries(byMonth: Map<string, number>, last: string, months: number, round = 0): MonthSeries {
  const from = addMonths(last, -(months - 1));
  const f = 10 ** round;
  const v = Array.from({ length: months }, (_, i) => {
    const x = byMonth.get(addMonths(from, i));
    return x === undefined ? null : Math.round(x * f) / f;
  });
  return { from, v };
}

// ---------------------------------------------------------------- centrales

export const centralId = (name: string) => norm(name).replace(/ /g, '-');

type Index = { byDept: Map<string, string>; byName: Map<string, string | null> };
const indexCache = new WeakMap<Municipios, Index>();

const variants = (name: string) => {
  const k = norm(name).replace(/\bd c\b/g, '').trim();
  return [...new Set([k, k.replace(/^(santiago de|san jose de|san juan de|santa cruz de|san sebastian de|villa de) /, ''), k.replace(/ de indias$/, '')])];
};

function municipioIndex(municipios: Municipios): Index {
  const hit = indexCache.get(municipios);
  if (hit) return hit;
  const byDept = new Map<string, string>();
  const byName = new Map<string, string | null>();
  for (const [code, r] of Object.entries(municipios)) {
    const d = norm(r[3]);
    for (const v of variants(r[2])) {
      byDept.set(`${d}|${v}`, code);
      if (!byName.has(v)) byName.set(v, code);
      else {
        // Nombre repetido ("Armenia" en Quindío y en Antioquia): las centrales están en capitales (código …001).
        const prev = byName.get(v);
        const capital = [prev, code].filter((c): c is string => Boolean(c?.endsWith('001')));
        byName.set(v, capital.length === 1 ? capital[0]! : prev === code ? code : null);
      }
    }
  }
  const idx = { byDept, byName };
  indexCache.set(municipios, idx);
  return idx;
}

/** "Tibasosa (Boyacá), Coomproriente" → municipio de Tibasosa; "Bogotá, D.C., Corabastos" → Bogotá. */
export function centralLocation(name: string, municipios: Municipios): Pick<CentralSnapshot, 'city' | 'dept' | 'muniCode' | 'lat' | 'lon'> {
  let city: string;
  let dept: string | undefined;
  if (/^bogota/.test(norm(name))) {
    city = 'Bogotá, D.C.';
  } else {
    const m = name.match(/^([^,(]+?)\s*(?:\(([^)]+)\))?\s*(?:,\s*(.+))?$/);
    city = (m?.[1] ?? name).trim();
    dept = m?.[2]?.trim();
  }
  const { byDept, byName } = municipioIndex(municipios);
  let code: string | null = null;
  for (const v of variants(city)) {
    code = (dept && byDept.get(`${norm(dept)}|${v}`)) || byName.get(v) || null;
    if (code) break;
  }
  const r = code ? municipios[code] : undefined;
  return {
    city: r ? r[2] : city,
    dept: r ? r[3] : (dept ?? null),
    muniCode: r ? code : null,
    lat: r ? r[0] : null,
    lon: r ? r[1] : null,
  };
}

// ---------------------------------------------------------------- precios SIPSA

type PriceAcc = Map<string, { name: string; products: Map<ProductId, Map<string, { rank: number; months: Map<string, number[]> }>> }>;

/** Acumula los registros de `promediosSipsaMesMadr` (precio promedio mensual $/kg por central y artículo). */
export function createPriceAggregator() {
  const acc: PriceAcc = new Map();
  let latest = '';
  return {
    add(r: SipsaRecord) {
      const hit = r.artiNombre ? sipsaPriceProduct(r.artiNombre) : null;
      const month = sipsaMonth(r.fechaMesIni);
      const price = sipsaNum(r.promedioKg);
      if (!hit || !month || !r.fuenNombre || !(price > 0)) return;
      if (month > latest) latest = month;
      const id = centralId(r.fuenNombre);
      let c = acc.get(id);
      if (!c) acc.set(id, (c = { name: r.fuenNombre, products: new Map() }));
      let p = c.products.get(hit.product);
      if (!p) c.products.set(hit.product, (p = new Map()));
      let a = p.get(r.artiNombre!);
      if (!a) p.set(r.artiNombre!, (a = { rank: hit.rank, months: new Map() }));
      const list = a.months.get(month);
      if (list) list.push(price);
      else a.months.set(month, [price]);
    },
    get latest() {
      return latest;
    },
    /** Una serie de 24 meses por central y producto con el artículo preferido que tenga datos recientes. */
    result(): Map<string, { name: string; prices: CentralSnapshot['prices'] }> {
      const out = new Map<string, { name: string; prices: CentralSnapshot['prices'] }>();
      if (!latest) return out;
      const from = addMonths(latest, -(PRICE_MONTHS - 1));
      for (const [id, c] of acc) {
        const prices: CentralSnapshot['prices'] = {};
        for (const [product, articles] of c.products) {
          const candidates = [...articles.entries()]
            .map(([article, a]) => ({
              article,
              rank: a.rank,
              recent: [...a.months.keys()].filter((m) => m >= from).length,
              last: [...a.months.keys()].sort().at(-1) ?? '',
              months: a.months,
            }))
            // Que tenga datos en los últimos 6 meses y al menos 6 meses en la ventana.
            .filter((x) => x.recent >= 6 && monthDiff(x.last, latest) <= 6)
            .sort((x, y) => x.rank - y.rank || y.recent - x.recent);
          const best = candidates[0];
          if (!best) continue;
          const avg = new Map([...best.months].map(([m, list]) => [m, list.reduce((s, x) => s + x, 0) / list.length]));
          prices[product] = { article: best.article, ...toSeries(avg, latest, PRICE_MONTHS) };
        }
        if (Object.keys(prices).length) out.set(id, { name: c.name, prices });
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- abastecimiento SIPSA

/** Acumula `promedioAbasSipsaMesMadr` (toneladas por mes, central y artículo) sumando por producto. */
export function createSupplyAggregator() {
  const acc = new Map<string, Map<ProductId, Map<string, number>>>();
  let latest = '';
  return {
    add(r: SipsaRecord) {
      const product = r.artiNombre ? sipsaSupplyProduct(r.artiNombre) : null;
      const month = sipsaMonth(r.fechaMesIni);
      const t = sipsaNum(r.cantidadTon);
      if (!product || !month || !r.fuenNombre || !(t >= 0)) return;
      if (month > latest) latest = month;
      const id = centralId(r.fuenNombre);
      let c = acc.get(id);
      if (!c) acc.set(id, (c = new Map()));
      let p = c.get(product);
      if (!p) c.set(product, (p = new Map()));
      p.set(month, (p.get(month) ?? 0) + t);
    },
    get latest() {
      return latest;
    },
    result(): Map<string, NonNullable<CentralSnapshot['supply']>> {
      const out = new Map<string, NonNullable<CentralSnapshot['supply']>>();
      if (!latest) return out;
      for (const [id, products] of acc) {
        const supply: NonNullable<CentralSnapshot['supply']> = {};
        for (const [product, months] of products) supply[product] = toSeries(months, latest, SUPPLY_MONTHS);
        out.set(id, supply);
      }
      return out;
    },
  };
}

/** Une precios, abastecimiento y ubicación en las instantáneas de centrales. */
export function buildCentrals(
  prices: Map<string, { name: string; prices: CentralSnapshot['prices'] }>,
  supply: Map<string, NonNullable<CentralSnapshot['supply']>> | null,
  municipios: Municipios,
): CentralSnapshot[] {
  return [...prices.entries()]
    .map(([id, c]) => ({
      id,
      name: c.name,
      ...centralLocation(c.name, municipios),
      prices: c.prices,
      ...(supply?.get(id) ? { supply: supply.get(id) } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- EVA

/** Departamentos con sus series EVA (últimos años) y el rendimiento nacional por producto. */
export function buildEva(rows: EvaRow[], keepYears = 4): { depts: Map<string, { name: string; eva: DeptSnapshot['eva'] }>; national: NationalSnapshot['evaYield'] } {
  const lastYear = Math.max(...rows.map((r) => r.year).filter(Number.isFinite));
  const minYear = lastYear - keepYears + 1;
  const depts = new Map<string, { name: string; acc: Map<ProductId, Map<number, [number, number, number]>> }>();
  const nat = new Map<ProductId, Map<number, [number, number]>>();
  for (const r of rows) {
    const product = evaProduct(r.cultivo, r.desag);
    if (!product || !(r.year >= minYear) || !/^\d{2}$/.test(r.dept)) continue;
    let d = depts.get(r.dept);
    if (!d) depts.set(r.dept, (d = { name: r.deptName, acc: new Map() }));
    let p = d.acc.get(product);
    if (!p) d.acc.set(product, (p = new Map()));
    const y = p.get(r.year) ?? [0, 0, 0];
    p.set(r.year, [y[0] + r.sown, y[1] + r.harvested, y[2] + r.production]);
    let n = nat.get(product);
    if (!n) nat.set(product, (n = new Map()));
    const ny = n.get(r.year) ?? [0, 0];
    n.set(r.year, [ny[0] + r.harvested, ny[1] + r.production]);
  }
  const round = (x: number) => Math.round(x);
  const out = new Map<string, { name: string; eva: DeptSnapshot['eva'] }>();
  for (const [code, d] of depts) {
    const eva: DeptSnapshot['eva'] = {};
    for (const [product, years] of d.acc) {
      eva[product] = [...years.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, [s, h, p]]): EvaYear => [year, round(s), round(h), round(p)]);
    }
    out.set(code, { name: titleDept(d.name), eva });
  }
  const national: NationalSnapshot['evaYield'] = {};
  for (const [product, years] of nat) {
    const latest = [...years.entries()].filter(([, [h]]) => h > 0).sort((a, b) => b[0] - a[0])[0];
    if (latest) national[product] = { year: latest[0], yieldTHa: Math.round((latest[1][1] / latest[1][0]) * 100) / 100 };
  }
  return { depts: out, national };
}

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'san', 'santa']);
/** "VALLE DEL CAUCA" → "Valle del Cauca" (EVA a veces publica en mayúsculas). */
export function titleDept(s: string): string {
  if (s !== s.toUpperCase()) return s.trim();
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) && w !== 'san' && w !== 'santa' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .trim();
}

// ---------------------------------------------------------------- Finagro

/** Créditos por departamento y producto (un producto puede venir de una cadena compartida, p. ej. cítricos). */
export function buildCredit(rows: FinagroRow[], from: string, to: string): Map<string, NonNullable<DeptSnapshot['credit']>> {
  const out = new Map<string, NonNullable<DeptSnapshot['credit']>>();
  for (const r of rows) {
    const dept = r.mpio.slice(0, 2);
    if (!/^\d{2}$/.test(dept)) continue;
    for (const product of finagroProducts(r.chain)) {
      let d = out.get(dept);
      if (!d) out.set(dept, (d = {}));
      const c: CreditStats = d[product] ?? { chain: r.chain, n: 0, small: 0, cop: 0, from, to };
      c.n += r.n;
      c.small += r.small;
      c.cop += r.cop;
      d[product] = c;
    }
  }
  for (const d of out.values()) for (const c of Object.values(d)) if (c) c.cop = Math.round(c.cop);
  return out;
}

/** Une EVA y créditos en las instantáneas de departamento (DIVIPOLA de 2 dígitos). */
export function buildDepts(
  eva: Map<string, { name: string; eva: DeptSnapshot['eva'] }>,
  credit: Map<string, NonNullable<DeptSnapshot['credit']>> | null,
  municipios: Municipios,
): DeptSnapshot[] {
  const names = new Map<string, string>();
  for (const [code, r] of Object.entries(municipios)) if (!names.has(code.slice(0, 2))) names.set(code.slice(0, 2), r[3]);
  const codes = new Set([...eva.keys(), ...(credit?.keys() ?? [])]);
  return [...codes]
    .filter((c) => names.has(c))
    .sort()
    .map((code) => ({
      code,
      name: names.get(code) ?? eva.get(code)?.name ?? code,
      eva: eva.get(code)?.eva ?? {},
      ...(credit?.get(code) ? { credit: credit.get(code) } : {}),
    }));
}

export const ALL_PRODUCTS: readonly ProductId[] = PRODUCT_IDS;
