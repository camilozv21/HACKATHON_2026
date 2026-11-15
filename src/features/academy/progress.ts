import { create } from 'zustand';
import { GAME_IDS, type GameId } from '@/features/onboarding/games/catalog';
import { LESSONS } from './lessons';

/**
 * Avance en la AgroAcademy (en este teléfono): lecciones hechas y la mejor marca de cada reto de práctica.
 * Se carga después de hidratar (`load()` en un efecto): el HTML del servidor no sabe qué hay en localStorage.
 */
const KEY = 'fieldshift:academy:v1';

export type AcademySaved = { lessons: string[]; games: Partial<Record<GameId, 1 | 2 | 3>> };
const EMPTY: AcademySaved = { lessons: [], games: {} };

/** Limpia lo guardado: solo ids que existen y estrellas de 1 a 3. */
export function parseSaved(raw: unknown): AcademySaved {
  const v = raw as Partial<AcademySaved> | null;
  if (!v || typeof v !== 'object') return EMPTY;
  const known = new Set(LESSONS.map((l) => l.id));
  const lessons = Array.isArray(v.lessons) ? [...new Set(v.lessons.filter((id): id is string => typeof id === 'string' && known.has(id)))] : [];
  const games: AcademySaved['games'] = {};
  for (const id of GAME_IDS) {
    const s = (v.games as Record<string, unknown> | undefined)?.[id];
    if (s === 1 || s === 2 || s === 3) games[id] = s;
  }
  return { lessons, games };
}

function read(): AcademySaved {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? parseSaved(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(s: AcademySaved) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* modo privado o almacenamiento lleno: el avance vale solo en esta visita */
  }
}

type AcademyState = AcademySaved & {
  loaded: boolean;
  load: () => void;
  completeLesson: (id: string) => void;
  /** Guarda la mejor marca del reto (repetirlo con menos estrellas no la baja). */
  recordGame: (id: GameId, stars: 1 | 2 | 3) => void;
};

export const useAcademyStore = create<AcademyState>()((set, get) => ({
  ...EMPTY,
  loaded: false,
  load: () => set({ ...read(), loaded: true }),
  completeLesson: (id) => {
    if (get().lessons.includes(id)) return;
    const next = { lessons: [...get().lessons, id], games: get().games };
    write(next);
    set(next);
  },
  recordGame: (id, stars) => {
    if ((get().games[id] ?? 0) >= stars) return;
    const next = { lessons: get().lessons, games: { ...get().games, [id]: stars } };
    write(next);
    set(next);
  },
}));

export const practiceStars = (games: AcademySaved['games']) => GAME_IDS.reduce((sum, id) => sum + (games[id] ?? 0), 0);
