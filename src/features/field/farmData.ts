/**
 * Lo que el agricultor nos cuenta de su finca cuando a los satélites no les alcanza (suelo, riego…) y qué datos
 * pidió el último análisis. Solo lo usan chunks diferidos (panel de la finca, chat): no suma al JS inicial.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { usePrioritiesStore } from '@/features/priorities/store';
import { SoilInfo, type DataNeed, type DataRequest } from '@/lib/api/contract';
import type { FarmSoil, NeedState } from './needs';
import { useFieldStore } from './store';

const KEY = 'fieldshift:farm-soil:v1';
const MAX_FIELDS = 20;

type FarmDataState = {
  /** Suelo que contó el agricultor, por finca (se recuerda en el teléfono). */
  soil: Record<string, FarmSoil>;
  /** Preguntas que dejó para después, por finca (solo esta sesión). */
  skipped: Record<string, DataNeed[]>;
  /** Lo que pidió el backend en el último análisis de cada finca (null = no dijo nada). */
  requests: Record<string, DataRequest[] | null>;
  /** Respondió el riego en la tarjeta (el asistente de prioridades también cuenta). */
  irrigationAnswered: boolean;
  /**
   * Pedido de mostrar las preguntas (desde el chat o desde "Opciones"): ese dato va primero y, mientras
   * `scroll` sea true, la tarjeta se desplaza a la vista.
   */
  focus: { fieldId: string; need: DataNeed | null; scroll: boolean } | null;
  setSoil: (fieldId: string, patch: FarmSoil) => void;
  skip: (fieldId: string, need: DataNeed) => void;
  unskip: (fieldId: string, need?: DataNeed) => void;
  setRequests: (fieldId: string, list: DataRequest[] | null) => void;
  markIrrigation: () => void;
  /** Vuelve a mostrar las preguntas que dejó para después (o solo esa) y pide llevar la tarjeta a la vista. */
  requestFocus: (fieldId: string, need: DataNeed | null) => void;
  scrolled: () => void;
};

function readSoil(): Record<string, FarmSoil> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, FarmSoil> = {};
    for (const [id, v] of Object.entries(raw ?? {})) {
      const p = SoilInfo.partial().safeParse(v);
      if (p.success) out[id] = { ...p.data, ...((v as FarmSoil).noTest === true && { noTest: true }) };
    }
    return out;
  } catch {
    return {};
  }
}

function writeSoil(soil: Record<string, FarmSoil>) {
  try {
    const entries = Object.entries(soil).slice(-MAX_FIELDS);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* modo privado o sin espacio: los datos siguen en memoria */
  }
}

export const useFarmDataStore = create<FarmDataState>()((set) => ({
  soil: readSoil(),
  skipped: {},
  requests: {},
  irrigationAnswered: false,
  focus: null,
  setSoil: (fieldId, patch) =>
    set((s) => {
      // Al reordenar, la finca recién editada queda al final (la última que se descarta).
      const { [fieldId]: prev, ...rest } = s.soil;
      return { soil: { ...rest, [fieldId]: { ...prev, ...patch } } };
    }),
  skip: (fieldId, need) =>
    set((s) => ({ skipped: { ...s.skipped, [fieldId]: [...new Set([...(s.skipped[fieldId] ?? []), need])] } })),
  unskip: (fieldId, need) =>
    set((s) => ({
      skipped: { ...s.skipped, [fieldId]: need ? (s.skipped[fieldId] ?? []).filter((n) => n !== need) : [] },
    })),
  setRequests: (fieldId, list) => set((s) => ({ requests: { ...s.requests, [fieldId]: list } })),
  markIrrigation: () => set({ irrigationAnswered: true }),
  requestFocus: (fieldId, need) =>
    set((s) => ({
      focus: { fieldId, need, scroll: true },
      skipped: { ...s.skipped, [fieldId]: need ? (s.skipped[fieldId] ?? []).filter((n) => n !== need) : [] },
    })),
  scrolled: () => set((s) => (s.focus?.scroll ? { focus: { ...s.focus, scroll: false } } : s)),
}));

useFarmDataStore.subscribe((s, prev) => {
  if (s.soil !== prev.soil) writeSoil(s.soil);
});

/** Estado de lo que ya contó la persona sobre esta finca (fuera de React: chat, acciones del agente). */
export function needStateFor(fieldId: string): NeedState {
  const fd = useFarmDataStore.getState();
  return {
    soil: fd.soil[fieldId],
    rotation: useFieldStore.getState().rotation,
    irrigationKnown: usePrioritiesStore.getState().configured || fd.irrigationAnswered,
  };
}

export function useNeedState(fieldId: string): NeedState {
  const soil = useFarmDataStore((s) => s.soil[fieldId]);
  const answered = useFarmDataStore((s) => s.irrigationAnswered);
  const configured = usePrioritiesStore((s) => s.configured);
  const rotation = useFieldStore((s) => s.rotation);
  return useMemo(() => ({ soil, rotation, irrigationKnown: configured || answered }), [soil, rotation, configured, answered]);
}
