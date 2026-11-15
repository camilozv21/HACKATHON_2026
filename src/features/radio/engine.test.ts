import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentAction, RadioProgramResponse, RadioSegment } from '@/lib/api/contract';

const actions: AgentAction[] = [];
vi.mock('@/features/agent/actionRunner', () => ({
  runAgentActions: vi.fn(async (list: AgentAction[]) => {
    actions.push(...list);
    return { moved: false, openedRegion: false };
  }),
}));
vi.mock('@/features/onboarding/profile', () => ({ agentProfile: () => ({ mode: 'full', narrator: false }) }));

// Voz del teléfono simulada: habla una utterance a la vez (start → end en unos milisegundos).
type FakeU = { text: string; onstart?: () => void; onend?: () => void; onerror?: (e: { error: string }) => void };
const spoken: string[] = [];
let queue: FakeU[] = [];
function pump() {
  setTimeout(() => {
    const u = queue.shift();
    if (!u) return;
    spoken.push(u.text);
    u.onstart?.();
    setTimeout(() => {
      u.onend?.();
      pump();
    }, 4);
  }, 0);
}

const segs = (n: number): RadioSegment[] =>
  ['intro', 'weather', 'soil'].slice(0, n).map((topic, i) => ({
    id: `local:4.50,-75.75:2026-11-15:${topic}`,
    type: 'news',
    title: topic,
    durationSec: 6,
    transcript: `${topic} uno. ${topic} dos. ${topic} tres.`,
    regionId: 'local:4.50,-75.75',
    language: 'es',
    topic: topic as RadioSegment['topic'],
    cues: [{ sentence: i === 1 ? 1 : 0, action: i === 0 ? { type: 'flyTo', lat: 4.5, lon: -75.75, zoom: 8.5 } : { type: 'setLayer', layerId: i === 1 ? 'rain' : 'soil-moisture' } }],
  }));

beforeAll(() => {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speaking: false,
      pending: false,
      getVoices: () => [],
      speak: (u: FakeU) => {
        queue.push(u);
        if (queue.length === 1) pump();
      },
      cancel: () => {
        const q = queue;
        queue = [];
        q.forEach((u) => u.onerror?.({ error: 'interrupted' }));
      },
      resume: () => undefined,
    },
  });
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  };
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  document.documentElement.lang = 'es';
});

describe('motor de la radio con el programa del día', async () => {
  const { radioEngine } = await import('./engine');
  const { useRadioLive } = await import('./live');
  const { localStation } = await import('./local');
  const { ensureProgram } = await import('./programClient');
  const { useRadioStore } = await import('./store');
  const station = localStation(4.5, -75.75, 'Salento, Quindío', 'es');
  const filler: RadioSegment = { id: 'grabado', type: 'tip', title: 'Grabado', audioUrl: '/audio/x.mp3', durationSec: 89, transcript: 'Grabado.', regionId: 'campo-nacional' };

  beforeEach(() => {
    actions.length = 0;
    spoken.length = 0;
    queue = [];
    radioEngine.pause();
    // Como tuneTo: cada prueba es una sintonía nueva de la misma emisora.
    radioEngine.resetStation();
    const program: RadioProgramResponse = { station, place: 'Salento, Quindío', segments: segs(3), generatedAt: new Date().toISOString(), by: 'rules' };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(program), { status: 200 })) as typeof fetch;
    useRadioStore.setState({ station, tunedId: station.id, segments: [filler], index: 0, status: 'paused' });
    useRadioLive.setState({ sentence: 0, follow: true, held: false, program: { stationId: null, status: 'idle', by: null, pending: false } });
    radioEngine.setHooks({ beforePlay: () => ensureProgram(), ident: () => 'Estás escuchando Radio Campo Salento.' });
  });

  it('se identifica, pone el programa delante de lo grabado y lo lee frase por frase', async () => {
    radioEngine.toggle();
    await vi.waitFor(() => expect(spoken).toContain('intro tres.'), { timeout: 3000 });
    expect(spoken[0]).toBe('Estás escuchando Radio Campo Salento.');
    expect(spoken.slice(1, 4)).toEqual(['intro uno.', 'intro dos.', 'intro tres.']);
    const ids = useRadioStore.getState().segments.map((s) => s.id);
    expect(ids.at(-1)).toBe('grabado');
    expect(ids[0]).toMatch(/:intro$/);
    // La pista de la primera frase movió el globo.
    await vi.waitFor(() => expect(actions[0]).toMatchObject({ type: 'flyTo', lat: 4.5 }), { timeout: 3000 });
    // Siguiente bloque: la capa de lluvia en su segunda frase.
    await vi.waitFor(() => expect(actions).toContainEqual({ type: 'setLayer', layerId: 'rain' }), { timeout: 3000 });
    expect(useRadioStore.getState().index).toBeGreaterThanOrEqual(1);
  });

  it('si la persona toma el mapa, la radio sigue hablando pero no lo mueve', async () => {
    useRadioLive.getState().setHeld(true);
    radioEngine.toggle();
    await vi.waitFor(() => expect(spoken).toContain('weather dos.'), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 400));
    expect(actions).toEqual([]);
  });

  it('al pausar y volver a tocar play retoma desde la frase en que iba (sin repetir la identificación)', async () => {
    radioEngine.toggle();
    await vi.waitFor(() => expect(spoken).toContain('intro dos.'), { timeout: 3000 });
    radioEngine.pause();
    const seg = useRadioStore.getState().segments[useRadioStore.getState().index]!;
    const at = useRadioLive.getState().sentence;
    const before = spoken.length;
    radioEngine.toggle();
    await vi.waitFor(() => expect(spoken.length).toBeGreaterThan(before), { timeout: 3000 });
    expect(spoken[before]).toBe(`${seg.topic} ${['uno', 'dos', 'tres'][at]}.`);
    expect(spoken.slice(before)).not.toContain('Estás escuchando Radio Campo Salento.');
  });
});
