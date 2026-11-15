import { create } from 'zustand';
import type { RadioSegment, RadioStation } from '@/lib/api/contract';

export type RadioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'static' | 'empty' | 'error';

/** Entra en el JS inicial (el Dock lo usa): solo lo mínimo. La frase, las pistas y el programa van en live.ts. */
type RadioState = {
  stations: RadioStation[];
  tunedId: string | null;
  /** Emisora sintonizada (también las de la zona, que no están en `stations`). */
  station: RadioStation | null;
  segments: RadioSegment[];
  index: number;
  status: RadioStatus;
  /** Ya hubo un primer toque en play: desde ahora se puede reproducir solo al cambiar de emisora. */
  activated: boolean;
  expanded: boolean;
  /** El segmento actual se está leyendo con la voz del navegador (guion sin mp3, o el mp3 no cargó). */
  usingVoice: boolean;
  setStations: (s: RadioStation[]) => void;
  tune: (station: RadioStation, segments: RadioSegment[]) => void;
  setStation: (station: RadioStation) => void;
  setSegments: (segments: RadioSegment[]) => void;
  setIndex: (i: number) => void;
  setStatus: (s: RadioStatus) => void;
  setActivated: () => void;
  setExpanded: (v: boolean) => void;
  setUsingVoice: (v: boolean) => void;
};

export const useRadioStore = create<RadioState>()((set) => ({
  stations: [],
  tunedId: null,
  station: null,
  segments: [],
  index: 0,
  status: 'idle',
  activated: false,
  expanded: false,
  usingVoice: false,
  setStations: (stations) => set({ stations }),
  tune: (station, segments) => set({ tunedId: station.id, station, segments, index: 0 }),
  setStation: (station) => set((s) => (s.tunedId === station.id ? { station } : {})),
  setSegments: (segments) => set({ segments }),
  setIndex: (index) => set({ index }),
  setStatus: (status) => set({ status }),
  setActivated: () => set({ activated: true }),
  setExpanded: (expanded) => set({ expanded }),
  setUsingVoice: (usingVoice) => set({ usingVoice }),
}));

export const currentStation = () => useRadioStore.getState().station;
export const currentSegment = () => {
  const s = useRadioStore.getState();
  return s.segments[s.index] ?? null;
};
