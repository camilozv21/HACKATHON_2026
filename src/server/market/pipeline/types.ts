/**
 * Instantáneas de mercado que se guardan en `fieldshift.market_kv` y en el seed (`src/server/market/seed-co.json`).
 * Son datos crudos ya agregados y compactos; los indicadores (mediana, tendencia, volatilidad…) se calculan al
 * leer, en `src/server/market/indicators.ts`.
 *
 * Este directorio (pipeline/) solo usa imports relativos con extensión `.ts` y nada de `@/`: lo usan también los
 * scripts de Node (`scripts/build-market-co.mjs`).
 */
import type { ProductId } from '../../../lib/market/catalog.ts';

/** Serie mensual compacta: `v[i]` es el valor del mes `from + i` (YYYY-MM); null = sin dato ese mes. */
export type MonthSeries = { from: string; v: (number | null)[] };

export type CentralSnapshot = {
  /** Slug estable del nombre de SIPSA ("bogota-d-c-corabastos"). */
  id: string;
  /** Nombre tal como lo publica SIPSA ("Bogotá, D.C., Corabastos"). */
  name: string;
  city: string;
  dept: string | null;
  muniCode: string | null;
  lat: number | null;
  lon: number | null;
  /** Precio mayorista promedio en $/kg por producto (un artículo representativo por producto). */
  prices: Partial<Record<ProductId, MonthSeries & { article: string }>>;
  /** Toneladas que llegaron a la central por mes (suma de todos los artículos del producto). */
  supply?: Partial<Record<ProductId, MonthSeries>>;
};

/** [año, área sembrada ha, área cosechada ha, producción t] */
export type EvaYear = [year: number, sownHa: number, harvestedHa: number, productionT: number];

export type CreditStats = {
  /** Cadena de Finagro tal como se publica ("Café", "Otros Frutales"): se muestra para no exagerar. */
  chain: string;
  /** Créditos Finagro para la cadena del producto en el departamento, en la ventana [from, to]. */
  n: number;
  /** De esos, a pequeños productores. */
  small: number;
  /** Valor total en pesos. */
  cop: number;
  from: string;
  to: string;
};

export type DeptSnapshot = {
  /** Código DANE de 2 dígitos ("63"). */
  code: string;
  name: string;
  eva: Partial<Record<ProductId, EvaYear[]>>;
  credit?: Partial<Record<ProductId, CreditStats>>;
};

export type NationalSnapshot = {
  trm: { value: number; date: string; change12mPct: number | null } | null;
  /** Índice de precios de insumos agrícolas (UPRA), base 100. */
  inputs: { month: string; total: number; fertilizers: number; change12mPct: number | null; fertChange12mPct: number | null } | null;
  /** Rendimiento nacional (t/ha) del último año de EVA, por producto. */
  evaYield: Partial<Record<ProductId, { year: number; yieldTHa: number }>>;
};

/** Conclusión por departamento (Claude o reglas). Los textos nunca traen cifras. */
export type DeptOutlook = {
  dept: string;
  generatedAt: string;
  by: 'claude' | 'rules';
  model?: string;
  headline: { es: string; en: string };
  crops: {
    product: ProductId;
    label: 'favorable' | 'neutral' | 'unfavorable';
    why: { es: string; en: string };
    confidence: 'high' | 'medium' | 'low';
  }[];
};

export type MarketSeed = {
  /** Último mes con precios (YYYY-MM-DD, primer día del mes). */
  asOf: string;
  builtAt: string;
  centrals: CentralSnapshot[];
  depts: DeptSnapshot[];
  national: NationalSnapshot;
  outlooks?: DeptOutlook[];
};

/** Clases de `fieldshift.market_kv.kind`. */
export type MarketKind = 'central' | 'dept' | 'national' | 'outlook';
