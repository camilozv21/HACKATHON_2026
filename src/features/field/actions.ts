import { fitBounds, flyTo, setMapPadding } from '@/features/globe/camera';
import { getMap } from '@/features/globe/store';
import { sheetPadding } from './sheetLayout';
import { ringBounds } from '@/lib/area';
import { reverseGeocode } from '@/lib/geocoding';
import { pushRecentField } from './recent';
import { useFieldStore } from './store';
import type { SelectedField } from './types';

/** Encuadra la finca en la zona visible (el padding del mapa ya descuenta el sheet). */
export function flyToField(field: SelectedField, opts: { instant?: boolean } = {}) {
  if (field.geometry.type === 'Polygon') {
    fitBounds(ringBounds(field.geometry.coordinates[0]!), { maxZoom: 17, instant: opts.instant });
  } else {
    flyTo({ lng: field.center[0], lat: field.center[1], zoom: 15.5 }, opts);
  }
}

/**
 * Selecciona una finca: la guarda en el store (y en recientes), abre el sheet en "peek",
 * vuela a ella y, si no tiene nombre, le pone el del municipio por geocodificación inversa.
 * `analyze`: abre directo el plan de rotación (el motor arranca solo) con el sheet a media altura,
 * para que la finca siga a la vista mientras se reúnen los datos.
 */
export async function selectField(
  field: SelectedField,
  opts: { fly?: boolean; instant?: boolean; locale?: string; remember?: boolean; analyze?: boolean } = {},
) {
  const { fly = true, locale = 'es', remember = true, analyze = false } = opts;
  const store = useFieldStore.getState();
  store.setField(field);
  if (analyze) {
    store.setPanelTab('motor');
    store.setAnalyzing(true, 'half');
  }
  // Vamos a volar: se detiene cualquier movimiento (p. ej. la rotación) y se fija el padding del sheet
  // antes del vuelo, para que la finca quede en la zona visible.
  const map = getMap();
  if (fly && map?.isMoving()) map.stop();
  setMapPadding(sheetPadding(analyze ? 'half' : 'peek'), { instant: true });
  if (fly) flyToField(field, { instant: opts.instant });

  if (!field.name) {
    try {
      const label = await reverseGeocode({ lng: field.center[0], lat: field.center[1], zoom: 12 }, locale);
      const current = useFieldStore.getState().field;
      if (label && current?.id === field.id) {
        useFieldStore.getState().renameField(label);
        if (remember) pushRecentField({ ...current, name: label });
        return;
      }
    } catch {
      // sin nombre: se muestra con coordenadas
    }
  }
  if (remember) pushRecentField(useFieldStore.getState().field ?? field);
}

export function clearField() {
  useFieldStore.getState().clear();
}
