// Seed de mercado de Colombia: precios y abastecimiento mayorista (DANE SIPSA), área y rendimiento (EVA),
// créditos (Finagro), TRM e índice de insumos (UPRA). Lo usa la app cuando no hay base de datos o falla la red,
// y los e2e. El refresco programado (n8n → /api/market/jobs/refresh) usa el mismo código y guarda en Postgres.
//
// Uso: node --experimental-strip-types --no-warnings scripts/build-market-co.mjs [--no-supply] [--no-finagro]
//      → src/server/market/seed-co.json   (tarda 1–3 min: SIPSA manda la historia completa, ~100 MB)
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchSipsa } from '../src/server/market/pipeline/sipsa.ts';
import { fetchEva, fetchFinagro, fetchInputs, fetchTrm } from '../src/server/market/pipeline/sources.ts';
import {
  buildCentrals,
  buildCredit,
  buildDepts,
  buildEva,
  createPriceAggregator,
  createSupplyAggregator,
} from '../src/server/market/pipeline/snapshot.ts';

const args = new Set(process.argv.slice(2));
const OUT = 'src/server/market/seed-co.json';
const municipios = JSON.parse(readFileSync('src/server/events/divipola.json', 'utf8'));
const now = new Date();
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

const prices = createPriceAggregator();
const supply = createSupplyAggregator();

const [nPrices, nSupply, eva, trm, inputs, finagro] = await Promise.all([
  fetchSipsa('promediosSipsaMesMadr', prices.add).then((n) => (log('SIPSA precios', n, 'registros, último mes', prices.latest), n)),
  args.has('--no-supply')
    ? Promise.resolve(0)
    : fetchSipsa('promedioAbasSipsaMesMadr', supply.add)
        .then((n) => (log('SIPSA abastecimiento', n, 'registros, último mes', supply.latest), n))
        .catch((e) => (log('SIPSA abastecimiento falló:', e.message), 0)),
  fetchEva(now.getFullYear() - 6).then((r) => (log('EVA', r.length, 'filas'), r)),
  fetchTrm(now).catch((e) => (log('TRM falló:', e.message), null)),
  fetchInputs().catch((e) => (log('Insumos falló:', e.message), null)),
  args.has('--no-finagro')
    ? Promise.resolve(null)
    : fetchFinagro(new Date(now.getTime() - 540 * 86_400_000).toISOString().slice(0, 10))
        .then((f) => (log('Finagro', f.rows.length, 'filas', f.from, '→', f.to), f))
        .catch((e) => (log('Finagro falló:', e.message), null)),
]);

const centrals = buildCentrals(prices.result(), nSupply ? supply.result() : null, municipios);
const { depts: evaDepts, national: evaYield } = buildEva(eva);
const credit = finagro ? buildCredit(finagro.rows, finagro.from, finagro.to) : null;
const depts = buildDepts(evaDepts, credit, municipios);

const seed = {
  asOf: `${prices.latest}-01`,
  builtAt: now.toISOString(),
  centrals,
  depts,
  national: { trm, inputs, evaYield },
};
const json = JSON.stringify(seed);
writeFileSync(OUT, json + '\n');

const unresolved = centrals.filter((c) => c.lat === null).map((c) => c.name);
log(`${OUT}: ${(json.length / 1024).toFixed(0)} KB · ${nPrices} precios · ${centrals.length} centrales · ${depts.length} departamentos`);
if (unresolved.length) log('Centrales sin ubicar (no cuentan para la distancia):', unresolved.join(' | '));
const perProduct = {};
for (const c of centrals) for (const p of Object.keys(c.prices)) perProduct[p] = (perProduct[p] ?? 0) + 1;
log('Centrales con precio por producto:', JSON.stringify(perProduct));
