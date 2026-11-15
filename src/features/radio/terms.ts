/**
 * Términos técnicos que dice el locutor: cuando una frase los nombra, el reproductor ofrece su "¿qué es esto?".
 * Palabras clave en español e inglés (el guion puede venir en los dos).
 */
import type { GlossaryTerm } from '@/features/glossary/terms';

const KEYWORDS: [GlossaryTerm, RegExp][] = [
  ['ndvi', /\bNDVI\b|\bverdor\b|greenness/i],
  ['soil-moisture', /humedad del suelo|soil moisture/i],
  ['et', /evapotranspira|agua que pierde|water the land loses/i],
  ['anomaly', /anomal/i],
  ['frost', /helada|\bfrost/i],
  ['grace', /\bGRACE\b|agua subterr|groundwater/i],
  ['lst', /temperatura de la superficie|surface temperature/i],
  ['risk-zone', /zonas? de riesgo|risk zones?/i],
  ['land-state', /tierra sana|healthy land/i],
  ['markov', /markov/i],
  ['wholesale-price', /mayorista|wholesale/i],
  ['oversupply', /sobreoferta|oversupply/i],
  ['legume', /leguminosa|legume/i],
  ['cover-crop', /cultivos? de cobertura|cover crops?/i],
  ['drought-tolerant', /aguant\w* (la )?sequ|drought[- ]tolerant/i],
  ['slope', /pendientes?\b|\bslopes?\b/i],
  ['confidence', /\bconfianza\b|\bconfidence\b/i],
];

/** Términos del glosario que nombra una frase, en el orden de la lista (los más técnicos primero). */
export function termsIn(sentence: string | undefined | null): GlossaryTerm[] {
  if (!sentence) return [];
  return KEYWORDS.filter(([, re]) => re.test(sentence)).map(([term]) => term);
}
