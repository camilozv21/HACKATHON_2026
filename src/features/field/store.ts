import { create } from 'zustand';
import type { CropSeason } from '@/lib/api/contract';
import type { FieldMode, SelectedField, SheetSnap } from './types';

/** `motor`: plan de rotación del motor agronómico (primera pestaña). `priorities` vive dentro de "Opciones". */
export const PANEL_TABS = ['motor', 'conditions', 'priorities', 'rotations', 'plan'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

type FieldState = {
  field: SelectedField | null;
  mode: FieldMode;
  /** null = sheet cerrado */
  sheet: SheetSnap | null;
  /** Vista de análisis abierta dentro del sheet (Fases 5–9). */
  analyzing: boolean;
  panelTab: PanelTab;
  /** Rotación actual que cuenta el agricultor (si no, se usa la típica de la zona que propone el backend). */
  rotation: CropSeason[] | null;
  setField: (field: SelectedField | null, opts?: { openSheet?: boolean }) => void;
  renameField: (name: string) => void;
  setMode: (mode: FieldMode) => void;
  setSheet: (snap: SheetSnap | null) => void;
  /** Abre o cierra el análisis. Por defecto sube el sheet a 'full'; tras dibujar se abre a media altura. */
  setAnalyzing: (v: boolean, snap?: SheetSnap) => void;
  setPanelTab: (t: PanelTab) => void;
  setRotation: (r: CropSeason[] | null) => void;
  clear: () => void;
};

export const useFieldStore = create<FieldState>()((set) => ({
  field: null,
  mode: 'idle',
  sheet: null,
  analyzing: false,
  panelTab: 'motor',
  rotation: null,
  setField: (field, opts = {}) =>
    set((s) => ({
      field,
      mode: 'idle',
      analyzing: false,
      panelTab: 'motor',
      rotation: field?.id === s.field?.id ? s.rotation : null,
      sheet: field ? (opts.openSheet === false ? s.sheet : 'peek') : null,
    })),
  renameField: (name) => set((s) => (s.field ? { field: { ...s.field, name } } : s)),
  setMode: (mode) => set({ mode }),
  setSheet: (sheet) => set({ sheet }),
  setAnalyzing: (analyzing, snap = 'full') => set({ analyzing, sheet: analyzing ? snap : 'peek' }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setRotation: (rotation) => set({ rotation }),
  clear: () => set({ field: null, mode: 'idle', sheet: null, analyzing: false, rotation: null, panelTab: 'motor' }),
}));
