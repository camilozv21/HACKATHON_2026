import { parseAsArrayOf, parseAsFloat, parseAsString, parseAsStringLiteral, throttle } from 'nuqs';
import { RISK_KINDS } from '@/features/terrain/kinds';

/**
 * Estado clave de la app en la URL (para compartir enlaces):
 *  lat, lon, z  → cámara del globo
 *  field        → finca seleccionada (demo:<id> | pt:<lng>,<lat> | p:<polyline>)
 *  pr, eq, mk   → prioridades (6 pesos + riego, "533132n"), maquinaria y mercados
 * Otras fases añaden aquí sus parámetros (capa, fecha, región, prioridades…).
 */
export const cameraParams = {
  lat: parseAsFloat,
  lon: parseAsFloat,
  z: parseAsFloat,
};

export const fieldParams = {
  field: parseAsString,
  /** Pestaña del análisis abierta (motor | conditions | priorities | rotations | plan): un enlace compartido abre ahí. */
  view: parseAsStringLiteral(['motor', 'conditions', 'priorities', 'rotations', 'plan'] as const),
};

export const priorityParams = {
  pr: parseAsString,
  eq: parseAsArrayOf(parseAsString),
  mk: parseAsArrayOf(parseAsString),
};

/** Fincas que venden: capa visible (?shop=1) y publicación abierta (?listing=<id>). */
export const listingParams = {
  shop: parseAsString,
  listing: parseAsString,
};

/** Zonas de riesgo: qué riesgo pinta la capa (?layer=risk&risk=drought). Sin él, el combinado. */
export const riskParams = {
  risk: parseAsStringLiteral(RISK_KINDS),
};

export const urlOptions = {
  history: 'replace' as const,
  shallow: true,
  limitUrlUpdates: throttle(400),
};
