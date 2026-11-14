/**
 * Fuentes de datos.gov.co (SODA, sin auth; con DATOS_GOV_APP_TOKEN sube el límite). Todo se agrega en el
 * servidor de Socrata con `$group`: las respuestas son pequeñas.
 * - EVA `uejq-wxrr`: área sembrada, cosechada y producción por municipio y cultivo (2019–2025).
 * - TRM `32sa-8pi3`: tasa de cambio representativa del mercado (Superfinanciera).
 * - Insumos `gwbi-fnzs`: índice de precios de insumos agrícolas (UPRA), mensual, nacional.
 * - Finagro `jjvv-55ck`: créditos agropecuarios por municipio y cadena.
 */
const BASE = 'https://www.datos.gov.co/resource';

export const DATASETS = { eva: 'uejq-wxrr', trm: '32sa-8pi3', inputs: 'gwbi-fnzs', finagro: 'jjvv-55ck' } as const;

async function soda<T>(dataset: string, params: Record<string, string>, timeoutMs = 60_000): Promise<T[]> {
  const u = new URL(`${BASE}/${dataset}.json`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.DATOS_GOV_APP_TOKEN;
  if (token) headers['X-App-Token'] = token;
  const res = await fetch(u, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`datos.gov.co ${dataset} ${res.status}`);
  return (await res.json()) as T[];
}

export const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return NaN;
  return Number(String(v).replace(/\s/g, '').replace(',', '.'));
};

export type EvaRow = { dept: string; deptName: string; cultivo: string; desag: string; year: number; sown: number; harvested: number; production: number };

/** EVA agregado por departamento, cultivo, desagregación y año (suma los semestres A y B). */
export async function fetchEva(fromYear: number): Promise<EvaRow[]> {
  const rows = await soda<Record<string, string>>(DATASETS.eva, {
    $select:
      'c_digo_dane_departamento as d, departamento as dn, cultivo as c, desagregaci_n_cultivo as g, a_o as y, sum(rea_sembrada) as s, sum(rea_cosechada) as h, sum(producci_n) as p',
    $where: `a_o >= '${fromYear}'`,
    $group: 'c_digo_dane_departamento, departamento, cultivo, desagregaci_n_cultivo, a_o',
    $limit: '50000',
  });
  return rows.map((r) => ({
    dept: String(r.d ?? '').padStart(2, '0'),
    deptName: String(r.dn ?? ''),
    cultivo: String(r.c ?? ''),
    desag: String(r.g ?? ''),
    year: Number(r.y),
    sown: num(r.s) || 0,
    harvested: num(r.h) || 0,
    production: num(r.p) || 0,
  }));
}

/** TRM vigente y la de hace ~12 meses. */
export async function fetchTrm(now = new Date()): Promise<{ value: number; date: string; change12mPct: number | null } | null> {
  const [latest] = await soda<{ valor: string; vigenciadesde: string }>(DATASETS.trm, { $order: 'vigenciadesde DESC', $limit: '1' });
  if (!latest) return null;
  const value = num(latest.valor);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [old] = await soda<{ valor: string }>(DATASETS.trm, {
    $where: `vigenciadesde <= '${yearAgo}T00:00:00'`,
    $order: 'vigenciadesde DESC',
    $limit: '1',
  });
  const prev = old ? num(old.valor) : NaN;
  return {
    value: Math.round(value * 100) / 100,
    date: latest.vigenciadesde.slice(0, 10),
    change12mPct: Number.isFinite(prev) && prev > 0 ? Math.round(((value - prev) / prev) * 1000) / 10 : null,
  };
}

/** Índice de insumos (total y fertilizantes) del último mes y su cambio a 12 meses. */
export async function fetchInputs() {
  const rows = await soda<{ fecha: string; indice_total: string; total_fertilizantes: string }>(DATASETS.inputs, {
    $select: 'fecha, indice_total, total_fertilizantes',
    $order: 'fecha DESC',
    $limit: '13',
  });
  const [last] = rows;
  if (!last) return null;
  const old = rows.find((r) => r.fecha.slice(0, 7) === `${Number(last.fecha.slice(0, 4)) - 1}${last.fecha.slice(4, 7)}`);
  const pct = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  return {
    month: last.fecha.slice(0, 7),
    total: num(last.indice_total),
    fertilizers: num(last.total_fertilizantes),
    change12mPct: old ? pct(num(last.indice_total), num(old.indice_total)) : null,
    fertChange12mPct: old ? pct(num(last.total_fertilizantes), num(old.total_fertilizantes)) : null,
  };
}

export type FinagroRow = { mpio: string; chain: string; n: number; cop: number; small: number };

/** Créditos Finagro desde `since` (YYYY-MM-DD) por municipio y cadena, con los de pequeños productores aparte. */
export async function fetchFinagro(since: string): Promise<{ rows: FinagroRow[]; from: string; to: string }> {
  const where = `fecha_credito >= '${since}T00:00:00'`;
  const [all, small, [range]] = await Promise.all([
    soda<Record<string, string>>(DATASETS.finagro, {
      $select: 'cod_municipio as m, cadena as c, count(*) as n, sum(valor_credito) as v',
      $where: where,
      $group: 'cod_municipio, cadena',
      $limit: '50000',
    }, 120_000),
    soda<Record<string, string>>(DATASETS.finagro, {
      $select: 'cod_municipio as m, cadena as c, count(*) as n',
      $where: `${where} AND tipo_productor like 'Peque%'`,
      $group: 'cod_municipio, cadena',
      $limit: '50000',
    }, 120_000),
    soda<Record<string, string>>(DATASETS.finagro, { $select: 'min(fecha_credito) as a, max(fecha_credito) as b', $where: where }),
  ]);
  const smallBy = new Map(small.map((r) => [`${r.m}|${r.c}`, num(r.n) || 0]));
  return {
    rows: all.map((r) => ({
      mpio: String(r.m ?? '').padStart(5, '0'),
      chain: String(r.c ?? ''),
      n: num(r.n) || 0,
      cop: num(r.v) || 0,
      small: smallBy.get(`${r.m}|${r.c}`) ?? 0,
    })),
    from: String(range?.a ?? since).slice(0, 10),
    to: String(range?.b ?? '').slice(0, 10),
  };
}
