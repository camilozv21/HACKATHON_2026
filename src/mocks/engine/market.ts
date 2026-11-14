/**
 * Mercado de Colombia en el motor de recomendaciones.
 *
 * El puntaje de "ingresos" sigue saliendo de `Agro.value` (margen relativo genérico entre cultivos), pero cada
 * cultivo se multiplica por un FACTOR LOCAL ACOTADO (0,6–1,4) que sale de datos públicos:
 *  - ingreso bruto local vs. nacional del mismo cultivo: precio mayorista de la central más cercana (mediana de
 *    12 meses, DANE SIPSA) × rendimiento del departamento (EVA), frente a la mediana nacional × rendimiento nacional
 *    (media geométrica, acotada 0,75–1,3);
 *  - tendencia del precio (suave: perseguir picos lleva a sobreoferta), volatilidad, sobreoferta (más área sembrada
 *    o más producto llegando a la central con el precio bajando), distancia a la central para lo perecedero y
 *    subida de fertilizantes para los cultivos que más nitrógeno piden.
 * El factor se atenúa si la cosecha es sobre todo para la casa (encuesta: `purpose`).
 * Las cifras en pesos solo se muestran como evidencia; nunca son el puntaje.
 */
import type { CropId, CropSeason, Evidence, MarketCrop, StrategyMarket } from '@/lib/api/contract';
import { CROP_PRODUCT, type ProductId } from '@/lib/market/catalog';
import type { MarketArea, ProductMarket } from '@/server/market';
import { productName } from '@/server/market/rules';

type Loc = 'es' | 'en';
const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type EngineMarket = MarketArea;
export type Purpose = 'home' | 'sale' | 'both' | null | undefined;

/** Cultivos que más nitrógeno piden: les pega más la subida de fertilizantes. */
const FEEDERS = new Set<ProductId>(['maiz', 'papa', 'papa-criolla', 'arroz', 'tomate', 'hortalizas', 'cebolla-cabezona', 'cebolla-larga']);

/** Factor local (0,6–1,4) del ingreso de un producto. 1 = el mercado no cambia nada. */
export function incomeFactor(p: ProductMarket, fertChange12mPct: number | null): number {
  let f = 1;
  const priceRatio = p.priceCopKg !== null && p.nationalPriceCopKg ? clamp(p.priceCopKg / p.nationalPriceCopKg, 0.7, 1.3) : 1;
  const yieldRatio = p.yieldScope === 'dept' && p.yieldTHa !== null && p.nationalYieldTHa ? clamp(p.yieldTHa / p.nationalYieldTHa, 0.6, 1.4) : 1;
  // Media geométrica: el precio de la central y el rendimiento del departamento son señales ruidosas frente a lo
  // que pasa en una finca; la raíz conserva la dirección y modera la magnitud (0,72 → 0,85).
  f *= clamp(Math.sqrt(priceRatio * yieldRatio), 0.75, 1.3);
  const c = p.change12mPct;
  if (c !== null) f *= c >= 15 ? 1.04 : c <= -15 ? 0.94 : 1;
  if (p.volatility === 'high') f *= 0.94;
  else if (p.volatility === 'medium') f *= 0.98;
  const moreSupply = (p.areaTrendPct !== null && p.areaTrendPct >= 15) || p.supplyTrend === 'up';
  if (moreSupply && c !== null && c < -5) f *= 0.92;
  const km = p.market?.distanceKm ?? null;
  if (km === null) f *= p.priceCopKg === null ? 1 : 0.95;
  else if (p.perishable && km > 250) f *= 0.9;
  else if (km > 400) f *= 0.93;
  if (fertChange12mPct !== null && fertChange12mPct >= 10 && FEEDERS.has(p.product as ProductId)) f *= 0.97;
  return Math.round(clamp(f, 0.6, 1.4) * 100) / 100;
}

const DAMPING: Record<'home' | 'sale' | 'both', number> = { home: 0.3, both: 0.7, sale: 1 };

/** Factores por cultivo del motor (solo los que tienen producto de mercado con datos). */
export function incomeFactors(m: EngineMarket | null | undefined, purpose: Purpose): Partial<Record<CropId, number>> {
  if (!m) return {};
  const damp = DAMPING[purpose ?? 'both'];
  const out: Partial<Record<CropId, number>> = {};
  const fert = m.inputs?.fertChange12mPct ?? null;
  for (const [crop, product] of Object.entries(CROP_PRODUCT) as [CropId, ProductId][]) {
    const p = m.products.find((x) => x.product === product);
    if (!p || (p.priceCopKg === null && p.yieldScope !== 'dept')) continue;
    const f = incomeFactor(p, fert);
    out[crop] = Math.round((1 + (f - 1) * damp) * 100) / 100;
  }
  return out;
}

const money = (n: number, l: Loc) => `$${Math.round(n).toLocaleString(l === 'en' ? 'en-US' : 'es-CO')}`;
const pct = (n: number, l: Loc) => `${n > 0 ? '+' : ''}${n.toLocaleString(l === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 0 })} %`;

/** Cultivos que se venden en la estrategia, con su producto de mercado. */
function marketCrops(seasons: CropSeason[]): { crop: CropId; product: ProductId }[] {
  const seen = new Set<CropId>();
  const out: { crop: CropId; product: ProductId }[] = [];
  for (const s of seasons) {
    if (s.role === 'cover' || s.role === 'fallow' || seen.has(s.crop)) continue;
    const product = CROP_PRODUCT[s.crop];
    if (!product) continue;
    seen.add(s.crop);
    out.push({ crop: s.crop, product });
  }
  return out;
}

/** Riesgos de mercado de un producto (frases cortas, sin jerga). */
function productRisks(p: ProductMarket, l: Loc): string[] {
  const name = productName(p.product as ProductId, l);
  const out: string[] = [];
  const c = p.change12mPct;
  const moreSupply = (p.areaTrendPct !== null && p.areaTrendPct >= 15) || p.supplyTrend === 'up';
  if (moreSupply && c !== null && c < -5)
    out.push(tr(l, `Sobreoferta de ${name}: llega más a la central y el precio baja. Vende por contrato o busca otro comprador.`, `${name} oversupply: more is reaching the market and the price is falling. Sell under contract or find another buyer.`));
  else if (c !== null && c <= -15) out.push(tr(l, `El precio mayorista de ${name} bajó ${pct(c, l)} frente al año pasado.`, `The wholesale price of ${name} fell ${pct(c, l)} from last year.`));
  else if (c !== null && c >= 25)
    out.push(
      tr(
        l,
        `Hoy el precio de ${name} está alto, pero puede bajar si muchos siembran lo mismo.`,
        `The price of ${name} is high today, but it can drop if many people plant the same crop.`,
      ),
    );
  if (p.volatility === 'high') out.push(tr(l, `El precio de ${name} sube y baja mucho de un mes a otro: escalona la siembra.`, `The ${name} price swings a lot month to month: stagger your planting.`));
  if (p.perishable && p.market?.distanceKm && p.market.distanceKm > 250)
    out.push(tr(l, `La central más cercana con precio de ${name} está a ${p.market.distanceKm} km: cuenta el transporte.`, `The nearest market pricing ${name} is ${p.market.distanceKm} km away: count transport costs.`));
  if (p.perennial && p.monthsToFirstHarvest && p.monthsToFirstHarvest >= 12)
    out.push(
      tr(
        l,
        `Desde la siembra, la primera cosecha de ${name} tarda unos ${p.monthsToFirstHarvest} meses: necesitas con qué vivir mientras tanto.`,
        `From planting, the first ${name} harvest takes about ${p.monthsToFirstHarvest} months: you need income in the meantime.`,
      ),
    );
  return out;
}

/** Bloque "Mercado" de una estrategia (undefined si ningún cultivo tiene datos de mercado). */
export function strategyMarket(
  seasons: CropSeason[],
  m: EngineMarket | null | undefined,
  factors: Partial<Record<CropId, number>>,
  l: Loc,
  isCurrent: boolean,
): StrategyMarket | undefined {
  if (!m) return undefined;
  const items = marketCrops(seasons)
    .map(({ crop, product }) => ({ crop, p: m.products.find((x) => x.product === product) }))
    .filter((x): x is { crop: CropId; p: ProductMarket } => Boolean(x.p))
    .slice(0, 6);
  if (!items.length) return undefined;

  const crops: MarketCrop[] = items.map(({ crop, p }) => ({
    crop,
    product: p.product,
    priceCopKg: p.priceCopKg,
    market: p.market?.name ?? null,
    distanceKm: p.market?.distanceKm ?? null,
    month: p.lastMonth,
    change12mPct: p.change12mPct,
    volatility: p.volatility,
    supplyTrend: p.supplyTrend,
    yieldTHa: p.yieldTHa,
    yieldScope: p.yieldScope,
    revenueCopHa: p.revenueCopHa,
    monthsToFirstHarvest: p.perennial && !isCurrent ? p.monthsToFirstHarvest : null,
    credit: p.credit ? { chain: p.credit.chain, n: p.credit.n, small: p.credit.small } : null,
    factor: factors[crop] ?? 1,
    outlook: p.outlook,
  }));

  const risks = [...new Set(items.flatMap(({ p }) => productRisks(p, l).filter((r) => isCurrent ? !r.includes(tr(l, 'primera cosecha', 'first harvest')) : true)))].slice(0, 4);
  const gaps: string[] = [
    tr(
      l,
      'Son precios mayoristas (lo que se paga en la central): en finca te pagan menos, y no descontamos tus costos de producción.',
      'These are wholesale prices (what the market pays): at the farm gate you get less, and we don’t subtract your production costs.',
    ),
  ];
  const noPrice = items.filter(({ p }) => p.priceCopKg === null).map(({ p }) => productName(p.product as ProductId, l));
  if (noPrice.length)
    gaps.push(tr(l, `No hay precio mayorista público cerca para: ${noPrice.join(', ')}. Pregunta en tu cooperativa.`, `No public wholesale price nearby for: ${noPrice.join(', ')}. Ask your cooperative.`));
  if (items.some(({ p }) => p.product === 'tomate'))
    gaps.push(tr(l, 'Para las hortalizas usamos el tomate chonto como referencia.', 'For vegetables we use chonto tomato as the reference.'));
  if (items.some(({ p }) => p.yieldScope === 'national'))
    gaps.push(tr(l, 'En tu departamento casi no se siembra alguno de estos cultivos: usamos el rendimiento promedio del país.', 'Some of these crops are rarely grown in your department: we used the national average yield.'));

  const withPrice = crops.filter((c) => c.priceCopKg !== null);
  const lead = [...crops].sort((a, b) => (b.revenueCopHa ?? 0) - (a.revenueCopHa ?? 0))[0]!;
  const leadName = productName(lead.product as ProductId, l);
  const summary =
    lead.priceCopKg !== null && lead.market
      ? tr(
          l,
          `${capitalize(leadName)}: ${money(lead.priceCopKg, l)}/kg en ${lead.market}${lead.distanceKm !== null ? ` (${lead.distanceKm} km)` : ''}${lead.outlook ? ` · ${OUTLOOK_WORD[lead.outlook.label][l]}` : ''}.`,
          `${capitalize(leadName)}: ${money(lead.priceCopKg, l)}/kg at ${lead.market}${lead.distanceKm !== null ? ` (${lead.distanceKm} km)` : ''}${lead.outlook ? ` · ${OUTLOOK_WORD[lead.outlook.label][l]}` : ''}.`,
        )
      : tr(l, `Sin precio mayorista público cerca para ${leadName}; usamos el rendimiento de EVA.`, `No public wholesale price nearby for ${leadName}; we used EVA yields.`);

  const confidence: StrategyMarket['confidence'] =
    withPrice.length === crops.length && crops.every((c) => c.yieldScope === 'dept') && m.source === 'db' ? 'medium' : withPrice.length ? 'medium' : 'low';
  return { summary, crops, confidence: m.source === 'seed' && confidence === 'medium' && staleSeed(m.asOf) ? 'low' : confidence, risks, gaps, asOf: m.asOf };
}

const OUTLOOK_WORD: Record<'favorable' | 'neutral' | 'unfavorable', Record<Loc, string>> = {
  favorable: { es: 'mercado a favor', en: 'market in favour' },
  neutral: { es: 'mercado estable', en: 'stable market' },
  unfavorable: { es: 'mercado en contra', en: 'market against' },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** El seed tiene más de 4 meses: baja la confianza. */
const staleSeed = (asOf: string, now = new Date()) => {
  const [y, mo] = asOf.split('-').map(Number) as [number, number];
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - mo) > 4;
};

/** Evidencia de mercado para la lista "Evidencia" (máx. 2 frases con fuente). */
export function marketEvidence(market: StrategyMarket | undefined, l: Loc): Omit<Evidence, 'id'>[] {
  if (!market) return [];
  const out: Omit<Evidence, 'id'>[] = [];
  const priced = market.crops.filter((c) => c.priceCopKg !== null && c.market);
  for (const c of priced.slice(0, 1)) {
    const name = productName(c.product as ProductId, l);
    const trend = c.change12mPct !== null ? tr(l, `, ${pct(c.change12mPct, l)} en un año`, `, ${pct(c.change12mPct, l)} in a year`) : '';
    out.push({
      source: 'SIPSA',
      statement: tr(l, `DANE SIPSA: ${name} a ${money(c.priceCopKg!, l)}/kg en ${c.market} (mediana de 12 meses${trend}).`, `DANE SIPSA: ${name} at ${money(c.priceCopKg!, l)}/kg at ${c.market} (12-month median${trend}).`),
      rule: tr(l, 'El precio de la central cercana ajusta el puntaje de ingresos.', 'The nearby market price adjusts the income score.'),
    });
  }
  const local = market.crops.find((c) => c.yieldScope === 'dept' && c.yieldTHa !== null);
  if (local) {
    const name = productName(local.product as ProductId, l);
    out.push({
      source: 'EVA',
      statement: tr(l, `EVA: en tu departamento, ${name} rinde ~${local.yieldTHa!.toLocaleString('es-CO')} t/ha.`, `EVA: ${name} yields ~${local.yieldTHa!.toLocaleString('en-US')} t/ha in your department.`),
      rule: tr(l, 'Con el rendimiento local estimamos el ingreso bruto por hectárea.', 'Local yield gives the gross income per hectare.'),
    });
  }
  return out;
}

/** Texto de vacíos que reemplaza al genérico "no conocemos tus precios" cuando hay datos de mercado. */
export function marketGap(m: EngineMarket, l: Loc): string {
  const where = m.nearestMarket ? tr(l, ` (central más cercana: ${m.nearestMarket.name})`, ` (nearest market: ${m.nearestMarket.name})`) : '';
  return tr(
    l,
    `No conocemos tus rendimientos ni lo que te pagan en finca: usamos precios mayoristas de DANE SIPSA hasta ${m.asOf.slice(0, 7)}${where} y rendimientos de tu departamento.`,
    `We don’t know your yields or farm-gate prices: we used DANE SIPSA wholesale prices up to ${m.asOf.slice(0, 7)}${where} and your department’s yields.`,
  );
}
