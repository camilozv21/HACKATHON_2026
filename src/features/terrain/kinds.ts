/**
 * Constantes del terreno (zonas de riesgo y cadena de Markov). Sin dependencias: lo importan el contrato del
 * agente, la capa del mapa y el drawer. Método completo en docs/terrain-risk.md.
 */

/** Estados del terreno, en el orden de las filas y columnas de la matriz de cambios. */
export const LAND_STATES = ['healthy', 'stressed', 'bare', 'water'] as const;
export type LandState = (typeof LAND_STATES)[number];

/** Riesgos que se combinan. */
export const HAZARDS = ['drought', 'water', 'heat', 'soil'] as const;
export type Hazard = (typeof HAZARDS)[number];

/** Lo que pinta la capa del mapa: el riesgo combinado o uno solo. */
export const RISK_KINDS = ['all', ...HAZARDS] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

export const isRiskKind = (v: unknown): v is RiskKind => typeof v === 'string' && (RISK_KINDS as readonly string[]).includes(v);

/** Colores de los niveles en el mapa (fijos: el globo es siempre oscuro, también en modo sol). */
export const RISK_MAP_COLOR = {
  low: '#5ee08f',
  medium: '#ffc94d',
  high: '#ff5a4f',
  none: 'rgba(167, 178, 196, 0.35)',
} as const;

/** Colores de los estados (sobre el panel oscuro; cada estado lleva además patrón y texto). */
export const STATE_COLOR: Record<LandState, string> = {
  healthy: '#3fcf78',
  stressed: '#e8c25a',
  bare: '#c98a5a',
  water: '#7cc4ff',
};
