/**
 * Conclusiones de mercado por departamento con Claude (lo dispara n8n vía POST /api/market/jobs/outlook).
 *
 * Claude recibe SOLO cifras ya calculadas (indicadores de SIPSA, EVA, Finagro, TRM, insumos) y la anomalía
 * reciente de lluvia y temperatura de NASA POWER en la capital del departamento, y devuelve por producto una
 * etiqueta (favorable / neutral / desfavorable), una frase sin cifras en español e inglés y su confianza.
 * Reglas de honestidad: se descartan los textos con dígitos y los productos que no venían en la entrada; si
 * Claude falla o no hay clave, se usan las reglas deterministas (rules.ts).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { z } from 'zod';
import divipola from '@/server/events/divipola.json';
import { db, dbEnabled, ensureSchema } from '@/server/db';
import { powerRecent } from '@/server/powerRecent';
import type { ProductId } from '@/lib/market/catalog';
import { invalidateMarket, loadMarket } from './index';
import { productIndicators, topDeptProducts, type ProductIndicators } from './indicators';
import { productName, rulesOutlook } from './rules';
import type { DeptOutlook } from './pipeline/types';

const MODEL = 'claude-opus-5-5';
let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: 60_000, maxRetries: 1 }));

export const claudeOutlookEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AGENT_FORCE_MOCK !== 'true';

const SYSTEM = `You are a careful agricultural market analyst for Colombia. You help smallholder farmers decide what to plant by reading public market data next to NASA climate data.

You receive one Colombian department with, for each crop product:
- wholesale price (12-month median, COP/kg) at the nearest DANE SIPSA market, its year-on-year change and volatility;
- supply arriving at that market (year-on-year change), planted area trend in the department (EVA);
- local vs national yield (EVA), Finagro credit activity for the crop chain;
- national context: exchange rate (TRM) change, fertilizer price index change;
- the last weeks of rain and temperature vs normal from NASA POWER at the department capital.

For each product, return:
- label: "favorable", "neutral" or "unfavorable" for a farmer considering planting or keeping it in the next season;
- why_es and why_en: ONE short sentence (max 25 words) in plain language for farmers, explaining the main driver. NEVER write numbers, digits, percentages or prices: the app shows the figures next to your text. Do not invent facts that are not in the input. Mention oversupply risk when area or supply grows while prices fall; remember a high price today can fall if many people plant the same crop.
- confidence: "high" only when price, supply and local yield data all agree; "low" when key data is missing.
Also return headline_es and headline_en: one sentence summarizing the department's market outlook, without numbers.
Write Spanish with informal "tú"-friendly, simple words. Never promise income. The tool supports, and does not replace, the farmer's judgement or local experts.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline_es', 'headline_en', 'crops'],
  properties: {
    headline_es: { type: 'string' },
    headline_en: { type: 'string' },
    crops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['product', 'label', 'why_es', 'why_en', 'confidence'],
        properties: {
          product: { type: 'string' },
          label: { type: 'string', enum: ['favorable', 'neutral', 'unfavorable'] },
          why_es: { type: 'string' },
          why_en: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const;

export const Output = z.object({
  headline_es: z.string(),
  headline_en: z.string(),
  crops: z.array(
    z.object({
      product: z.string(),
      label: z.enum(['favorable', 'neutral', 'unfavorable']),
      why_es: z.string(),
      why_en: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
});

const hasDigits = (s: string) => /\d/.test(s);
const clip = (s: string, n = 220) => s.trim().replace(/\s+/g, ' ').slice(0, n);

/** Resumen compacto de un producto para el prompt (solo cifras ya calculadas). */
function digest(x: ProductIndicators) {
  return {
    product: x.product,
    name_es: productName(x.product, 'es'),
    priceCopKg: x.priceCopKg,
    market: x.market?.name ?? null,
    distanceKm: x.market?.distanceKm ?? null,
    priceChange12mPct: x.change12mPct,
    volatility: x.volatility,
    supplyChange12mPct: x.supplyChangePct,
    plantedAreaTrendPct: x.areaTrendPct,
    yieldTHa: x.yieldTHa,
    yieldScope: x.yieldScope,
    nationalYieldTHa: x.nationalYieldTHa,
    finagroCredits: x.credit ? { chain: x.credit.chain, total: x.credit.n, smallProducers: x.credit.small } : null,
    perennial: x.perennial,
    monthsToFirstHarvest: x.monthsToFirstHarvest,
  };
}

type Climate = { rainVsNormalPct: number | null; tmaxVsNormalC: number | null } | null;

async function climateAt(lat: number, lon: number): Promise<Climate> {
  const p = await powerRecent(lat, lon).catch(() => null);
  if (!p) return null;
  const days = p.days.slice(-30);
  const rain = days.reduce((a, d) => a + (d.precip ?? 0), 0);
  const normal = days.reduce((a, d) => a + (p.climPrecipMmDay[Number(d.date.slice(5, 7)) - 1] ?? 0), 0);
  const tmax = days.filter((d) => d.tmax !== null);
  const tNormal = tmax.reduce((a, d) => a + (p.climTmax[Number(d.date.slice(5, 7)) - 1] ?? 0), 0) / Math.max(1, tmax.length);
  const tMean = tmax.reduce((a, d) => a + d.tmax!, 0) / Math.max(1, tmax.length);
  return {
    rainVsNormalPct: normal > 0 ? Math.round(((rain - normal) / normal) * 100) : null,
    tmaxVsNormalC: tmax.length ? Math.round((tMean - tNormal) * 10) / 10 : null,
  };
}

export async function claudeOutlook(
  dept: { code: string; name: string },
  items: ProductIndicators[],
  context: { trmChange12mPct: number | null; fertilizerChange12mPct: number | null; climate: Climate },
  now = new Date(),
): Promise<DeptOutlook> {
  const msg = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: betaJSONSchemaOutputFormat(OUTPUT_SCHEMA) },
    messages: [{ role: 'user', content: JSON.stringify({ department: dept.name, ...context, products: items.map(digest) }) }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('claude_refusal');
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return mergeClaudeOutput(Output.parse(JSON.parse(text)), dept.code, items, now);
}

/**
 * Une la salida de Claude con las reglas: un producto que falta o un texto con cifras se reemplaza por la regla,
 * y se ignoran los productos que no venían en la entrada.
 */
export function mergeClaudeOutput(out: z.infer<typeof Output>, dept: string, items: ProductIndicators[], now = new Date()): DeptOutlook {
  const rules = rulesOutlook(dept, items, now);
  const crops = items.map((x) => {
    const c = out.crops.find((y) => y.product === x.product);
    const r = rules.crops.find((y) => y.product === x.product)!;
    if (!c || hasDigits(c.why_es) || hasDigits(c.why_en)) return r;
    return { product: x.product, label: c.label, why: { es: clip(c.why_es), en: clip(c.why_en) }, confidence: c.confidence };
  });
  const headline =
    hasDigits(out.headline_es) || hasDigits(out.headline_en) ? rules.headline : { es: clip(out.headline_es, 240), en: clip(out.headline_en, 240) };
  return { dept, generatedAt: now.toISOString(), by: 'claude', model: MODEL, headline, crops };
}

const capitalOf = (dept: string): { lat: number; lon: number } | null => {
  const m = divipola as unknown as Record<string, [number, number, string, string]>;
  const r = m[`${dept}001`] ?? Object.entries(m).find(([c]) => c.startsWith(dept))?.[1];
  return r ? { lat: r[0], lon: r[1] } : null;
};

export type OutlookReport = { dept: string; by: 'claude' | 'rules'; products: number; error?: string };

/** Genera y guarda las conclusiones de los departamentos pedidos (todos si no se dice), 4 a la vez. */
export async function buildOutlooks({ depts, now = new Date() }: { depts?: string[]; now?: Date } = {}): Promise<OutlookReport[]> {
  if (!dbEnabled()) throw new Error('DATABASE_URL no está configurada');
  await ensureSchema();
  const sql = db();
  const set = await loadMarket();
  const codes = (depts?.length ? depts : [...set.depts.keys()]).filter((c) => set.depts.has(c));
  const useClaude = claudeOutlookEnabled();
  const reports: OutlookReport[] = [];
  const queue = [...codes];
  const worker = async () => {
    for (let code = queue.shift(); code; code = queue.shift()) {
      const dept = set.depts.get(code)!;
      const at = capitalOf(code);
      if (!at) continue;
      const items = topDeptProducts(dept, 6).map((p: ProductId) => productIndicators({ centrals: set.centrals, dept, national: set.national }, p, at.lat, at.lon));
      if (!items.length) continue;
      let outlook: DeptOutlook;
      let error: string | undefined;
      try {
        outlook = useClaude
          ? await claudeOutlook({ code, name: dept.name }, items, {
              trmChange12mPct: set.national.trm?.change12mPct ?? null,
              fertilizerChange12mPct: set.national.inputs?.fertChange12mPct ?? null,
              climate: await climateAt(at.lat, at.lon),
            }, now)
          : rulesOutlook(code, items, now);
      } catch (e) {
        error = (e as Error).message.slice(0, 200);
        outlook = rulesOutlook(code, items, now);
      }
      await sql`
        insert into fieldshift.market_kv (kind, key, payload, as_of, updated_at)
        values ('outlook', ${code}, ${sql.json(outlook as never)}, ${now.toISOString().slice(0, 10)}, now())
        on conflict (kind, key) do update set payload = excluded.payload, as_of = excluded.as_of, updated_at = now()`;
      reports.push({ dept: code, by: outlook.by, products: outlook.crops.length, ...(error ? { error } : {}) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, codes.length) }, worker));
  invalidateMarket();
  return reports.sort((a, b) => a.dept.localeCompare(b.dept));
}
