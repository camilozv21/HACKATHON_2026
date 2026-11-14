import { create } from 'zustand';
import type { LayerId } from './ids';

export type ProbeResult = {
  layerId: LayerId;
  lng: number;
  lat: number;
  status: 'loading' | 'value' | 'nodata' | 'error';
  value?: number;
  /** Color de la leyenda en ese punto (siempre se muestra junto al número). */
  color?: [number, number, number];
};

type LayerState = {
  /** [principal, comparación] — máximo 1 en móvil y 2 en desktop (cortina). */
  active: LayerId[];
  dates: Partial<Record<LayerId, string>>;
  opacity: Partial<Record<LayerId, number>>;
  playing: boolean;
  /** Fecha del fotograma que se ve mientras corre la animación. */
  playFrame: string | null;
  catalogOpen: boolean;
  probe: ProbeResult | null;
  tileError: Partial<Record<LayerId, boolean>>;
  /** Posición de la cortina de comparación (0–1). */
  curtain: number;
  setLayer: (id: LayerId, opts?: { date?: string; opacity?: number; compare?: boolean }) => void;
  removeLayer: (id: LayerId) => void;
  clearLayers: () => void;
  setDate: (id: LayerId, date: string) => void;
  setOpacity: (id: LayerId, v: number) => void;
  setPlaying: (v: boolean) => void;
  setPlayFrame: (d: string | null) => void;
  setCatalogOpen: (v: boolean) => void;
  setProbe: (p: ProbeResult | null) => void;
  setTileError: (id: LayerId, v: boolean) => void;
  setCurtain: (v: number) => void;
};

export const useLayerStore = create<LayerState>()((set) => ({
  active: [],
  dates: {},
  opacity: {},
  playing: false,
  playFrame: null,
  catalogOpen: false,
  probe: null,
  tileError: {},
  curtain: 0.5,
  setLayer: (id, opts = {}) =>
    set((s) => {
      const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
      let active: LayerId[];
      if (s.active.includes(id)) active = s.active;
      else if (opts.compare && isDesktop && s.active.length >= 1) active = [s.active[0]!, id];
      else active = [id];
      return {
        active,
        playing: false,
        probe: null,
        dates: opts.date ? { ...s.dates, [id]: opts.date } : s.dates,
        opacity: opts.opacity != null ? { ...s.opacity, [id]: opts.opacity } : s.opacity,
        tileError: { ...s.tileError, [id]: false },
      };
    }),
  removeLayer: (id) => set((s) => ({ active: s.active.filter((a) => a !== id), playing: false, probe: null })),
  clearLayers: () => set({ active: [], playing: false, probe: null }),
  setDate: (id, date) => set((s) => ({ dates: { ...s.dates, [id]: date }, tileError: { ...s.tileError, [id]: false } })),
  setOpacity: (id, v) => set((s) => ({ opacity: { ...s.opacity, [id]: v } })),
  setPlaying: (playing) => set({ playing, playFrame: null }),
  setPlayFrame: (playFrame) => set({ playFrame }),
  setCatalogOpen: (catalogOpen) => set({ catalogOpen }),
  setProbe: (probe) => set({ probe }),
  setTileError: (id, v) => set((s) => ({ tileError: { ...s.tileError, [id]: v } })),
  setCurtain: (curtain) => set({ curtain }),
}));
