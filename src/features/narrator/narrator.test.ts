import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickVoice, speak, splitSentences, stop, stripMarkdown } from './narrator';
import { useNarratorStore } from './store';

describe('textos del locutor', () => {
  it('corta por frases sin pasar del máximo', () => {
    const text = 'La lluvia está normal. El suelo está seco en la parte alta. ¡Ojo con las heladas! ¿Quieres ver más?';
    const parts = splitSentences(text, 50);
    expect(parts.join(' ')).toBe(text);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(50);
    // Frases cortas se juntan hasta el máximo.
    expect(splitSentences('Uno. Dos. Tres.', 200)).toEqual(['Uno. Dos. Tres.']);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('una frase muy larga se corta por palabras', () => {
    const long = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(' ');
    const parts = splitSentences(long, 80);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(80);
    expect(parts.join(' ')).toBe(long);
  });

  it('quita el markdown del asistente (negritas, enlaces, listas, cursiva) y deja pausas entre párrafos', () => {
    const md = '**Lluvia normal** en [Caldas](https://x.y).\n\n- Suelo: *seco*\n- Verdor: bueno\n\n_Respuesta de prueba._';
    expect(stripMarkdown(md)).toBe('Lluvia normal en Caldas. Suelo: seco Verdor: bueno. Respuesta de prueba.');
    expect(stripMarkdown('# Título\n\n| a | b |')).toBe('Título. a b');
  });

  it('elige primero el español de Colombia/Latinoamérica y luego cualquier español', () => {
    const voices = [{ lang: 'en-US' }, { lang: 'es-ES' }, { lang: 'es_MX' }];
    expect(pickVoice(voices, 'es')?.lang).toBe('es_MX');
    expect(pickVoice([{ lang: 'en-US' }, { lang: 'es-AR' }], 'es')?.lang).toBe('es-AR');
    expect(pickVoice([{ lang: 'fr-FR' }], 'es')).toBeNull();
    expect(pickVoice(voices, 'en')?.lang).toBe('en-US');
  });
});

describe('speak / stop', () => {
  type FakeUtterance = { text: string; lang: string; rate: number; voice?: unknown; onend?: () => void; onerror?: () => void };
  let spoken: FakeUtterance[];
  const synth = {
    speaking: false,
    pending: false,
    cancel: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [{ lang: 'es-CO' }],
    speak: (u: FakeUtterance) => spoken.push(u),
  };

  beforeEach(() => {
    spoken = [];
    synth.cancel.mockClear();
    useNarratorStore.setState({ speakingId: null });
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        rate = 1;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('marca qué se lee, lo encola por frases y se apaga al terminar la última', () => {
    const onEnd = vi.fn();
    expect(speak('Hola. Esta es tu zona.', { lang: 'es', id: 'region', onEnd })).toBe(true);
    expect(useNarratorStore.getState().speakingId).toBe('region');
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(spoken.map((u) => u.text)).toEqual(['Hola. Esta es tu zona.']);
    expect(spoken[0]!.lang).toBe('es-CO');
    spoken.at(-1)!.onend!();
    expect(useNarratorStore.getState().speakingId).toBeNull();
    expect(onEnd).toHaveBeenCalled();
  });

  it('una lectura nueva corta la anterior: el final de la vieja no apaga el estado', () => {
    speak('Primera.', { lang: 'es', id: 'a' });
    const first = spoken[0]!;
    speak('Segunda.', { lang: 'es', id: 'b' });
    first.onend?.();
    expect(useNarratorStore.getState().speakingId).toBe('b');
  });

  it('stop() calla y apaga el estado; sin texto no habla', () => {
    speak('Algo.', { lang: 'es', id: 'x' });
    stop();
    expect(useNarratorStore.getState().speakingId).toBeNull();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect(speak('  ', { lang: 'es' })).toBe(false);
  });
});
