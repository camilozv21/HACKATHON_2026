/** Tipos de evento (sin zod: lo usan chunks livianos como la URL). El contrato completo está en lib/api/contract.ts. */
export const HAZARD_KINDS = [
  'landslide',
  'flood',
  'storm',
  'wildfire',
  'drought',
  'frost',
  'erosion',
  'earthquake',
  'volcano',
  'other',
] as const;

export const isHazardKind = (v: string): v is (typeof HAZARD_KINDS)[number] => (HAZARD_KINDS as readonly string[]).includes(v);
