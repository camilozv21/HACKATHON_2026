import { create } from 'zustand';
import type { EventsResponse, HazardEvent, HazardKind, HazardSource } from '@/lib/api/contract';

/** Punto y datos con los que se abre el formulario de reporte (desde una región, el agente o el centro del mapa). */
export type ReportDraft = { kind?: HazardKind; lat?: number; lon?: number; place?: string | null };

const MINE_KEY = 'fieldshift:my-reports:v1';

function readMine(): HazardEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(MINE_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as HazardEvent[]).slice(0, 20) : [];
  } catch {
    return [];
  }
}

type EventsState = {
  /** Eventos visibles en el globo. */
  visible: boolean;
  data: EventsResponse | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Sube para volver a pedir los eventos (botón "Intentar de nuevo"). */
  nonce: number;
  /** Eventos bajo el toque (pueden ser varios en el mismo municipio). */
  selected: HazardEvent[] | null;
  listOpen: boolean;
  /** Ver solo un tipo de evento. */
  kind: HazardKind | null;
  hiddenSources: HazardSource[];
  report: ReportDraft | null;
  /** Eligiendo el punto del reporte en el mapa (el formulario se esconde mientras tanto). */
  picking: boolean;
  /** Reportes enviados desde este dispositivo (el mock del servidor se borra al reiniciar). */
  mine: HazardEvent[];
  setVisible: (v: boolean) => void;
  setData: (d: EventsResponse | null, status: EventsState['status']) => void;
  reload: () => void;
  select: (e: HazardEvent[] | null) => void;
  setListOpen: (v: boolean) => void;
  setKind: (k: HazardKind | null) => void;
  toggleSource: (s: HazardSource) => void;
  openReport: (d?: ReportDraft) => void;
  updateReport: (d: ReportDraft) => void;
  /** Nombre del lugar que llega después (geocodificación): solo si el formulario sigue abierto en ese mismo punto. */
  setReportPlace: (lat: number, lon: number, place: string | null) => void;
  closeReport: () => void;
  setPicking: (v: boolean) => void;
  addMine: (e: HazardEvent) => void;
};

export const useEventsStore = create<EventsState>()((set, get) => ({
  visible: false,
  data: null,
  status: 'idle',
  nonce: 0,
  selected: null,
  listOpen: false,
  kind: null,
  hiddenSources: [],
  report: null,
  picking: false,
  mine: readMine(),
  setVisible: (visible) => set(visible ? { visible } : { visible, selected: null, listOpen: false }),
  setData: (data, status) => set({ data, status }),
  reload: () => set((st) => ({ nonce: st.nonce + 1, status: 'idle' })),
  select: (selected) => set({ selected, listOpen: selected ? false : get().listOpen }),
  setListOpen: (listOpen) => set({ listOpen, selected: listOpen ? null : get().selected }),
  setKind: (kind) => set({ kind }),
  toggleSource: (s) =>
    set((st) => ({ hiddenSources: st.hiddenSources.includes(s) ? st.hiddenSources.filter((x) => x !== s) : [...st.hiddenSources, s] })),
  openReport: (d = {}) => set({ report: d, picking: false, listOpen: false, selected: null }),
  // Con el formulario cerrado no se crea un borrador nuevo (una respuesta tardía no debe reabrirlo).
  updateReport: (d) => set((st) => (st.report ? { report: { ...st.report, ...d } } : st)),
  setReportPlace: (lat, lon, place) =>
    set((st) => (st.report && st.report.lat === lat && st.report.lon === lon ? { report: { ...st.report, place } } : st)),
  closeReport: () => set({ report: null, picking: false }),
  setPicking: (picking) => set({ picking }),
  addMine: (e) => {
    const mine = [e, ...get().mine.filter((m) => m.id !== e.id)].slice(0, 20);
    try {
      window.localStorage.setItem(MINE_KEY, JSON.stringify(mine));
    } catch {
      /* modo privado: el reporte se ve solo en esta visita */
    }
    set({ mine });
  },
}));

/** Eventos que se muestran: los del servidor más los propios del periodo, sin las fuentes ocultas ni otros tipos. */
export function visibleEvents(s: Pick<EventsState, 'data' | 'mine' | 'kind' | 'hiddenSources'>): HazardEvent[] {
  if (!s.data) return [];
  const ids = new Set(s.data.events.map((e) => e.id));
  const mine = s.mine.filter((e) => !ids.has(e.id) && e.date >= s.data!.from && e.date <= s.data!.to);
  return [...mine, ...s.data.events].filter((e) => !s.hiddenSources.includes(e.source) && (!s.kind || e.kind === s.kind));
}
