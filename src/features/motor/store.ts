import { z } from 'zod';
import { create } from 'zustand';
import { MOTOR_CROPS, MOTOR_HISTORY_CROPS, MOTOR_RESIDUES, MOTOR_STAGES, MOTOR_SYMPTOM_IDS } from '@/lib/motorCatalog';

/**
 * Respuestas rápidas del plan de rotación, por finca: qué hay sembrado, en qué etapa, síntomas, qué se sembró la
 * última vez y qué se hace con el rastrojo. `undefined` = sin responder (se usa la encuesta o la rotación que
 * contó la persona); `null` = respondió "nada" o "no sé". Se recuerdan en este teléfono.
 */
export const MotorAnswers = z.object({
  crop: z.enum(MOTOR_CROPS).nullable().optional(),
  stage: z.enum(MOTOR_STAGES).nullable().optional(),
  symptoms: z.array(z.enum(MOTOR_SYMPTOM_IDS)).optional(),
  last: z.enum(MOTOR_HISTORY_CROPS).nullable().optional(),
  residue: z.enum(MOTOR_RESIDUES).nullable().optional(),
});
export type MotorAnswers = z.infer<typeof MotorAnswers>;

const STORAGE_KEY = 'fieldshift:motor:v1';
const MAX_FIELDS = 30;
const Saved = z.record(z.string(), MotorAnswers);

function readSaved(): Record<string, MotorAnswers> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Saved.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function save(byField: Record<string, MotorAnswers>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(byField).slice(-MAX_FIELDS))));
  } catch {
    /* modo privado o almacenamiento lleno: las respuestas siguen en memoria */
  }
}

type State = {
  byField: Record<string, MotorAnswers>;
  set: (fieldId: string, patch: MotorAnswers) => void;
};

export const useMotorStore = create<State>()((set) => ({
  byField: readSaved(),
  set: (fieldId, patch) =>
    set((s) => {
      const rest = { ...s.byField };
      const prev = rest[fieldId] ?? {};
      delete rest[fieldId];
      // La más reciente queda al final (se guardan las últimas MAX_FIELDS).
      return { byField: { ...rest, [fieldId]: { ...prev, ...patch } } };
    }),
}));

useMotorStore.subscribe((s, prev) => {
  if (s.byField !== prev.byField) save(s.byField);
});

const EMPTY: MotorAnswers = {};
export const useMotorAnswers = (fieldId: string) => useMotorStore((s) => s.byField[fieldId] ?? EMPTY);
