/**
 * Refresco programado de los datos de mercado (lo dispara n8n vía POST /api/market/jobs/refresh).
 * Cada fuente se descarga, se agrega con el mismo código del seed (pipeline/) y se guarda en
 * `fieldshift.market_kv`; cada corrida queda en `fieldshift.market_runs` (ok, filas, error).
 *
 * Frecuencias sugeridas (docs/n8n/market-scheduler.json): TRM e insumos a diario; SIPSA (precios y
 * abastecimiento) cada semana después del boletín; EVA y Finagro cada mes.
 */
import type { Sql } from 'postgres';
import divipola from '@/server/events/divipola.json';
import { db, dbEnabled, ensureSchema } from '@/server/db';
import { fetchSipsa } from './pipeline/sipsa';
import { fetchEva, fetchFinagro, fetchInputs, fetchTrm } from './pipeline/sources';
import { buildCentrals, buildCredit, buildEva, createPriceAggregator, createSupplyAggregator, type Municipios } from './pipeline/snapshot';
import type { CentralSnapshot, DeptSnapshot, MarketKind, NationalSnapshot } from './pipeline/types';
import { invalidateMarket } from './index';

export const MARKET_SOURCES = ['trm', 'inputs', 'sipsa', 'sipsa-supply', 'eva', 'finagro'] as const;
export type MarketSource = (typeof MARKET_SOURCES)[number];

export type RunReport = { source: MarketSource; ok: boolean; rows: number; ms: number; error?: string };

const municipios = divipola as unknown as Municipios;

async function upsert(sql: Sql, kind: MarketKind, key: string, payload: unknown, asOf: string | null) {
  await sql`
    insert into fieldshift.market_kv (kind, key, payload, as_of, updated_at)
    values (${kind}, ${key}, ${sql.json(payload as never)}, ${asOf}, now())
    on conflict (kind, key) do update set payload = excluded.payload, as_of = excluded.as_of, updated_at = now()`;
}

async function readKind<T>(sql: Sql, kind: MarketKind): Promise<Map<string, T>> {
  const rows = await sql<{ key: string; payload: T }[]>`select key, payload from fieldshift.market_kv where kind = ${kind}`;
  return new Map(rows.map((r) => [r.key, r.payload]));
}

async function national(sql: Sql): Promise<NationalSnapshot> {
  const n = (await readKind<NationalSnapshot>(sql, 'national')).get('co');
  return n ?? { trm: null, inputs: null, evaYield: {} };
}

async function runSource(sql: Sql, source: MarketSource, now: Date): Promise<number> {
  switch (source) {
    case 'trm': {
      const trm = await fetchTrm(now);
      if (!trm) throw new Error('TRM vacía');
      await upsert(sql, 'national', 'co', { ...(await national(sql)), trm }, trm.date);
      return 1;
    }
    case 'inputs': {
      const inputs = await fetchInputs();
      if (!inputs) throw new Error('índice de insumos vacío');
      await upsert(sql, 'national', 'co', { ...(await national(sql)), inputs }, `${inputs.month}-01`);
      return 1;
    }
    case 'sipsa': {
      const agg = createPriceAggregator();
      await fetchSipsa('promediosSipsaMesMadr', agg.add, AbortSignal.timeout(200_000));
      const old = await readKind<CentralSnapshot>(sql, 'central');
      const centrals = buildCentrals(agg.result(), null, municipios);
      if (centrals.length < 5) throw new Error(`SIPSA devolvió solo ${centrals.length} centrales`);
      for (const c of centrals) {
        const supply = old.get(c.id)?.supply;
        await upsert(sql, 'central', c.id, supply ? { ...c, supply } : c, `${agg.latest}-01`);
      }
      return centrals.length;
    }
    case 'sipsa-supply': {
      const agg = createSupplyAggregator();
      await fetchSipsa('promedioAbasSipsaMesMadr', agg.add, AbortSignal.timeout(200_000));
      const supply = agg.result();
      const rows = await sql<{ key: string; payload: CentralSnapshot; as_of: string | null }[]>`
        select key, payload, as_of::text from fieldshift.market_kv where kind = 'central'`;
      let n = 0;
      for (const r of rows) {
        const s = supply.get(r.key);
        if (!s) continue;
        await upsert(sql, 'central', r.key, { ...r.payload, supply: s }, r.as_of);
        n++;
      }
      if (!rows.length) throw new Error('Primero corre "sipsa" (no hay centrales guardadas)');
      return n;
    }
    case 'eva': {
      const rows = await fetchEva(now.getFullYear() - 6);
      const { depts, national: evaYield } = buildEva(rows);
      const old = await readKind<DeptSnapshot>(sql, 'dept');
      const names = new Map<string, string>();
      for (const [code, r] of Object.entries(municipios)) if (!names.has(code.slice(0, 2))) names.set(code.slice(0, 2), r[3]);
      let n = 0;
      for (const [code, d] of depts) {
        if (!names.has(code)) continue;
        const prev = old.get(code);
        await upsert(sql, 'dept', code, { code, name: names.get(code)!, eva: d.eva, ...(prev?.credit ? { credit: prev.credit } : {}) }, null);
        n++;
      }
      await upsert(sql, 'national', 'co', { ...(await national(sql)), evaYield }, null);
      return n;
    }
    case 'finagro': {
      const since = new Date(now.getTime() - 540 * 86_400_000).toISOString().slice(0, 10);
      const f = await fetchFinagro(since);
      const credit = buildCredit(f.rows, f.from, f.to);
      const old = await readKind<DeptSnapshot>(sql, 'dept');
      let n = 0;
      for (const [code, c] of credit) {
        const prev = old.get(code);
        if (!prev) continue; // primero EVA: el departamento necesita su nombre y sus cultivos
        await upsert(sql, 'dept', code, { ...prev, credit: c }, null);
        n++;
      }
      return n;
    }
  }
}

/** Corre las fuentes pedidas una tras otra y registra cada corrida. Requiere base de datos. */
export async function refreshMarket(sources: MarketSource[], now = new Date()): Promise<RunReport[]> {
  if (!dbEnabled()) throw new Error('DATABASE_URL no está configurada');
  await ensureSchema();
  const sql = db();
  const out: RunReport[] = [];
  for (const source of sources) {
    const t0 = Date.now();
    const [run] = await sql<{ id: string }[]>`insert into fieldshift.market_runs (source) values (${source}) returning id`;
    const id = run!.id;
    try {
      const rows = await runSource(sql, source, now);
      await sql`update fieldshift.market_runs set finished_at = now(), ok = true, rows = ${rows} where id = ${id}`;
      out.push({ source, ok: true, rows, ms: Date.now() - t0 });
    } catch (e) {
      const error = (e as Error).message.slice(0, 500);
      await sql`update fieldshift.market_runs set finished_at = now(), ok = false, error = ${error} where id = ${id}`;
      out.push({ source, ok: false, rows: 0, ms: Date.now() - t0, error });
    }
  }
  invalidateMarket();
  return out;
}
