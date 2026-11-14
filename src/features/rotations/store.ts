import { create } from 'zustand';
import { NEUTRAL, type Scenario } from './whatIf';

/**
 * Estado de la comparación de rotaciones. Vive fuera del sheet para no perderse cuando el sheet se cierra
 * (p. ej. al tocar "ver en el mapa" en móvil y volver).
 */
type RotationsState = {
  fieldId: string | null;
  /** Estrategia abierta en detalle (null = lista). */
  detailId: string | null;
  /** Modo "comparar 2": ids elegidos (null = cerrado). */
  compare: [string, string] | null;
  tableOpen: boolean;
  scenario: Scenario;
  openDetail: (id: string | null) => void;
  setCompare: (ids: [string, string] | null) => void;
  setTableOpen: (v: boolean) => void;
  setScenario: (s: Partial<Scenario>) => void;
  reset: () => void;
  /** Al cambiar de finca se cierra el detalle y la comparación (el escenario se mantiene). */
  syncField: (id: string) => void;
};

export const useRotationsStore = create<RotationsState>()((set, get) => ({
  fieldId: null,
  detailId: null,
  compare: null,
  tableOpen: false,
  scenario: NEUTRAL,
  openDetail: (detailId) => set({ detailId }),
  setCompare: (compare) => set({ compare }),
  setTableOpen: (tableOpen) => set({ tableOpen }),
  setScenario: (s) => set((st) => ({ scenario: { ...st.scenario, ...s } })),
  reset: () => set({ detailId: null, compare: null, tableOpen: false, scenario: NEUTRAL }),
  syncField: (id) => {
    if (get().fieldId !== id) set({ fieldId: id, detailId: null, compare: null, tableOpen: false });
  },
}));
