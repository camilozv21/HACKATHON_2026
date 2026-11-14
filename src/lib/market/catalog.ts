/**
 * Catálogo de productos que se venden y se siguen en el mercado colombiano (SIPSA, EVA, Finagro).
 * Es más amplio que `CROP_IDS` del motor: incluye cacao, aguacate y frutas que el motor de rotaciones no modela.
 * `crop` enlaza con el motor cuando existe. Seguro para el cliente: sin zod ni código de servidor.
 *
 * `monthsToFirstHarvest`: meses aproximados desde la siembra hasta la primera cosecha (cambia con la variedad,
 * el clima y el manejo). Sirve para avisar del flujo de caja de los perennes, nunca como dato exacto.
 */
import type { CropId } from '@/lib/api/contract';

export const PRODUCT_IDS = [
  'cafe',
  'cacao',
  'platano',
  'banano',
  'yuca',
  'papa',
  'papa-criolla',
  'maiz',
  'frijol',
  'arroz',
  'panela',
  'arveja',
  'aguacate',
  'mango',
  'naranja',
  'limon',
  'mandarina',
  'mora',
  'lulo',
  'tomate-arbol',
  'granadilla',
  'maracuya',
  'pina',
  'papaya',
  'guayaba',
  'uchuva',
  'tomate',
  'cebolla-cabezona',
  'cebolla-larga',
  'zanahoria',
  'ahuyama',
  'arracacha',
  'hortalizas',
  'huevos',
  'miel',
  'otro',
] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export const LISTING_UNITS = ['kg', 't', 'arroba', 'bulto', 'carga', 'racimo', 'canastilla', 'unidad'] as const;
export type ListingUnit = (typeof LISTING_UNITS)[number];

/** Kilos por unidad cuando la unidad es de peso fijo (arroba 12,5 kg; bulto 50 kg; carga 125 kg). */
export const KG_PER_UNIT: Partial<Record<ListingUnit, number>> = { kg: 1, t: 1000, arroba: 12.5, bulto: 50, carga: 125 };

export type ProductGroup = 'cafe-cacao' | 'fruta' | 'tuberculo' | 'grano' | 'hortaliza' | 'procesado' | 'animal' | 'otro';

export type ProductMeta = {
  group: ProductGroup;
  /** Cultivo del motor de rotaciones, si lo hay. */
  crop?: CropId;
  perennial?: boolean;
  monthsToFirstHarvest?: number;
  /** Se daña rápido: la distancia a la central pesa más. */
  perishable?: boolean;
  /** Unidades que tienen sentido al publicar (la primera es la sugerida). */
  units: ListingUnit[];
};

export const PRODUCT_META: Record<ProductId, ProductMeta> = {
  cafe: { group: 'cafe-cacao', crop: 'coffee', perennial: true, monthsToFirstHarvest: 24, units: ['carga', 'arroba', 'kg'] },
  cacao: { group: 'cafe-cacao', perennial: true, monthsToFirstHarvest: 30, units: ['kg', 'arroba', 't'] },
  platano: { group: 'fruta', crop: 'plantain', perennial: true, monthsToFirstHarvest: 12, perishable: true, units: ['racimo', 'kg', 'canastilla'] },
  banano: { group: 'fruta', crop: 'plantain', perennial: true, monthsToFirstHarvest: 12, perishable: true, units: ['racimo', 'kg', 'canastilla'] },
  yuca: { group: 'tuberculo', crop: 'cassava', monthsToFirstHarvest: 10, units: ['bulto', 'kg', 't'] },
  papa: { group: 'tuberculo', crop: 'potato', monthsToFirstHarvest: 5, units: ['bulto', 'arroba', 'kg', 't'] },
  'papa-criolla': { group: 'tuberculo', crop: 'potato', monthsToFirstHarvest: 4, perishable: true, units: ['bulto', 'arroba', 'kg'] },
  maiz: { group: 'grano', crop: 'maize', monthsToFirstHarvest: 5, units: ['bulto', 'kg', 't'] },
  frijol: { group: 'grano', crop: 'beans', monthsToFirstHarvest: 4, units: ['bulto', 'arroba', 'kg'] },
  arroz: { group: 'grano', crop: 'rice', monthsToFirstHarvest: 4, units: ['bulto', 't', 'kg'] },
  panela: { group: 'procesado', crop: 'sugarcane', perennial: true, monthsToFirstHarvest: 18, units: ['kg', 'arroba', 'carga'] },
  arveja: { group: 'grano', monthsToFirstHarvest: 4, perishable: true, units: ['bulto', 'arroba', 'kg'] },
  aguacate: { group: 'fruta', perennial: true, monthsToFirstHarvest: 36, perishable: true, units: ['kg', 'canastilla', 't'] },
  mango: { group: 'fruta', perennial: true, monthsToFirstHarvest: 48, perishable: true, units: ['kg', 'canastilla', 't'] },
  naranja: { group: 'fruta', perennial: true, monthsToFirstHarvest: 36, units: ['kg', 'bulto', 't'] },
  limon: { group: 'fruta', perennial: true, monthsToFirstHarvest: 30, units: ['kg', 'bulto', 't'] },
  mandarina: { group: 'fruta', perennial: true, monthsToFirstHarvest: 36, units: ['kg', 'bulto', 't'] },
  mora: { group: 'fruta', perennial: true, monthsToFirstHarvest: 8, perishable: true, units: ['kg', 'canastilla'] },
  lulo: { group: 'fruta', perennial: true, monthsToFirstHarvest: 9, perishable: true, units: ['kg', 'canastilla'] },
  'tomate-arbol': { group: 'fruta', perennial: true, monthsToFirstHarvest: 12, perishable: true, units: ['kg', 'canastilla'] },
  granadilla: { group: 'fruta', perennial: true, monthsToFirstHarvest: 10, perishable: true, units: ['kg', 'canastilla'] },
  maracuya: { group: 'fruta', perennial: true, monthsToFirstHarvest: 8, perishable: true, units: ['kg', 'canastilla'] },
  pina: { group: 'fruta', monthsToFirstHarvest: 16, units: ['unidad', 'kg', 't'] },
  papaya: { group: 'fruta', monthsToFirstHarvest: 9, perishable: true, units: ['kg', 'unidad'] },
  guayaba: { group: 'fruta', perennial: true, monthsToFirstHarvest: 24, perishable: true, units: ['kg', 'canastilla'] },
  uchuva: { group: 'fruta', perennial: true, monthsToFirstHarvest: 6, perishable: true, units: ['kg', 'canastilla'] },
  tomate: { group: 'hortaliza', crop: 'vegetables', monthsToFirstHarvest: 4, perishable: true, units: ['canastilla', 'kg'] },
  'cebolla-cabezona': { group: 'hortaliza', crop: 'vegetables', monthsToFirstHarvest: 5, units: ['bulto', 'kg'] },
  'cebolla-larga': { group: 'hortaliza', crop: 'vegetables', monthsToFirstHarvest: 4, perishable: true, units: ['arroba', 'kg'] },
  zanahoria: { group: 'hortaliza', crop: 'vegetables', monthsToFirstHarvest: 4, units: ['bulto', 'kg'] },
  ahuyama: { group: 'hortaliza', crop: 'squash', monthsToFirstHarvest: 4, units: ['kg', 'unidad'] },
  arracacha: { group: 'tuberculo', monthsToFirstHarvest: 10, units: ['bulto', 'kg'] },
  hortalizas: { group: 'hortaliza', crop: 'vegetables', monthsToFirstHarvest: 3, perishable: true, units: ['kg', 'canastilla'] },
  huevos: { group: 'animal', units: ['unidad'] },
  miel: { group: 'procesado', units: ['kg', 'unidad'] },
  otro: { group: 'otro', units: ['kg', 'unidad', 'bulto', 'arroba', 'canastilla', 't'] },
};

/**
 * Producto de mercado que representa a un cultivo del motor (para el puntaje de ingresos y el bloque "Mercado").
 * Hortalizas usa el tomate chonto como referencia; se dice en los vacíos de información.
 */
export const CROP_PRODUCT: Partial<Record<CropId, ProductId>> = {
  coffee: 'cafe',
  plantain: 'platano',
  cassava: 'yuca',
  potato: 'papa',
  maize: 'maiz',
  beans: 'frijol',
  rice: 'arroz',
  sugarcane: 'panela',
  squash: 'ahuyama',
  vegetables: 'tomate',
};

export const isProductId = (v: unknown): v is ProductId => typeof v === 'string' && (PRODUCT_IDS as readonly string[]).includes(v);

/** Precio de referencia por kg → precio por la unidad elegida (null si la unidad no tiene peso fijo). */
export function pricePerUnit(priceKg: number, unit: ListingUnit): number | null {
  const kg = KG_PER_UNIT[unit];
  return kg ? priceKg * kg : null;
}
