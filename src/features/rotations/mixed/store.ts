import { create } from 'zustand';
import type { CropId } from '@/lib/api/contract';

/**
 * Estado de "Tu plan" (cultivos asociados). Vive fuera del sheet para no perderse al cerrarlo.
 * `detail`: mezcla abierta en detalle ('rec' | 'year2' | 'guild:<id>' | 'builder').
 */
type MixedState = {
  fieldId: string | null;
  detail: string | null;
  /** Cultivos de "Arma tu mezcla" (null = todavía no la tocó: se arranca con la recomendación). */
  builder: CropId[] | null;
  showAll: boolean;
  openDetail: (key: string | null) => void;
  setBuilder: (crops: CropId[]) => void;
  setShowAll: (v: boolean) => void;
  syncField: (id: string) => void;
};

export const useMixedStore = create<MixedState>()((set, get) => ({
  fieldId: null,
  detail: null,
  builder: null,
  showAll: false,
  openDetail: (detail) => set({ detail }),
  setBuilder: (builder) => set({ builder: builder.slice(0, 4) }),
  setShowAll: (showAll) => set({ showAll }),
  syncField: (id) => {
    if (get().fieldId !== id) set({ fieldId: id, detail: null, builder: null, showAll: false });
  },
}));
