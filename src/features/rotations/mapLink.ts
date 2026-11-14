import { flyToField } from '@/features/field/actions';
import { isDesktopViewport, sheetPadding } from '@/features/field/sheetLayout';
import { useFieldStore } from '@/features/field/store';
import { setMapPadding } from '@/features/globe/camera';
import { snapDate } from '@/features/layers/dates';
import type { LayerId } from '@/features/layers/ids';
import { LAYER_BY_ID } from '@/features/layers/layers.config';
import { useLayerStore } from '@/features/layers/store';

/**
 * "Ver en el mapa" desde una evidencia: activa la capa NASA en la fecha relevante y encuadra la finca.
 * En móvil cierra el sheet para que se vea el mapa con su leyenda ("Abrir mi finca" lo devuelve a la vista completa).
 */
export function showEvidenceOnMap(layerId: LayerId, date?: string) {
  const cfg = LAYER_BY_ID[layerId];
  useLayerStore.getState().setLayer(layerId, { date: date ? (snapDate(cfg, date) ?? undefined) : undefined });

  const desktop = isDesktopViewport();
  const fs = useFieldStore.getState();
  if (!desktop) fs.setSheet(null);
  // El padding se fija antes del vuelo para que no lo interrumpa.
  setMapPadding(sheetPadding(desktop ? fs.sheet : null, desktop), { instant: true });
  if (fs.field) flyToField(fs.field);
}
