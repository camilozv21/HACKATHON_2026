/**
 * Capa "Zonas de riesgo" en el globo (imperativa, fuera del árbol de React). Se carga con import() solo cuando la
 * capa está activa.
 *
 *   data-risk          relleno por municipio, color según el nivel del riesgo elegido
 *   data-risk-pattern  rayado (alto) y puntos (medio): el nivel no depende solo del color
 *   data-risk-relief   sombras del relieve (SRTM) encima de los colores, para leer montañas y valles
 *   data-risk-line     bordes finos entre municipios
 *
 * Cambiar de riesgo solo cambia propiedades de pintura y filtros: los polígonos se envían a MapLibre una vez.
 */
import type { ExpressionSpecification, FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { loadAdmin } from '@/features/region/admin';
import { SOURCE } from '@/features/globe/style';
import { fetchTerrainIndex } from '@/lib/api/terrain';
import { RISK_MAP_COLOR, type RiskKind } from './kinds';
import { levelsFor } from './score';
import { useRiskStore } from './store';

export const RISK_SOURCE = 'data-risk';
const FILL = 'data-risk';
const PATTERN = 'data-risk-pattern';
const RELIEF = 'data-risk-relief';
const LINE = 'data-risk-line';
const LAYERS = [LINE, RELIEF, PATTERN, FILL];
const HATCH = 'risk-hatch';
const DOTS = 'risk-dots';

type RiskFeatures = { fc: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>; source: 'gee' | 'synthetic' };
let featuresPromise: Promise<RiskFeatures> | null = null;

/** Polígonos de los municipios con el nivel de cada riesgo en sus propiedades (`l_all`, `l_drought`…). */
function loadFeatures(): Promise<RiskFeatures> {
  if (!featuresPromise) {
    featuresPromise = Promise.all([fetchTerrainIndex(), loadAdmin('mpio')]).then(([index, admin]) => {
      const synthetic = index.source !== 'gee';
      const features: GeoJSON.Feature<GeoJSON.MultiPolygon>[] = [];
      for (const area of admin.areas) {
        const item = index.items[area.code];
        const levels = item ? levelsFor(item, { synthetic }) : null;
        features.push({
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: area.polygons },
          properties: {
            c: area.code,
            l_all: levels?.all ?? 'none',
            l_drought: levels?.drought ?? 'none',
            l_water: levels?.water ?? 'none',
            l_heat: levels?.heat ?? 'none',
            l_soil: levels?.soil ?? 'none',
          },
        });
      }
      return { fc: { type: 'FeatureCollection', features }, source: index.source };
    });
    featuresPromise.catch(() => {
      featuresPromise = null;
    });
  }
  return featuresPromise;
}

/** Patrón de relleno dibujado en un canvas (rayado diagonal o puntos), oscuro y semitransparente. */
function patternImage(kind: 'hatch' | 'dots') {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = ctx.strokeStyle = 'rgba(8, 12, 22, 0.55)';
  if (kind === 'hatch') {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Tres trazos para que el rayado empalme entre teselas.
    for (const o of [-size, 0, size]) {
      ctx.moveTo(o, size);
      ctx.lineTo(o + size, 0);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, size, size);
}

function ensureImages(map: MapLibreMap) {
  for (const [id, kind] of [
    [HATCH, 'hatch'],
    [DOTS, 'dots'],
  ] as const) {
    if (map.hasImage(id)) continue;
    const img = patternImage(kind);
    if (img) map.addImage(id, img, { pixelRatio: 2 });
  }
}

function ensureLayers(map: MapLibreMap, fc: RiskFeatures['fc'], beforeId: string | undefined) {
  if (map.getSource(RISK_SOURCE)) return;
  ensureImages(map);
  map.addSource(RISK_SOURCE, { type: 'geojson', data: fc, tolerance: 0.5 });
  map.addLayer({ id: FILL, type: 'fill', source: RISK_SOURCE, paint: { 'fill-color': RISK_MAP_COLOR.none, 'fill-opacity': 0.6 } }, beforeId);
  map.addLayer({ id: PATTERN, type: 'fill', source: RISK_SOURCE, paint: { 'fill-pattern': DOTS } }, beforeId);
  if (map.getSource(SOURCE.dem)) {
    map.addLayer(
      {
        id: RELIEF,
        type: 'hillshade',
        source: SOURCE.dem,
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 8, 0.6, 12, 0.45],
          'hillshade-shadow-color': 'rgba(0, 0, 0, 0.62)',
          'hillshade-highlight-color': 'rgba(255, 255, 255, 0.28)',
          'hillshade-accent-color': 'rgba(0, 0, 0, 0.2)',
          'hillshade-illumination-anchor': 'viewport',
        },
      },
      beforeId,
    );
  }
  map.addLayer(
    {
      id: LINE,
      type: 'line',
      source: RISK_SOURCE,
      paint: {
        'line-color': 'rgba(8, 12, 22, 0.6)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.15, 7, 0.6, 10, 1],
      },
    },
    beforeId,
  );
}

function apply(map: MapLibreMap, o: { kind: RiskKind; relief: boolean; opacity: number }) {
  const key = `l_${o.kind}`;
  const color: ExpressionSpecification = [
    'match',
    ['get', key],
    'low',
    RISK_MAP_COLOR.low,
    'medium',
    RISK_MAP_COLOR.medium,
    'high',
    RISK_MAP_COLOR.high,
    RISK_MAP_COLOR.none,
  ];
  const patterned: FilterSpecification = ['match', ['get', key], ['medium', 'high'], true, false];
  map.setPaintProperty(FILL, 'fill-color', color);
  map.setPaintProperty(FILL, 'fill-opacity', o.opacity);
  map.setFilter(PATTERN, patterned);
  map.setPaintProperty(PATTERN, 'fill-pattern', ['match', ['get', key], 'high', HATCH, DOTS]);
  if (map.getLayer(RELIEF)) map.setLayoutProperty(RELIEF, 'visibility', o.relief ? 'visible' : 'none');
}

/**
 * Muestra (o actualiza) la capa. `isCurrent` evita pintar si la persona ya cambió de capa mientras se descargaban
 * los datos.
 */
export async function showRisk(
  map: MapLibreMap,
  o: { kind: RiskKind; relief: boolean; opacity: number; beforeId: string | undefined; isCurrent: () => boolean },
) {
  const store = useRiskStore.getState();
  store.setReliefMissing(!map.getSource(SOURCE.dem));
  if (!map.getSource(RISK_SOURCE)) store.setStatus('loading');
  try {
    const { fc, source } = await loadFeatures();
    if (!o.isCurrent()) return;
    ensureLayers(map, fc, o.beforeId);
    apply(map, o);
    store.setStatus('ready', source);
  } catch {
    if (o.isCurrent()) store.setStatus('error');
  }
}

export function hideRisk(map: MapLibreMap) {
  for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(RISK_SOURCE)) map.removeSource(RISK_SOURCE);
  useRiskStore.getState().setStatus('idle');
}
