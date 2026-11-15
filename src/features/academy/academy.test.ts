import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';
import { GAME_IDS } from '@/features/onboarding/games/catalog';
import { LAYER_IDS } from '@/features/layers/ids';
import { DEMO_FARMS } from '@/features/field/demoFarms';
import { parseTimeParam } from '@/features/time/period';
import { LESSONS, lessonsOf, nextLesson, PANELS, PRACTICE_GAMES, UNIT_IDS, ZONES } from './lessons';
import { parseSaved, practiceStars } from './progress';

type Msgs = typeof es;
const lessonMsgs = (m: Msgs) => m.academy.lessons as unknown as Record<string, { title: string; short: string; what: string; why: string; steps: Record<string, string>; quiz: Record<string, string> }>;

describe('lecciones de la AgroAcademy', () => {
  it('cada lección tiene sus textos en español e inglés: uno por paso y la pregunta con 3 opciones', () => {
    for (const m of [es, en]) {
      const all = lessonMsgs(m);
      expect(Object.keys(all).sort()).toEqual(LESSONS.map((l) => l.id).sort());
      for (const l of LESSONS) {
        const msg = all[l.id]!;
        for (const k of ['title', 'short', 'what', 'why'] as const) expect(msg[k]?.length).toBeGreaterThan(3);
        expect(Object.keys(msg.steps)).toEqual(l.steps.map((_, i) => String(i)));
        for (const k of ['q', 'a0', 'a1', 'a2', 'why']) expect(msg.quiz[k]?.length).toBeGreaterThan(1);
      }
      for (const u of [...UNIT_IDS, 'practice']) expect((m.academy.units as Record<string, { title: string }>)[u]?.title).toBeTruthy();
    }
  });

  it('cada paso toca un lugar de la maqueta o un ítem del panel que ya está abierto', () => {
    for (const l of LESSONS) {
      let panel = l.start?.panel ?? null;
      for (const s of l.steps) {
        if (s.zone) expect(ZONES).toContain(s.zone);
        else expect(panel, `${l.id}: "${s.item}" sin panel abierto`).not.toBeNull();
        if (s.then && 'panel' in s.then) panel = s.then.panel ?? null;
        if (panel) expect(PANELS).toContain(panel);
      }
    }
  });

  it('la respuesta correcta cambia de lugar entre lecciones', () => {
    const answers = LESSONS.map((l) => l.answer);
    for (const a of [0, 1, 2]) expect(answers.filter((x) => x === a).length).toBeGreaterThanOrEqual(4);
  });

  it('"Pruébalo en el globo" usa parámetros que la app entiende', () => {
    const demos = new Set(DEMO_FARMS.map((d) => d.id));
    for (const l of LESSONS) {
      const p = new URLSearchParams(l.href);
      const layer = p.get('layer');
      if (layer) expect(LAYER_IDS).toContain(layer);
      const field = p.get('field');
      if (field) expect(demos.has(field.replace('demo:', ''))).toBe(true);
      const region = p.get('region');
      if (region?.startsWith('demo:')) expect(demos.has(region.slice(5))).toBe(true);
      const view = p.get('view');
      if (view) expect(['motor', 'conditions', 'priorities', 'rotations', 'plan']).toContain(view);
      const t = p.get('t');
      if (t) expect(parseTimeParam(t)).not.toBeNull();
    }
  });

  it('las 4 unidades tienen lecciones y la práctica son los 7 retos del glosario', () => {
    for (const u of UNIT_IDS) expect(lessonsOf(u).length).toBeGreaterThanOrEqual(3);
    expect(PRACTICE_GAMES).toEqual(GAME_IDS);
  });

  it('la siguiente lección es la primera sin hacer', () => {
    expect(nextLesson(new Set())?.id).toBe(LESSONS[0]!.id);
    expect(nextLesson(new Set([LESSONS[0]!.id]))?.id).toBe(LESSONS[1]!.id);
    expect(nextLesson(new Set(LESSONS.map((l) => l.id)))).toBeNull();
  });
});

describe('avance guardado', () => {
  it('ignora ids desconocidos, repetidos y estrellas fuera de 1–3', () => {
    const s = parseSaved({ lessons: ['globe', 'globe', 'nope', 3], games: { ndvi: 3, et: 5, frost: 0, x: 2, season: 2 } });
    expect(s).toEqual({ lessons: ['globe'], games: { ndvi: 3, season: 2 } });
    expect(practiceStars(s.games)).toBe(5);
    expect(parseSaved(null)).toEqual({ lessons: [], games: {} });
    expect(parseSaved('basura')).toEqual({ lessons: [], games: {} });
  });
});
