/**
 * Mercado de Colombia para un punto: lee las instantáneas de Postgres (`fieldshift.market_kv`, que llena el
 * refresco programado) y, si no hay base o falla, el seed comiteado (`seed-co.json`). Calcula los indicadores
 * por producto y adjunta la conclusión del departamento (Claude, o reglas si no hay).
 */
import { dbEnabled, db, ensureSchema } from '@/server/db';
import { memo } from '@/server/memo';
import { nearestMunicipio } from '@/server/events/divipola';
import { isProductId, type ProductId } from '@/lib/market/catalog';
import { nearestCentrals, productIndicators, topDeptProducts, type MarketData, type ProductIndicators } from './indicators';
import { rulesOutlook, tr, type Loc } from './rules';
import type { CentralSnapshot, DeptOutlook, DeptSnapshot, MarketKind, MarketSeed, NationalSnapshot } from './pipeline/types';

export type MarketSnapshotSet = {
  centrals: CentralSnapshot[];
  depts: Map<string, DeptSnapshot>;
  national: NationalSnapshot;
  outlooks: Map<string, DeptOutlook>;
  asOf: string;
  source: 'db' | 'seed';
};

export type ProductMarket = ProductIndicators & {
  outlook: { label: DeptOutlook['crops'][number]['label']; why: string; by: DeptOutlook['by']; confidence: DeptOutlook['crops'][number]['confidence'] } | null;
};

export type MarketArea = {
  deptCode: string;
  deptName: string;
  mpioCode: string;
  place: string;
  nearestMarket: { name: string; city: string; distanceKm: number } | null;
  trm: NationalSnapshot['trm'];
  inputs: NationalSnapshot['inputs'];
  asOf: string;
  source: 'db' | 'seed';
  products: ProductMarket[];
  headline: string | null;
  outlookBy: DeptOutlook['by'] | null;
  outlookAt: string | null;
};

const TTL = 10 * 60_000;

async function loadSeed(): Promise<MarketSeed> {
  const mod = await import('./seed-co.json');
  return (mod.default ?? mod) as unknown as MarketSeed;
}

type Row = { kind: MarketKind; key: string; payload: unknown; as_of: string | Date | null };

async function loadDb(): Promise<Row[]> {
  await ensureSchema();
  return db()<Row[]>`select kind, key, payload, as_of from fieldshift.market_kv`;
}

const isoDay = (d: string | Date | null) => (d ? (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : '');

/** Instantáneas vigentes (base de datos con respaldo del seed por tipo). Se guardan 10 min en memoria. */
export function loadMarket(): Promise<MarketSnapshotSet> {
  return memo('market:snapshots', TTL, async () => {
    const seed = await loadSeed();
    let rows: Row[] = [];
    if (dbEnabled()) {
      try {
        rows = await loadDb();
      } catch (e) {
        console.warn('[market] base de datos no disponible, uso el seed:', (e as Error).message);
      }
    }
    const of = (k: MarketKind) => rows.filter((r) => r.kind === k);
    const centralsDb = of('central').map((r) => r.payload as CentralSnapshot);
    const deptsDb = of('dept').map((r) => r.payload as DeptSnapshot);
    const nationalDb = of('national').find((r) => r.key === 'co')?.payload as NationalSnapshot | undefined;
    const useDbCentrals = centralsDb.length >= 5;
    const centrals = useDbCentrals ? centralsDb : seed.centrals;
    const depts = new Map((deptsDb.length >= 10 ? deptsDb : seed.depts).map((d) => [d.code, d]));
    const national: NationalSnapshot = {
      trm: nationalDb?.trm ?? seed.national.trm,
      inputs: nationalDb?.inputs ?? seed.national.inputs,
      evaYield: nationalDb && Object.keys(nationalDb.evaYield ?? {}).length ? nationalDb.evaYield : seed.national.evaYield,
    };
    const outlooks = new Map((seed.outlooks ?? []).map((o) => [o.dept, o]));
    for (const r of of('outlook')) outlooks.set(r.key, r.payload as DeptOutlook);
    const asOf = useDbCentrals ? of('central').map((r) => isoDay(r.as_of)).sort().at(-1) || seed.asOf : seed.asOf;
    return { centrals, depts, national, outlooks, asOf, source: rows.length && useDbCentrals ? 'db' : 'seed' };
  });
}

/** Olvida la caché (después de un refresco). */
export function invalidateMarket() {
  const g = globalThis as typeof globalThis & { __fieldShiftMemo?: Map<string, unknown> };
  g.__fieldShiftMemo?.delete('market:snapshots');
}

export type MarketQuery = { lat: number; lon: number; locale?: Loc; products?: ProductId[]; maxProducts?: number };

/** Mercado de la zona de un punto de Colombia (null fuera de Colombia o en el mar). */
export async function marketForPoint({ lat, lon, locale = 'es', products = [], maxProducts = 8 }: MarketQuery): Promise<MarketArea | null> {
  const m = nearestMunicipio(lat, lon, 60);
  if (!m) return null;
  const set = await loadMarket();
  const deptCode = m.code.slice(0, 2);
  const dept = set.depts.get(deptCode) ?? null;
  const data: MarketData = { centrals: set.centrals, dept, national: set.national };
  const wanted = [...new Set([...products.filter(isProductId), ...topDeptProducts(dept, 6)])].slice(0, maxProducts);
  const items = wanted.map((p) => productIndicators(data, p, lat, lon));

  const stored = set.outlooks.get(deptCode);
  const rules = rulesOutlook(deptCode, items);
  const outlookFor = (p: ProductId): ProductMarket['outlook'] => {
    const c = stored?.crops.find((x) => x.product === p);
    if (c) return { label: c.label, why: locale === 'en' ? c.why.en : c.why.es, by: stored!.by, confidence: c.confidence };
    const r = rules.crops.find((x) => x.product === p);
    return r ? { label: r.label, why: locale === 'en' ? r.why.en : r.why.es, by: 'rules', confidence: r.confidence } : null;
  };
  const near = nearestCentrals(set.centrals, lat, lon)[0];
  const headlineSrc = stored ?? (items.length ? rules : null);
  return {
    deptCode,
    deptName: dept?.name ?? m.dept,
    mpioCode: m.code,
    place: `${m.name}, ${m.dept}`,
    nearestMarket: near ? { name: near.c.name, city: near.c.city, distanceKm: Math.round(near.km) } : null,
    trm: set.national.trm,
    inputs: set.national.inputs,
    asOf: set.asOf,
    source: set.source,
    products: items.map((x) => ({ ...x, outlook: outlookFor(x.product) })),
    headline: headlineSrc ? (locale === 'en' ? headlineSrc.headline.en : headlineSrc.headline.es) : null,
    outlookBy: headlineSrc?.by ?? null,
    outlookAt: headlineSrc?.generatedAt ?? null,
  };
}

/** Frase corta con la fuente y la fecha, para pies de tarjeta y evidencias. */
export function marketSourceLine(area: Pick<MarketArea, 'asOf'>, l: Loc) {
  return tr(l, `DANE SIPSA y EVA (UPRA) · precios hasta ${area.asOf.slice(0, 7)}`, `DANE SIPSA and EVA (UPRA) · prices up to ${area.asOf.slice(0, 7)}`);
}
