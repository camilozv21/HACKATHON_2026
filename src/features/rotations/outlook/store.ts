import { create } from 'zustand';
import { Household, type Pace } from '@/lib/api/outlook';

/** Lo que la familia cuenta para la proyección (se recuerda en el teléfono por finca) y la vista elegida. */
export const INDICATORS = ['income', 'som', 'soilLost', 'labor'] as const;
export type Indicator = (typeof INDICATORS)[number];

const KEY = 'fieldshift:household:v1';
const MAX_FIELDS = 20;

export const EMPTY_HOUSEHOLD: Household = { workers: null, tenure: null, association: null };

type OutlookState = {
  household: Record<string, Household>;
  pace: Pace;
  indicator: Indicator;
  setHousehold: (fieldId: string, patch: Partial<Household>) => void;
  setPace: (p: Pace) => void;
  setIndicator: (i: Indicator) => void;
};

function read(): Record<string, Household> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, Household> = {};
    for (const [id, v] of Object.entries(raw ?? {})) {
      const p = Household.safeParse(v);
      if (p.success) out[id] = p.data;
    }
    return out;
  } catch {
    return {};
  }
}

function write(all: Record<string, Household>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-MAX_FIELDS))));
  } catch {
    /* modo privado o sin espacio: sigue en memoria */
  }
}

export const useOutlookStore = create<OutlookState>()((set) => ({
  household: read(),
  pace: 'all',
  indicator: 'income',
  setHousehold: (fieldId, patch) =>
    set((s) => {
      const { [fieldId]: prev, ...rest } = s.household;
      const household = { ...rest, [fieldId]: { ...EMPTY_HOUSEHOLD, ...prev, ...patch } };
      write(household);
      return { household };
    }),
  setPace: (pace) => set({ pace }),
  setIndicator: (indicator) => set({ indicator }),
}));

export const useHousehold = (fieldId: string) => useOutlookStore((s) => s.household[fieldId] ?? EMPTY_HOUSEHOLD);
