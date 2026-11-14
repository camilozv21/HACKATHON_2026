/**
 * Cruce de nombres de las fuentes colombianas con el catálogo de productos (src/lib/market/catalog.ts).
 * - SIPSA (DANE): `artiNombre` del precio mayorista. Por producto se elige UN artículo representativo, en orden
 *   de preferencia (el de mayor volumen y más estable); para el abastecimiento se suman todos los del producto.
 * - EVA (UPRA/MinAgricultura): `cultivo` y `desagregaci_n_cultivo`.
 * - Finagro: `cadena`.
 */
import type { ProductId } from '../../../lib/market/catalog.ts';

/** Igual que `normalizeName` de src/server/text.ts (copiado: este directorio no usa alias `@/`). */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();

/** Artículos SIPSA preferidos para el precio (normalizados), del mejor al peor. */
const PRICE_ARTICLES: Partial<Record<ProductId, string[]>> = {
  platano: ['platano harton verde', 'platano harton verde llanero', 'platano harton verde eje cafetero', 'platano dominico harton verde'],
  banano: ['banano criollo', 'banano uraba', 'banano bocadillo'],
  yuca: ['yuca llanera', 'yuca chirosa', 'yuca ica', 'yuca criolla'],
  papa: ['papa parda pastusa', 'papa superior', 'papa unica', 'papa r 12 roja', 'papa suprema', 'papa sabanera'],
  'papa-criolla': ['papa criolla limpia', 'papa criolla sucia'],
  maiz: ['maiz amarillo cascara', 'maiz blanco cascara', 'maiz amarillo trillado', 'maiz blanco trillado'],
  frijol: ['frijol cargamanto rojo', 'frijol radical', 'frijol nima calima', 'frijol cargamanto blanco', 'frijol bolon rojo'],
  arroz: ['arroz de primera', 'arroz de segunda'],
  panela: ['panela cuadrada morena', 'panela redonda morena', 'panela cuadrada blanca', 'panela redonda blanca'],
  arveja: ['arveja verde en vaina', 'arveja verde en vaina pastusa'],
  aguacate: ['aguacate hass', 'aguacate papelillo', 'aguacate comun'],
  mango: ['mango tommy', 'mango comun', 'mango de azucar'],
  naranja: ['naranja valencia', 'naranja comun', 'naranja sweet'],
  limon: ['limon tahiti', 'limon comun'],
  mandarina: ['mandarina arrayana', 'mandarina oneco', 'mandarina comun'],
  mora: ['mora de castilla'],
  lulo: ['lulo'],
  'tomate-arbol': ['tomate de arbol'],
  granadilla: ['granadilla'],
  maracuya: ['maracuya'],
  pina: ['pina perolera', 'pina gold', 'pina manzana'],
  papaya: ['papaya maradol', 'papaya tainung', 'papaya paulina', 'papaya hawaiana'],
  guayaba: ['guayaba pera', 'guayaba comun'],
  uchuva: ['uchuva con cascara'],
  tomate: ['tomate chonto', 'tomate larga vida', 'tomate riogrande'],
  'cebolla-cabezona': ['cebolla cabezona blanca', 'cebolla cabezona roja'],
  'cebolla-larga': ['cebolla junca', 'cebolla junca aquitania', 'cebolla junca tenerife', 'cebolla junca berlin', 'cebolla junca pastusa'],
  zanahoria: ['zanahoria'],
  ahuyama: ['ahuyama'],
  arracacha: ['arracacha amarilla', 'arracacha blanca'],
};

/** Prefijos para sumar el abastecimiento (todas las variedades del producto). Se excluyen los importados. */
const SUPPLY_PREFIX: Partial<Record<ProductId, string[]>> = {
  platano: ['platano'],
  banano: ['banano'],
  yuca: ['yuca'],
  papa: ['papa parda', 'papa superior', 'papa unica', 'papa r 12', 'papa suprema', 'papa sabanera', 'papa ruby', 'papa rubi', 'papa capira', 'papa nevada', 'papa betina', 'papa morasurco', 'papa san felix', 'papa tocarrena'],
  'papa-criolla': ['papa criolla'],
  maiz: ['maiz'],
  frijol: ['frijol'],
  arroz: ['arroz'],
  panela: ['panela'],
  arveja: ['arveja verde en vaina'],
  aguacate: ['aguacate'],
  mango: ['mango'],
  naranja: ['naranja'],
  limon: ['limon'],
  mandarina: ['mandarina'],
  mora: ['mora'],
  lulo: ['lulo'],
  'tomate-arbol': ['tomate de arbol'],
  granadilla: ['granadilla'],
  maracuya: ['maracuya'],
  pina: ['pina'],
  papaya: ['papaya'],
  guayaba: ['guayaba'],
  uchuva: ['uchuva'],
  tomate: ['tomate chonto', 'tomate larga vida', 'tomate riogrande', 'tomate rinon', 'tomate cherry'],
  'cebolla-cabezona': ['cebolla cabezona'],
  'cebolla-larga': ['cebolla junca'],
  zanahoria: ['zanahoria'],
  ahuyama: ['ahuyama'],
  arracacha: ['arracacha'],
};

const priceIndex = new Map<string, { product: ProductId; rank: number }>();
for (const [product, names] of Object.entries(PRICE_ARTICLES) as [ProductId, string[]][]) {
  names.forEach((n, rank) => priceIndex.set(n, { product, rank }));
}

/** Producto y prioridad de un artículo SIPSA para el precio (null si no se sigue). */
export function sipsaPriceProduct(artiNombre: string): { product: ProductId; rank: number } | null {
  return priceIndex.get(norm(artiNombre)) ?? null;
}

/** Producto de un artículo SIPSA para sumar abastecimiento (null si no se sigue o es importado). */
export function sipsaSupplyProduct(artiNombre: string): ProductId | null {
  const n = norm(artiNombre);
  if (/importad|ecuatorian|peruan|chilen|estadounid/.test(n)) return null;
  let best: { product: ProductId; len: number } | null = null;
  for (const [product, prefixes] of Object.entries(SUPPLY_PREFIX) as [ProductId, string[]][]) {
    for (const p of prefixes) {
      // "papa criolla" no debe contar como "papa"; gana el prefijo más largo.
      if ((n === p || n.startsWith(`${p} `)) && (!best || p.length > best.len)) best = { product, len: p.length };
    }
  }
  return best?.product ?? null;
}

/** Producto de una fila de EVA (null si no se sigue). */
export function evaProduct(cultivo: string, desagregacion?: string | null): ProductId | null {
  const c = norm(cultivo);
  const d = norm(desagregacion ?? '');
  switch (c) {
    case 'cafe':
      return 'cafe';
    case 'cacao':
      return 'cacao';
    case 'platano':
      return 'platano';
    case 'banano':
      return 'banano';
    case 'yuca':
      return 'yuca';
    case 'papa':
      return d.includes('criolla') ? 'papa-criolla' : 'papa';
    case 'maiz':
      return 'maiz';
    case 'frijol':
      return 'frijol';
    case 'arroz':
      return 'arroz';
    case 'cana':
      return d.includes('panelera') ? 'panela' : null;
    case 'arveja':
      return 'arveja';
    case 'aguacate':
      return 'aguacate';
    case 'mango':
      return 'mango';
    case 'naranja':
      return 'naranja';
    case 'limon':
      return 'limon';
    case 'mandarina':
      return 'mandarina';
    case 'mora':
      return 'mora';
    case 'lulo':
      return 'lulo';
    case 'tomate de arbol':
      return 'tomate-arbol';
    case 'granadilla':
      return 'granadilla';
    case 'maracuya':
      return 'maracuya';
    case 'pina':
      return 'pina';
    case 'papaya':
      return 'papaya';
    case 'guayaba':
      return 'guayaba';
    case 'uchuva':
      return 'uchuva';
    case 'tomate':
      return 'tomate';
    case 'cebolla de bulbo':
      return 'cebolla-cabezona';
    case 'cebolla de rama':
      return 'cebolla-larga';
    case 'zanahoria':
      return 'zanahoria';
    case 'ahuyama':
      return 'ahuyama';
    case 'arracacha':
      return 'arracacha';
    default:
      return null;
  }
}

/** Productos que financia una cadena de Finagro. */
export function finagroProducts(cadena: string): ProductId[] {
  switch (norm(cadena)) {
    case 'cafe':
      return ['cafe'];
    case 'cacao':
      return ['cacao'];
    case 'platano':
      return ['platano'];
    case 'banano':
      return ['banano'];
    case 'papa':
      return ['papa', 'papa-criolla'];
    case 'hortalizas':
      return ['hortalizas', 'tomate', 'cebolla-cabezona', 'cebolla-larga', 'zanahoria', 'ahuyama'];
    case 'arroz':
      return ['arroz'];
    case 'cana panelera':
      return ['panela'];
    case 'yuca':
      return ['yuca'];
    case 'aguacate':
      return ['aguacate'];
    case 'maiz':
      return ['maiz'];
    case 'citricos':
      return ['naranja', 'limon', 'mandarina'];
    case 'otros frutales':
      return ['mora', 'lulo', 'tomate-arbol', 'granadilla', 'maracuya', 'pina', 'papaya', 'guayaba', 'uchuva', 'mango'];
    default:
      return [];
  }
}
