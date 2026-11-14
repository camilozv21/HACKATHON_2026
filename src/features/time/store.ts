import { create } from 'zustand';
import type { TimeSel } from './period';

/**
 * Fecha que la persona está revisando (null = hoy). La comparten el mapa (capas), el drawer de región,
 * el panel de la finca y el agente. Se sincroniza con la URL (?t=2026-05 o ?t=2026-05-14) en TimeRuntime.
 */
type TimeState = {
  sel: TimeSel | null;
  pickerOpen: boolean;
  set: (sel: TimeSel | null) => void;
  setPickerOpen: (v: boolean) => void;
};

export const useTimeStore = create<TimeState>()((set) => ({
  sel: null,
  pickerOpen: false,
  set: (sel) => set({ sel }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
}));
