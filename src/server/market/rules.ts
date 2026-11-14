/**
 * Conclusión de mercado por reglas (respaldo determinista de la de Claude, misma forma). Sin cifras en el texto:
 * las cifras van aparte, con su fuente, en la interfaz.
 */
import type { ProductId } from '@/lib/market/catalog';
import type { ProductIndicators } from './indicators';
import type { DeptOutlook } from './pipeline/types';

export type Loc = 'es' | 'en';
export const tr = (l: Loc, es: string, en: string) => (l === 'en' ? en : es);

/** Nombres para los textos que arma el servidor (la UI usa los mensajes `products.*`). */
export const PRODUCT_NAMES: Record<ProductId, [es: string, en: string]> = {
  cafe: ['café', 'coffee'],
  cacao: ['cacao', 'cocoa'],
  platano: ['plátano', 'plantain'],
  banano: ['banano', 'banana'],
  yuca: ['yuca', 'cassava'],
  papa: ['papa', 'potato'],
  'papa-criolla': ['papa criolla', 'yellow potato'],
  maiz: ['maíz', 'maize'],
  frijol: ['fríjol', 'beans'],
  arroz: ['arroz', 'rice'],
  panela: ['panela', 'panela (cane sugar)'],
  arveja: ['arveja', 'peas'],
  aguacate: ['aguacate', 'avocado'],
  mango: ['mango', 'mango'],
  naranja: ['naranja', 'orange'],
  limon: ['limón', 'lime'],
  mandarina: ['mandarina', 'tangerine'],
  mora: ['mora', 'Andean blackberry'],
  lulo: ['lulo', 'lulo'],
  'tomate-arbol': ['tomate de árbol', 'tree tomato'],
  granadilla: ['granadilla', 'sweet granadilla'],
  maracuya: ['maracuyá', 'passion fruit'],
  pina: ['piña', 'pineapple'],
  papaya: ['papaya', 'papaya'],
  guayaba: ['guayaba', 'guava'],
  uchuva: ['uchuva', 'goldenberry'],
  tomate: ['tomate', 'tomato'],
  'cebolla-cabezona': ['cebolla cabezona', 'bulb onion'],
  'cebolla-larga': ['cebolla larga', 'spring onion'],
  zanahoria: ['zanahoria', 'carrot'],
  ahuyama: ['ahuyama', 'squash'],
  arracacha: ['arracacha', 'arracacha'],
  hortalizas: ['hortalizas', 'vegetables'],
  huevos: ['huevos', 'eggs'],
  miel: ['miel', 'honey'],
  otro: ['otro producto', 'other product'],
};

export const productName = (p: ProductId, l: Loc) => PRODUCT_NAMES[p][l === 'en' ? 1 : 0];

type Signal = { w: number; es: string; en: string };

/** Señales del mercado de un producto, de la más a la menos importante. */
export function marketSignals(x: ProductIndicators): Signal[] {
  const s: Signal[] = [];
  const c = x.change12mPct;
  if (c !== null && c >= 15) s.push({ w: 1, es: 'el precio en la central está más alto que hace un año', en: 'the wholesale price is higher than a year ago' });
  else if (c !== null && c <= -15) s.push({ w: -1, es: 'el precio en la central está más bajo que hace un año', en: 'the wholesale price is lower than a year ago' });
  const oversupply = (x.areaTrendPct !== null && x.areaTrendPct >= 15) || x.supplyTrend === 'up';
  if (oversupply && c !== null && c < 0)
    s.push({ w: -1, es: 'llega más producto a la central y el precio baja: hay riesgo de sobreoferta', en: 'more produce is reaching the market and prices are falling: oversupply risk' });
  else if (x.areaTrendPct !== null && x.areaTrendPct >= 25)
    s.push({ w: -0.5, es: 'en el departamento se está sembrando mucho más que antes', en: 'far more is being planted in the department than before' });
  if (x.volatility === 'high') s.push({ w: -0.5, es: 'el precio sube y baja mucho de un mes a otro', en: 'the price swings a lot from month to month' });
  if (x.market?.distanceKm !== null && x.market?.distanceKm !== undefined && x.market.distanceKm > 250 && x.perishable)
    s.push({ w: -0.5, es: 'la central de abastos está lejos para un producto que se daña rápido', en: 'the wholesale market is far for a perishable product' });
  if (x.yieldScope === 'dept' && x.yieldTHa !== null && x.nationalYieldTHa) {
    if (x.yieldTHa >= x.nationalYieldTHa * 1.15) s.push({ w: 0.5, es: 'en tu departamento rinde más que el promedio del país', en: 'yields in your department beat the national average' });
    else if (x.yieldTHa <= x.nationalYieldTHa * 0.8) s.push({ w: -0.5, es: 'en tu departamento rinde menos que el promedio del país', en: 'yields in your department are below the national average' });
  }
  if (x.credit && x.credit.small >= 50) s.push({ w: 0.25, es: 'hay crédito Finagro activo para este cultivo en tu departamento', en: 'Finagro credit for this crop is active in your department' });
  return s.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
}

export function ruleLabel(x: ProductIndicators): DeptOutlook['crops'][number]['label'] {
  const total = marketSignals(x).reduce((a, s) => a + s.w, 0);
  return total >= 0.75 ? 'favorable' : total <= -0.75 ? 'unfavorable' : 'neutral';
}

export function ruleWhy(x: ProductIndicators, l: Loc): string {
  const sig = marketSignals(x).slice(0, 2);
  const name = productName(x.product, l);
  if (!sig.length) {
    return x.priceCopKg === null
      ? tr(l, `No hay precio mayorista público de ${name} cerca; pregunta en tu cooperativa o a compradores locales.`, `There is no public wholesale price for ${name} nearby; ask your cooperative or local buyers.`)
      : tr(l, `El mercado de ${name} está estable: sin cambios fuertes de precio ni de oferta.`, `The ${name} market is stable: no big swings in price or supply.`);
  }
  const text = sig.map((s) => (l === 'en' ? s.en : s.es)).join(tr(l, ' y ', ' and '));
  return tr(l, `${capitalize(name)}: ${text}.`, `${capitalize(name)}: ${text}.`);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Conclusión por reglas para un departamento (mismo formato que la de Claude). */
export function rulesOutlook(dept: string, items: ProductIndicators[], now = new Date()): DeptOutlook {
  const crops = items.map((x) => ({
    product: x.product,
    label: ruleLabel(x),
    why: { es: ruleWhy(x, 'es'), en: ruleWhy(x, 'en') },
    confidence: (x.priceCopKg !== null && x.yieldScope === 'dept' ? 'medium' : 'low') as 'medium' | 'low',
  }));
  const good = crops.filter((c) => c.label === 'favorable').map((c) => c.product);
  const bad = crops.filter((c) => c.label === 'unfavorable').map((c) => c.product);
  const names = (ps: ProductId[], l: Loc) => ps.slice(0, 3).map((p) => productName(p, l)).join(', ');
  const headline = {
    es: good.length
      ? `Señales de mercado a favor: ${names(good, 'es')}.${bad.length ? ` Con cuidado: ${names(bad, 'es')}.` : ''}`
      : bad.length
        ? `Con cuidado en el mercado: ${names(bad, 'es')}.`
        : 'Mercado sin cambios fuertes para los cultivos de la zona.',
    en: good.length
      ? `Market signals in favour: ${names(good, 'en')}.${bad.length ? ` Be careful with: ${names(bad, 'en')}.` : ''}`
      : bad.length
        ? `Be careful in the market with: ${names(bad, 'en')}.`
        : 'No big market changes for the crops of this area.',
  };
  return { dept, generatedAt: now.toISOString(), by: 'rules', headline, crops };
}
