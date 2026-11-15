import { GAME_IDS, type GameId } from '@/features/onboarding/games/catalog';

/**
 * AgroAcademy: lecciones cortas e interactivas sobre todo lo que tiene Field Shift. Cada lección tiene:
 *  - un simulador de teléfono (PhoneSim): pasos "toca lo que brilla" sobre una maqueta de la pantalla real;
 *  - una pregunta para comprobar (3 opciones, `answer` = la correcta; cambia de lugar entre lecciones);
 *  - un enlace "Pruébalo en el globo" (`href`: parámetros de la URL de la app, ver src/lib/urlState.ts).
 * Textos en messages → academy.lessons.<id>.{title, short, what, why, steps.<n>, quiz.{q, a0, a1, a2, why}}.
 */

/** Lugares de la maqueta del teléfono (los mismos que la app en móvil: lupa arriba, chat abajo…). */
export const ZONES = [
  'search',
  'points',
  'settings',
  'layers',
  'timeChip',
  'locationChip',
  'globe',
  'crosshair',
  'locate',
  'myFarm',
  'radio',
  'chat',
] as const;
export type Zone = (typeof ZONES)[number];

/** Paneles que se abren en la maqueta al tocar algo. */
export const PANELS = ['search', 'region', 'risk', 'layers', 'time', 'events', 'farm', 'chat', 'radio', 'settings', 'points'] as const;
export type PanelId = (typeof PANELS)[number];

/** Cómo se ve el globo de la maqueta (capa activa, zoom a la finca, fecha pasada…). */
export type Tint = 'none' | 'zoom' | 'moisture' | 'risk' | 'events' | 'shop' | 'past';
export const FARM_TABS = ['motor', 'conditions', 'priorities', 'rotations', 'plan'] as const;
export type FarmTab = (typeof FARM_TABS)[number];

export type SimState = { panel: PanelId | null; tint: Tint; tab: FarmTab; answered: boolean };
export const SIM_START: SimState = { panel: null, tint: 'none', tab: 'conditions', answered: false };

/**
 * Un paso: lo que hay que tocar (`zone`, o `item` dentro del panel abierto) y qué pasa al tocarlo (`then`).
 * Ítems por panel: search → result · region → row · risk → change · layers → ndvi | soil-moisture | risk | events |
 * shop · time → past · events → event · farm → tab-<tab> | motor-plan | finding | edit-priorities | water | card |
 * print · chat → suggestion | answer ·
 * radio → play · settings → voice · points → account.
 */
export type Step = ({ zone: Zone; item?: never } | { item: string; zone?: never }) & { then?: Partial<SimState> };

export const UNIT_IDS = ['globe', 'nasa', 'farm', 'help'] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export type Lesson = {
  id: string;
  unit: UnitId;
  start?: Partial<SimState>;
  steps: readonly Step[];
  /** Respuesta correcta de la pregunta (0, 1 o 2). */
  answer: 0 | 1 | 2;
  /** Parámetros para abrir la app justo en esa función ('' = el globo tal cual). */
  href: string;
};

const FARM_OPEN: Partial<SimState> = { panel: 'farm', tab: 'motor', tint: 'zoom' };

export const LESSONS: readonly Lesson[] = [
  // Unidad 1 · Conoce el globo
  {
    id: 'globe',
    unit: 'globe',
    steps: [{ zone: 'globe', then: { tint: 'zoom' } }, { zone: 'crosshair' }, { zone: 'search', then: { panel: 'search' } }, { item: 'result', then: { panel: null } }],
    answer: 0,
    href: '?lat=4.53&lon=-75.68&z=6',
  },
  {
    id: 'location',
    unit: 'globe',
    steps: [{ zone: 'locationChip', then: { tint: 'zoom' } }, { zone: 'locate' }],
    answer: 1,
    href: '',
  },
  {
    id: 'region',
    unit: 'globe',
    steps: [{ zone: 'globe', then: { panel: 'region' } }, { item: 'row' }],
    answer: 1,
    href: '?region=demo:cafe-quindio',
  },
  // Unidad 2 · Los ojos de la NASA
  {
    id: 'layers',
    unit: 'nasa',
    steps: [{ zone: 'layers', then: { panel: 'layers' } }, { item: 'soil-moisture', then: { panel: null, tint: 'moisture' } }, { zone: 'globe' }],
    answer: 0,
    href: '?layer=soil-moisture',
  },
  {
    id: 'time',
    unit: 'nasa',
    steps: [{ zone: 'timeChip', then: { panel: 'time' } }, { item: 'past', then: { panel: null, tint: 'past' } }, { zone: 'globe' }],
    answer: 1,
    href: '?t=2024-05',
  },
  {
    id: 'events',
    unit: 'nasa',
    steps: [{ zone: 'layers', then: { panel: 'layers' } }, { item: 'events', then: { panel: 'events', tint: 'events' } }, { item: 'event' }],
    answer: 2,
    href: '?ev=1',
  },
  {
    id: 'risk',
    unit: 'nasa',
    steps: [{ zone: 'layers', then: { panel: 'layers' } }, { item: 'risk', then: { panel: null, tint: 'risk' } }, { zone: 'globe', then: { panel: 'risk' } }, { item: 'change' }],
    answer: 0,
    href: '?layer=risk&lat=4.6&lon=-74.1&z=5.5',
  },
  // Unidad 3 · Tu finca
  {
    id: 'field',
    unit: 'farm',
    steps: [{ zone: 'myFarm', then: { tint: 'zoom' } }, { zone: 'globe', then: { panel: 'farm', tab: 'motor' } }],
    answer: 2,
    href: '?field=demo:cafe-quindio&view=conditions',
  },
  {
    // Plan de rotación del motor agronómico: arranca solo al dibujar la finca (primera pestaña).
    id: 'motor',
    unit: 'farm',
    start: FARM_OPEN,
    steps: [{ item: 'motor-plan' }, { item: 'finding' }],
    answer: 1,
    href: '?field=demo:cafe-quindio&view=motor',
  },
  {
    id: 'priorities',
    unit: 'farm',
    start: FARM_OPEN,
    steps: [{ item: 'tab-rotations', then: { tab: 'rotations' } }, { item: 'edit-priorities', then: { tab: 'priorities' } }, { item: 'water' }],
    answer: 1,
    href: '?field=demo:cafe-quindio&view=priorities',
  },
  {
    id: 'rotations',
    unit: 'farm',
    start: FARM_OPEN,
    steps: [{ item: 'tab-rotations', then: { tab: 'rotations' } }, { item: 'card' }],
    answer: 0,
    href: '?field=demo:cafe-quindio&view=rotations',
  },
  {
    id: 'plan',
    unit: 'farm',
    start: FARM_OPEN,
    steps: [{ item: 'tab-plan', then: { tab: 'plan' } }, { item: 'print' }],
    answer: 2,
    href: '?field=demo:cafe-quindio&view=plan',
  },
  {
    id: 'market',
    unit: 'farm',
    steps: [{ zone: 'layers', then: { panel: 'layers' } }, { item: 'shop', then: { panel: null, tint: 'shop' } }, { zone: 'globe' }],
    answer: 1,
    href: '?shop=1',
  },
  // Unidad 4 · Te acompañamos
  {
    id: 'agent',
    unit: 'help',
    steps: [{ zone: 'chat', then: { panel: 'chat' } }, { item: 'suggestion', then: { answered: true, tint: 'zoom' } }, { item: 'answer' }],
    answer: 0,
    href: '',
  },
  {
    id: 'radio',
    unit: 'help',
    steps: [{ zone: 'radio', then: { panel: 'radio' } }, { item: 'play' }],
    answer: 2,
    href: '',
  },
  {
    id: 'access',
    unit: 'help',
    steps: [{ zone: 'settings', then: { panel: 'settings' } }, { item: 'voice' }],
    answer: 0,
    href: '',
  },
  {
    id: 'points',
    unit: 'help',
    steps: [{ zone: 'points', then: { panel: 'points' } }, { item: 'account' }],
    answer: 1,
    href: '',
  },
];

export const lessonsOf = (unit: UnitId) => LESSONS.filter((l) => l.unit === unit);

/** Práctica: los 7 retos del glosario del inicio, para jugarlos otra vez. */
export const PRACTICE_GAMES: readonly GameId[] = GAME_IDS;

/** Estado inicial del simulador de una lección. */
export const simStart = (l: Lesson): SimState => ({ ...SIM_START, ...l.start });

/** Siguiente lección sin hacer (en orden), o null si ya hizo todas. */
export function nextLesson(done: ReadonlySet<string>): Lesson | null {
  return LESSONS.find((l) => !done.has(l.id)) ?? null;
}

/** Nivel en la academia por lecciones hechas y estrellas de práctica (sobre el total posible). */
export function academyLevel(lessonsDone: number, practiceStars: number): 0 | 1 | 2 | 3 {
  const total = LESSONS.length + PRACTICE_GAMES.length * 3;
  const ratio = (lessonsDone + practiceStars) / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio > 0) return 1;
  return 0;
}
