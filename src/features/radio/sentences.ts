/**
 * Frases de un guion de radio. La voz del teléfono lee una frase a la vez: así hay subtítulos frase por frase,
 * las pistas sobre el globo caen en su frase y se puede retomar donde se pausó. Módulo puro (cliente y servidor).
 */

/** Abreviaturas que terminan en punto sin cerrar la frase. */
const ABBR = /\b(?:Sr|Sra|Srta|Dr|Dra|Ud|Uds|etc|aprox|km|Mr|Mrs|Ms|St|vs|No)\.$/i;
const CLOSERS = /[.!?…"'»)\]]/;

/** Corta en . ! ? … seguidos de espacio o del final, sin partir números ("3.5", "1.250") ni abreviaturas. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    let j = i;
    while (j + 1 < clean.length && CLOSERS.test(clean[j + 1]!)) j++;
    const next = clean[j + 1];
    // "3.5", "1.250", "www.nasa.gov": el punto no va seguido de espacio.
    if (next !== undefined && next !== ' ') {
      i = j;
      continue;
    }
    const piece = clean.slice(start, j + 1).trim();
    if (ch === '.' && ABBR.test(piece)) {
      i = j;
      continue;
    }
    if (piece) out.push(piece);
    start = j + 1;
    i = j;
  }
  const rest = clean.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Segundo en que empieza cada frase de un audio, repartiendo la duración según el largo de cada frase. */
export function sentenceStarts(sentences: readonly string[], durationSec: number): number[] {
  const total = sentences.reduce((a, s) => a + s.length, 0) || 1;
  let acc = 0;
  return sentences.map((s) => {
    const t = (acc / total) * durationSec;
    acc += s.length;
    return t;
  });
}

/** Índice de la frase que suena en el segundo `t`. */
export function sentenceAt(starts: readonly number[], t: number): number {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1]! <= t) i++;
  return i;
}

/** Duración estimada de un guion leído en voz alta (unas 2,6 palabras por segundo a velocidad normal). */
export function speechSeconds(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 2.6 / rate));
}
