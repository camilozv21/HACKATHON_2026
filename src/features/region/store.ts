import { create } from 'zustand';
import type { BBox } from '@/lib/bbox';

export type RegionTarget = {
  lat: number;
  lon: number;
  demoId?: string;
  name?: string | null;
  /** Punto de pantalla tocado (para la onda de luz hacia el drawer). */
  tap?: { x: number; y: number };
  /** Departamento o municipio de Colombia (DIVIPOLA) que contiene el punto: se resalta su borde real. */
  admin?: { level: 'dpto' | 'mpio'; code: string };
};

type RegionState = {
  target: RegionTarget | null;
  /** Zona que describen los datos (`bbox` del resumen de /region); null mientras no llega. */
  cell: BBox | null;
  openRegion: (t: RegionTarget) => void;
  setRegionName: (name: string | null) => void;
  /** Solo si la región sigue siendo la misma (una respuesta tardía de otra región no cambia el recuadro). */
  setCell: (forTarget: RegionTarget, bbox: BBox) => void;
  /** Pedido de encuadre desde la leyenda del drawer: el área elegida (con su recuadro) o su departamento entero. */
  focus: { kind: 'area' | 'dpto'; seq: number } | null;
  focusOn: (kind: 'area' | 'dpto') => void;
  closeRegion: () => void;
};

export const useRegionStore = create<RegionState>()((set) => ({
  target: null,
  cell: null,
  focus: null,
  openRegion: (target) => set({ target, cell: null, focus: null }),
  setRegionName: (name) => set((s) => (s.target ? { target: { ...s.target, name } } : s)),
  setCell: (forTarget, bbox) =>
    set((s) => {
      if (s.target !== forTarget) return s;
      const same = s.cell && s.cell.every((v, i) => v === bbox[i]);
      return same ? s : { cell: bbox };
    }),
  focusOn: (kind) => set((s) => ({ focus: { kind, seq: (s.focus?.seq ?? 0) + 1 } })),
  closeRegion: () => set({ target: null, cell: null, focus: null }),
}));

/** Recuadro mientras llega el `bbox` del resumen: el mismo que usa el mock de /region (0,25°; 0,5° en las demo). */
export function defaultCellBBox(t: RegionTarget): BBox {
  const half = t.demoId ? 0.25 : 0.125;
  return [t.lon - half, t.lat - half, t.lon + half, t.lat + half];
}

/** Ancho del drawer: 420 px en desktop/tablet; 92 % del ancho en móvil. */
export function drawerWidth() {
  if (typeof window === 'undefined') return 420;
  return window.matchMedia('(min-width: 640px)').matches ? 420 : Math.round(window.innerWidth * 0.92);
}
