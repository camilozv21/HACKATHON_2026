import { create } from 'zustand';
import type { RiskKind } from './kinds';

type RiskState = {
  /** Qué riesgo pinta la capa `risk`. */
  kind: RiskKind;
  /** Sombras del relieve (SRTM) encima de los colores del riesgo. */
  relief: boolean;
  /** Estado de la carga de datos de la capa (lo muestra la leyenda). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** De dónde salen los datos que se ven: export de Google Earth Engine o set sintético (simulado). */
  source: 'gee' | 'synthetic' | null;
  /** El relieve no está disponible (modo ahorro de datos: no hay teselas de elevación). */
  reliefMissing: boolean;
  setKind: (kind: RiskKind) => void;
  setRelief: (relief: boolean) => void;
  setStatus: (status: RiskState['status'], source?: RiskState['source']) => void;
  setReliefMissing: (v: boolean) => void;
};

export const useRiskStore = create<RiskState>()((set) => ({
  kind: 'all',
  relief: true,
  status: 'idle',
  source: null,
  reliefMissing: false,
  setKind: (kind) => set({ kind }),
  setRelief: (relief) => set({ relief }),
  setStatus: (status, source) => set((s) => ({ status, source: source === undefined ? s.source : source })),
  setReliefMissing: (reliefMissing) => set({ reliefMissing }),
}));
