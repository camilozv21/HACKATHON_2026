import { useNarratorStore } from './store';

/**
 * Locutor con la voz del teléfono (Web Speech API, speechSynthesis): gratis, sin descargas y funciona sin internet
 * en la mayoría de teléfonos. La calidad depende del teléfono. El primer speak() necesita un toque previo de la
 * persona (regla de los navegadores); después de ese toque se puede leer solo.
 */
export type NarratorLang = 'es' | 'en';

export const isSpeechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

// Español de Colombia y Latinoamérica primero (la app nació para fincas de Colombia), luego cualquier español.
const PREFERRED: Record<NarratorLang, string[]> = {
  es: ['es-co', 'es-419', 'es-mx', 'es-us', 'es-es'],
  en: ['en-us', 'en-gb'],
};

export function pickVoice<V extends { lang: string }>(voices: readonly V[], lang: NarratorLang): V | null {
  const norm = (s: string) => s.replace('_', '-').toLowerCase();
  for (const tag of PREFERRED[lang]) {
    const v = voices.find((x) => norm(x.lang) === tag);
    if (v) return v;
  }
  return voices.find((x) => norm(x.lang).startsWith(lang)) ?? null;
}

/**
 * Trozos de hasta `max` caracteres cortados por frases (y, si una frase es muy larga, por comas o palabras).
 * Chrome corta las lecturas largas a los ~15 s; con frases cortas además se puede detener en cualquier momento.
 */
export function splitSentences(text: string, max = 180): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?;:])\s+/);
  const out: string[] = [];
  const push = (piece: string) => {
    const last = out[out.length - 1];
    if (last && last.length + 1 + piece.length <= max) out[out.length - 1] = `${last} ${piece}`;
    else out.push(piece);
  };
  for (const s of sentences) {
    if (s.length <= max) {
      push(s);
      continue;
    }
    let buf = '';
    for (const word of s.split(/(?<=,)\s+|\s+/)) {
      if (buf && buf.length + 1 + word.length > max) {
        out.push(buf);
        buf = word;
      } else buf = buf ? `${buf} ${word}` : word;
    }
    if (buf) out.push(buf);
  }
  return out;
}

/** Texto para leer a partir del markdown del asistente: sin símbolos, enlaces ni tablas. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_](.+?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/\|/g, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([.!?:;])\s*\.(\s|$)/g, '$1$2')
    .trim();
}

let session = 0;

// Las voces llegan tarde en Chrome: pedirlas una vez para que estén listas al primer speak().
if (isSpeechSupported()) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices());
}

/** Lee el texto en voz alta (corta lo que se estuviera leyendo). Devuelve false si el teléfono no puede hablar. */
export function speak(text: string, opts: { lang: NarratorLang; id?: string; onEnd?: () => void }): boolean {
  if (!isSpeechSupported()) return false;
  const chunks = splitSentences(text);
  if (!chunks.length) return false;
  const synth = window.speechSynthesis;
  const my = ++session;
  // Primero se avisa (la radio pausa su propia voz antes de que cancel() la corte), luego se corta lo anterior.
  useNarratorStore.getState().setSpeaking(opts.id ?? 'narrator');
  const wasBusy = synth.speaking || synth.pending;
  synth.cancel();
  const voice = pickVoice(synth.getVoices(), opts.lang);
  const run = () => {
    if (my !== session) return;
    synth.resume();
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = voice?.lang ?? (opts.lang === 'en' ? 'en-US' : 'es-ES');
      if (voice) u.voice = voice;
      u.rate = 0.95;
      if (i === chunks.length - 1) {
        u.onend = () => {
          if (my !== session) return;
          useNarratorStore.getState().setSpeaking(null);
          opts.onEnd?.();
        };
      }
      // Sin permiso (no hubo toque) o voz rota: se apaga el estado; las interrupciones propias ya cambiaron `session`.
      u.onerror = () => {
        if (my === session) useNarratorStore.getState().setSpeaking(null);
      };
      synth.speak(u);
    });
  };
  // Algunos Chrome ignoran un speak() inmediatamente después de cancel(): una pausa corta lo evita.
  if (wasBusy) setTimeout(run, 80);
  else run();
  return true;
}

export function stop() {
  session++;
  if (isSpeechSupported() && useNarratorStore.getState().speakingId) window.speechSynthesis.cancel();
  useNarratorStore.getState().setSpeaking(null);
}
