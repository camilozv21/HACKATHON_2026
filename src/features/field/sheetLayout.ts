import type { SheetSnap } from './types';

/** Medidas del sheet de la finca (fuera del chunk perezoso para poder calcular el padding antes de volar). */
/** Alto del "peek": nombre, "Generar plan de rotación de cultivos" (dos líneas en 360 px) y las acciones. */
export const PEEK_PX = 188;
export const HALF_FRACTION = 0.55;
export const FULL_FRACTION = 0.94;
export const DESKTOP_PANEL_W = 420;

export const isDesktopViewport = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

/** Padding del mapa para que la mira (y la finca) queden en la zona visible junto al sheet/panel. */
export function sheetPadding(sheet: SheetSnap | null, desktop = isDesktopViewport()) {
  if (!sheet) return { bottom: 0, right: 0 };
  if (desktop) return { bottom: 0, right: DESKTOP_PANEL_W };
  const h = window.innerHeight;
  const bottom = sheet === 'peek' ? PEEK_PX : sheet === 'half' ? Math.round(h * HALF_FRACTION) : Math.round(h * 0.5);
  return { bottom, right: 0 };
}
