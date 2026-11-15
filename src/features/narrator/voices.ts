/**
 * Qué voz del teléfono usar y cómo pasarle el texto para que se oiga bien. Módulo puro: lo usan el locutor, la radio
 * y la bienvenida en línea (OnboardingScript copia estas reglas en su script, que no carga módulos).
 */
export type NarratorLang = 'es' | 'en';

type VoiceLike = { lang: string; name?: string; voiceURI?: string; default?: boolean };

/** Español de Colombia y Latinoamérica primero (la app nació para fincas de Colombia), luego España. */
export const VOICE_REGIONS: Record<NarratorLang, string[]> = {
  es: ['es-co', 'es-419', 'es-mx', 'es-us', 'es-es'],
  en: ['en-us', 'en-gb'],
};

/**
 * Voces de novedad o robóticas de Apple (macOS/iOS): las "Eloquence" (Eddy, Flo, Grandma…) y los efectos (Albert,
 * Bad News, Zarvox…). Suelen salir primero en la lista, y la radio sonaba con ellas.
 */
export const ROBOTIC_VOICE =
  /\b(?:eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|deranged|hysterical|princess)\b|eloquence/i;

/** Voces naturales o mejoradas: Edge "Online (Natural)", Apple "Premium"/"Enhanced"/"Mejorada". */
export const NATURAL_VOICE = /\b(?:natural|neural|premium|enhanced|mejorada|mejorado)\b/i;

const norm = (s: string) => s.replace('_', '-').toLowerCase();

/** Puntaje de una voz para el idioma (−∞ si no es de ese idioma). Misma cuenta que `pick()` en OnboardingScript. */
export function voiceScore(v: VoiceLike, lang: NarratorLang): number {
  const tag = norm(v.lang);
  if (tag !== lang && !tag.startsWith(`${lang}-`)) return -Infinity;
  const regions = VOICE_REGIONS[lang];
  const i = regions.indexOf(tag);
  const id = `${v.name ?? ''} ${v.voiceURI ?? ''}`;
  return (
    (i >= 0 ? 10 * (regions.length - i) : 0) +
    (ROBOTIC_VOICE.test(id) ? -100 : 0) +
    (NATURAL_VOICE.test(id) ? 25 : /google/i.test(id) ? 5 : 0) +
    (v.default ? 1 : 0)
  );
}

/** La mejor voz del idioma: acento de la región, sin voces robóticas y, si hay, una natural. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: NarratorLang): V | null {
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = voiceScore(v, lang);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Texto listo para la voz (los subtítulos siguen mostrando el original). En español las cifras van con formato de
 * Colombia ("1.917 pesos", "12,5"), y una voz de México o EE. UU. lee "1.917" como "uno punto nueve uno siete":
 *  - miles con punto → sin separador ("1917");
 *  - decimales con coma → "12 coma 5";
 *  - lo que queda con punto es un decimal o una frecuencia ("96.4 FM") → "96 punto 4".
 */
export function speakable(text: string, lang: NarratorLang): string {
  if (lang !== 'es') return text;
  return text
    .replace(/\b\d{1,3}(?:\.\d{3})+\b(?!\.\d)/g, (m) => m.replace(/\./g, ''))
    .replace(/(\d),(\d)/g, '$1 coma $2')
    .replace(/(\d)\.(\d)/g, '$1 punto $2');
}
