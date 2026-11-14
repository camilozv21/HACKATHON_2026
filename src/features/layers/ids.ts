/** IDs estables de las capas de datos NASA (registro completo en layers.config.ts, Fase 6). */
export const LAYER_IDS = [
  'ndvi',
  'soil-moisture',
  'rain',
  'lst-day',
  'lst-night',
  'evap',
  'groundwater',
  'relief',
  /** Zonas de riesgo por municipio de Colombia (varios datos NASA combinados en Google Earth Engine). */
  'risk',
] as const;

export type LayerId = (typeof LAYER_IDS)[number];
