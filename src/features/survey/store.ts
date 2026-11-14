import { z } from 'zod';
import { create } from 'zustand';
import { FieldSurvey } from '@/lib/api/contract';

/**
 * Encuesta "Cuéntanos de tu terreno": respuestas por finca. Mientras se responde vive en `draft`
 * (no dispara un nuevo análisis por cada toque); al terminar pasa a `byField` y se recuerda en este teléfono.
 */

export const SURVEY_STEPS = ['usualCrops', 'lastCrop', 'fertilization', 'residues', 'pests', 'purpose'] as const;
export type SurveyStep = (typeof SURVEY_STEPS)[number];

export const EMPTY_SURVEY: FieldSurvey = {
  usualCrops: [],
  lastCrop: null,
  fertilization: null,
  residues: null,
  pests: null,
  purpose: null,
};

const STORAGE_KEY = 'fieldshift:survey:v1';
const MAX_FIELDS = 30;
const Saved = z.record(z.string(), FieldSurvey);

type Draft = { fieldId: string; answers: FieldSurvey; step: number };

type SurveyState = {
  byField: Record<string, FieldSurvey>;
  draft: Draft | null;
  /** Abre la encuesta de esta finca (con lo que ya respondió, si hay). */
  start: (fieldId: string, step?: number) => void;
  answer: (patch: Partial<FieldSurvey>) => void;
  setStep: (step: number) => void;
  /** Guarda las respuestas y cierra. */
  finish: () => void;
  cancel: () => void;
  clear: (fieldId: string) => void;
};

function readSaved(): Record<string, FieldSurvey> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = Saved.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function save(byField: Record<string, FieldSurvey>) {
  try {
    // Solo las últimas fincas (las más recientes quedan al final del objeto).
    const entries = Object.entries(byField).slice(-MAX_FIELDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* modo privado o almacenamiento lleno: las respuestas siguen en memoria */
  }
}

export const useSurveyStore = create<SurveyState>()((set, get) => ({
  byField: readSaved(),
  draft: null,
  start: (fieldId, step = 0) =>
    set((s) => ({ draft: { fieldId, step, answers: { ...EMPTY_SURVEY, ...s.byField[fieldId] } } })),
  answer: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, answers: { ...s.draft.answers, ...patch } } } : s)),
  setStep: (step) =>
    set((s) => (s.draft ? { draft: { ...s.draft, step: Math.max(0, Math.min(SURVEY_STEPS.length - 1, step)) } } : s)),
  finish: () => {
    const d = get().draft;
    if (!d) return;
    const rest = { ...get().byField };
    delete rest[d.fieldId];
    set({ byField: { ...rest, [d.fieldId]: d.answers }, draft: null });
  },
  cancel: () => set({ draft: null }),
  clear: (fieldId) =>
    set((s) => {
      const rest = { ...s.byField };
      delete rest[fieldId];
      return { byField: rest, draft: s.draft?.fieldId === fieldId ? null : s.draft };
    }),
}));

useSurveyStore.subscribe((s, prev) => {
  if (s.byField !== prev.byField) save(s.byField);
});

/** Respuestas guardadas de una finca (null si no respondió). */
export function useSurvey(fieldId: string | null | undefined): FieldSurvey | null {
  return useSurveyStore((s) => (fieldId ? (s.byField[fieldId] ?? null) : null));
}
