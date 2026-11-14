import { getMap, useGlobeStore } from './store';
import { BOUNDARY_LAYER_IDS, LABEL_LAYER_IDS, LAYER, type BaseImagery } from './style';

export { flyTo, resetNorth, setMapPadding, zoomBy } from './camera';

export function setLayerVisibility(layerId: string, visible: boolean) {
  const map = getMap();
  if (!map?.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

export function setLabelsVisible(visible: boolean) {
  useGlobeStore.getState().setShowLabelsState(visible);
  LABEL_LAYER_IDS.forEach((id) => setLayerVisibility(id, visible));
}

/** Líneas de departamentos y municipios (las de Colombia también, si ya se cargaron). */
export function setBoundariesVisible(visible: boolean) {
  useGlobeStore.getState().setShowBoundariesState(visible);
  BOUNDARY_LAYER_IDS.forEach((id) => setLayerVisibility(id, visible));
}

/** Imagen de fondo a zoom bajo: mosaico sin nubes (Blue Marble) o color real de ayer (VIIRS). */
export function setBaseImagery(kind: BaseImagery) {
  useGlobeStore.getState().setBaseImageryState(kind);
  const hasTrueColor = Boolean(getMap()?.getLayer(LAYER.trueColor));
  setLayerVisibility(LAYER.blueMarble, kind === 'bluemarble' || !hasTrueColor);
  setLayerVisibility(LAYER.trueColor, kind === 'truecolor');
}
