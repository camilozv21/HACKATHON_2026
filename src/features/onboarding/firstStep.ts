import { useFieldStore } from '@/features/field/store';
import { useLayerStore } from '@/features/layers/store';
import { getUserLocation } from '@/features/location/store';
import { useRegionStore } from '@/features/region/store';
import type { ProfileSuggestion } from '@/lib/api/contract';

/**
 * Primer paso sugerido al terminar las preguntas de inicio: lo que la persona dijo que quería hacer hoy.
 *  - myArea: el panel de condiciones de su zona (RegionRuntime fija el padding y vuela).
 *  - myFarm: el modo "elegir mi finca" (igual que el botón "Mi finca").
 *  - layers: el catálogo de capas de satélite.
 *  - explore: solo el globo.
 */
export function runFirstStep(step: ProfileSuggestion['firstStep']) {
  switch (step) {
    case 'myArea': {
      const loc = getUserLocation();
      if (loc) useRegionStore.getState().openRegion({ lat: loc.lat, lon: loc.lon, name: loc.city ?? null });
      break;
    }
    case 'myFarm':
      useFieldStore.getState().setMode('choose');
      break;
    case 'layers':
      useLayerStore.getState().setCatalogOpen(true);
      break;
    case 'explore':
      break;
  }
}
