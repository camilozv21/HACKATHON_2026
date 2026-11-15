import { create } from 'zustand';

/** En qué va el plan de cada finca mientras llega: motor o asesor, y cuántas consultas hizo el asesor. */
export type MotorProgress = { stage: 'motor' | 'advisor'; tools: number; lastTool: string | null };

type State = {
  byField: Record<string, MotorProgress>;
  set: (fieldId: string, p: MotorProgress | null) => void;
};

export const useMotorProgressStore = create<State>()((set) => ({
  byField: {},
  set: (fieldId, p) =>
    set((s) => {
      const next = { ...s.byField };
      if (p) next[fieldId] = p;
      else delete next[fieldId];
      return { byField: next };
    }),
}));

export const useMotorProgress = (fieldId: string) => useMotorProgressStore((s) => s.byField[fieldId] ?? null);
