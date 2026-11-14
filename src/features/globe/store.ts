import type { Map as MapLibreMap } from 'maplibre-gl';
import { create } from 'zustand';
import type { BaseImagery } from './style';

export type GlobeStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-webgl' | 'context-lost';

/** Lo que hay bajo la mira. Se actualiza solo al terminar un movimiento, nunca por frame. */
export type CenterInfo = {
  lng: number;
  lat: number;
  zoom: number;
  label: string | null;
  labelStatus: 'idle' | 'loading' | 'done' | 'none';
};

type GlobeState = {
  map: MapLibreMap | null;
  status: GlobeStatus;
  center: CenterInfo;
  autoRotating: boolean;
  baseImagery: BaseImagery;
  trueColorDate: string | null;
  showLabels: boolean;
  /** Líneas de departamentos y municipios. */
  showBoundaries: boolean;
  /** Relleno inferior/superior del mapa (px) para que la mira quede en la zona visible. */
  padding: { top: number; bottom: number; right: number };
  setMap: (map: MapLibreMap | null) => void;
  setStatus: (status: GlobeStatus) => void;
  setCenter: (center: Partial<CenterInfo>) => void;
  setAutoRotating: (v: boolean) => void;
  setBaseImageryState: (v: BaseImagery) => void;
  setTrueColorDate: (v: string | null) => void;
  setShowLabelsState: (v: boolean) => void;
  setShowBoundariesState: (v: boolean) => void;
  setPaddingState: (p: Partial<GlobeState['padding']>) => void;
};

export const useGlobeStore = create<GlobeState>()((set) => ({
  map: null,
  status: 'idle',
  center: { lng: -30, lat: 12, zoom: 1, label: null, labelStatus: 'idle' },
  autoRotating: false,
  baseImagery: 'bluemarble',
  trueColorDate: null,
  showLabels: true,
  showBoundaries: true,
  padding: { top: 0, bottom: 0, right: 0 },
  setMap: (map) => set({ map }),
  setStatus: (status) => set({ status }),
  setCenter: (center) => set((s) => ({ center: { ...s.center, ...center } })),
  setAutoRotating: (autoRotating) => set({ autoRotating }),
  setBaseImageryState: (baseImagery) => set({ baseImagery }),
  setTrueColorDate: (trueColorDate) => set({ trueColorDate }),
  setShowLabelsState: (showLabels) => set({ showLabels }),
  setShowBoundariesState: (showBoundaries) => set({ showBoundaries }),
  setPaddingState: (p) => set((s) => ({ padding: { ...s.padding, ...p } })),
}));

export const getMap = () => useGlobeStore.getState().map;
