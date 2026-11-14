import { create } from 'zustand';
import type { RadioSegment, RadioStation } from '@/lib/api/contract';

export type RadioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'static' | 'empty' | 'error';

type RadioState = {
  stations: RadioStation[];
  tunedId: string | null;
  segments: RadioSegment[];
  index: number;
  status: RadioStatus;
  /** Ya hubo un primer toque en play: desde ahora se puede reproducir solo al cambiar de emisora. */
  activated: boolean;
  expanded: boolean;
  /** El segmento actual se está leyendo con la voz del navegador (no hay mp3 todavía). */
  usingVoice: boolean;
  setStations: (s: RadioStation[]) => void;
  tune: (id: string, segments: RadioSegment[]) => void;
  setIndex: (i: number) => void;
  setStatus: (s: RadioStatus) => void;
  setActivated: () => void;
  setExpanded: (v: boolean) => void;
  setUsingVoice: (v: boolean) => void;
};

export const useRadioStore = create<RadioState>()((set) => ({
  stations: [],
  tunedId: null,
  segments: [],
  index: 0,
  status: 'idle',
  activated: false,
  expanded: false,
  usingVoice: false,
  setStations: (stations) => set({ stations }),
  tune: (tunedId, segments) => set({ tunedId, segments, index: 0 }),
  setIndex: (index) => set({ index }),
  setStatus: (status) => set({ status }),
  setActivated: () => set({ activated: true }),
  setExpanded: (expanded) => set({ expanded }),
  setUsingVoice: (usingVoice) => set({ usingVoice }),
}));

export const currentStation = () => {
  const s = useRadioStore.getState();
  return s.stations.find((x) => x.id === s.tunedId) ?? null;
};
export const currentSegment = () => {
  const s = useRadioStore.getState();
  return s.segments[s.index] ?? null;
};
