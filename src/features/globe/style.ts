import type {
  ExpressionSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { BLUE_MARBLE, gibsTileUrl, type GibsLayerRef } from './gibs';

/** IDs estables de capas del estilo base (otras features insertan capas relativas a estas). */
export const LAYER = {
  background: 'bg',
  blueMarble: 'base-bluemarble',
  trueColor: 'base-truecolor',
  satellite: 'base-satellite',
  hillshade: 'relief-hillshade',
  /** Municipios y equivalentes (admin_level 6 de OSM). */
  admin2: 'labels-admin2',
  /** Departamentos, estados o provincias (admin_level 4 de OSM). */
  admin1: 'labels-admin1',
  boundaries: 'labels-boundaries',
  countries: 'labels-countries',
  states: 'labels-states',
  cities: 'labels-cities',
  towns: 'labels-towns',
} as const;

/** Las capas de datos NASA (Fase 6) se insertan justo debajo de los límites y las etiquetas. */
export const DATA_LAYER_BEFORE_ID = LAYER.admin2;
export const LABEL_LAYER_IDS = [LAYER.boundaries, LAYER.countries, LAYER.states, LAYER.cities, LAYER.towns];

/** Líneas entre municipios de Colombia (datos DANE, zoom 5,5–9): llegan después, con src/features/region/AdminLines. */
export const ADMIN_CO_LINES = 'admin-co-mpio';
/** Lo que apaga el interruptor "Departamentos y municipios". */
export const BOUNDARY_LAYER_IDS = [ADMIN_CO_LINES, LAYER.admin2, LAYER.admin1];
/** Límites y etiquetas, de abajo arriba. */
const OVERLAY_ORDER = [...BOUNDARY_LAYER_IDS, ...LABEL_LAYER_IDS];

/**
 * Primera capa de límites/etiquetas presente: lo que va "debajo de las etiquetas" se inserta antes de ella.
 * Las etiquetas llegan en tiempo ocioso y las líneas de Colombia solo al mirar Colombia, por eso se busca.
 */
export function firstOverlayId(map: { getLayer(id: string): unknown }, skip?: string): string | undefined {
  return OVERLAY_ORDER.find((id) => id !== skip && Boolean(map.getLayer(id)));
}

export const SOURCE = {
  blueMarble: 'gibs-bluemarble',
  trueColor: 'gibs-truecolor',
  satellite: 'satellite-hr',
  dem: 'dem',
  labels: 'labels',
} as const;

/** Zona de transición GIBS (zoom bajo) → satelital comercial (zoom de finca). */
export const CROSSFADE = { start: 6, end: 9 } as const;

export type BaseImagery = 'bluemarble' | 'truecolor';

export type BaseStyleOptions = {
  maptilerKey: string;
  locale: string;
  trueColor: { layer: GibsLayerRef; date: string } | null;
  baseImagery: BaseImagery;
  showLabels: boolean;
  /** Líneas de departamentos y municipios (por defecto sí). */
  showBoundaries?: boolean;
  /** Ahorro de datos: sin satelital comercial ni relieve (solo GIBS). */
  saveData?: boolean;
  /** false = las etiquetas se añaden después (addLabels) para no competir con el primer pintado. */
  includeLabels?: boolean;
};

export const LABELS_SOURCE: SourceSpecification = {
  type: 'vector',
  url: 'https://tiles.openfreemap.org/planet',
  attribution:
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
};

const fadeOut: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  CROSSFADE.start,
  1,
  CROSSFADE.end,
  0,
];
const fadeIn: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], CROSSFADE.start, 0, CROSSFADE.end, 1];

export function satelliteSource(maptilerKey: string): SourceSpecification {
  if (maptilerKey) {
    return {
      type: 'raster',
      url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${encodeURIComponent(maptilerKey)}`,
      tileSize: 512,
    };
  }
  return {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      'Imagen © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics y la comunidad GIS',
  };
}

export function satelliteTileTemplate(maptilerKey: string): { url: string; tileSize: number; maxzoom: number } {
  return maptilerKey
    ? {
        url: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${encodeURIComponent(maptilerKey)}`,
        tileSize: 512,
        maxzoom: 20,
      }
    : {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        tileSize: 256,
        maxzoom: 19,
      };
}

function demSource(maptilerKey: string): SourceSpecification {
  if (maptilerKey) {
    return {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(maptilerKey)}`,
      encoding: 'mapbox',
      tileSize: 512,
    };
  }
  return {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 14,
    attribution:
      'Relieve: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles (AWS)</a> · SRTM NASA',
  };
}

export function nameField(locale: string): ExpressionSpecification {
  return ['coalesce', ['get', `name:${locale}`], ['get', 'name:latin'], ['get', 'name']];
}

/**
 * Líneas de municipios: punteadas y finas. Las mismas para las teselas OSM (zoom ≥ 9) y para los datos DANE de
 * Colombia (zoom 5,5–9), así el relevo a zoom 9 no se nota. Se distinguen de los departamentos (trazos largos) y
 * de los países (continua) por el patrón, no solo por el color.
 */
export const MPIO_LINE_PAINT: NonNullable<LineLayerSpecification['paint']> = {
  'line-color': 'rgba(255,255,255,0.26)',
  'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 10, 0.9, 14, 1.2],
  'line-dasharray': [1.5, 2.5],
};

const FONT = ['Noto Sans Regular'];
const TEXT_COLOR = 'rgba(238, 242, 248, 0.92)';
const HALO = 'rgba(5, 7, 13, 0.85)';

export function labelLayers(locale: string, visible: boolean, boundaries = true): LayerSpecification[] {
  const visibility = visible ? 'visible' : 'none';
  const adminVisibility = visible && boundaries ? 'visible' : 'none';
  return [
    {
      // Municipios: las teselas solo los traen desde zoom 9 (antes, en Colombia, los dibujan los datos DANE).
      id: LAYER.admin2,
      type: 'line',
      source: SOURCE.labels,
      'source-layer': 'boundary',
      minzoom: 9,
      filter: ['all', ['==', ['get', 'admin_level'], 6], ['!=', ['get', 'maritime'], 1]],
      layout: { visibility: adminVisibility, 'line-join': 'round' },
      paint: { ...MPIO_LINE_PAINT },
    },
    {
      id: LAYER.admin1,
      type: 'line',
      source: SOURCE.labels,
      'source-layer': 'boundary',
      minzoom: 3,
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      layout: { visibility: adminVisibility, 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(255,255,255,0.32)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.9, 10, 1.4],
        'line-dasharray': [5, 2.5],
      },
    },
    {
      id: LAYER.boundaries,
      type: 'line',
      source: SOURCE.labels,
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      layout: { visibility, 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(255,255,255,0.35)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1, 10, 1.6],
      },
    },
    {
      id: LAYER.countries,
      type: 'symbol',
      source: SOURCE.labels,
      'source-layer': 'place',
      maxzoom: 7,
      // A zoom bajo solo países grandes (rank 1–2); el resto aparece al acercarse.
      filter: [
        'all',
        ['==', ['get', 'class'], 'country'],
        ['any', ['<=', ['get', 'rank'], 2], ['>=', ['zoom'], 3]],
      ],
      layout: {
        visibility,
        'text-field': nameField(locale),
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 4, 13],
        'text-letter-spacing': 0.08,
        'text-transform': 'uppercase',
        'text-max-width': 8,
        'text-padding': 6,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': TEXT_COLOR, 'text-halo-color': HALO, 'text-halo-width': 1.4 },
    },
    {
      id: LAYER.states,
      type: 'symbol',
      source: SOURCE.labels,
      'source-layer': 'place',
      minzoom: 4.5,
      maxzoom: 8,
      filter: ['==', ['get', 'class'], 'state'],
      layout: {
        visibility,
        'text-field': nameField(locale),
        'text-font': FONT,
        'text-size': 11,
        'text-letter-spacing': 0.05,
        'text-max-width': 8,
      },
      paint: { 'text-color': 'rgba(238,242,248,0.7)', 'text-halo-color': HALO, 'text-halo-width': 1.2 },
    },
    {
      id: LAYER.cities,
      type: 'symbol',
      source: SOURCE.labels,
      'source-layer': 'place',
      minzoom: 3,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        visibility,
        'text-field': nameField(locale),
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 14, 12, 16],
        'text-max-width': 8,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': TEXT_COLOR, 'text-halo-color': HALO, 'text-halo-width': 1.4 },
    },
    {
      id: LAYER.towns,
      type: 'symbol',
      source: SOURCE.labels,
      'source-layer': 'place',
      minzoom: 9,
      filter: ['match', ['get', 'class'], ['town', 'village'], true, false],
      layout: {
        visibility,
        'text-field': nameField(locale),
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 14],
        'text-max-width': 8,
      },
      paint: { 'text-color': 'rgba(238,242,248,0.85)', 'text-halo-color': HALO, 'text-halo-width': 1.3 },
    },
  ];
}

/**
 * Estilo base propio (sin estilos de terceros completos):
 * GIBS a zoom bajo → satelital de alta resolución a zoom de finca, relieve suave y etiquetas mínimas.
 */
export function buildBaseStyle(opts: BaseStyleOptions): StyleSpecification {
  const { maptilerKey, locale, trueColor, baseImagery, showLabels, showBoundaries = true, saveData, includeLabels = true } =
    opts;

  const sources: Record<string, SourceSpecification> = {
    [SOURCE.blueMarble]: {
      type: 'raster',
      tiles: [gibsTileUrl(BLUE_MARBLE, null)],
      tileSize: 256,
      maxzoom: BLUE_MARBLE.level,
      attribution:
        '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> · Blue Marble',
    },
  };

  if (includeLabels) sources[SOURCE.labels] = LABELS_SOURCE;

  if (trueColor) {
    sources[SOURCE.trueColor] = {
      type: 'raster',
      tiles: [gibsTileUrl(trueColor.layer, trueColor.date)],
      tileSize: 256,
      maxzoom: trueColor.layer.level,
      attribution: `<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> · VIIRS ${trueColor.date}`,
    };
  }

  if (!saveData) {
    sources[SOURCE.satellite] = satelliteSource(maptilerKey);
    sources[SOURCE.dem] = demSource(maptilerKey);
  }

  const layers: LayerSpecification[] = [
    { id: LAYER.background, type: 'background', paint: { 'background-color': '#0b1a2e' } },
    {
      id: LAYER.blueMarble,
      type: 'raster',
      source: SOURCE.blueMarble,
      maxzoom: saveData ? 24 : CROSSFADE.end + 0.5,
      layout: { visibility: baseImagery === 'bluemarble' || !trueColor ? 'visible' : 'none' },
      paint: { 'raster-opacity': saveData ? 1 : fadeOut, 'raster-fade-duration': 120 },
    },
  ];

  if (trueColor) {
    layers.push({
      id: LAYER.trueColor,
      type: 'raster',
      source: SOURCE.trueColor,
      maxzoom: saveData ? 24 : CROSSFADE.end + 0.5,
      layout: { visibility: baseImagery === 'truecolor' ? 'visible' : 'none' },
      paint: { 'raster-opacity': saveData ? 1 : fadeOut, 'raster-fade-duration': 120 },
    });
  }

  if (!saveData) {
    layers.push(
      {
        id: LAYER.satellite,
        // Sin minzoom no se piden tiles de alta resolución mientras se ve el globo completo.
        type: 'raster',
        source: SOURCE.satellite,
        minzoom: CROSSFADE.start - 0.5,
        paint: { 'raster-opacity': fadeIn, 'raster-fade-duration': 150 },
      },
      {
        id: LAYER.hillshade,
        type: 'hillshade',
        source: SOURCE.dem,
        minzoom: 7,
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 7, 0.12, 10, 0.3, 14, 0.18],
          'hillshade-shadow-color': 'rgba(0, 0, 0, 0.55)',
          'hillshade-highlight-color': 'rgba(255, 255, 255, 0.12)',
          'hillshade-accent-color': 'rgba(0, 0, 0, 0.25)',
        },
      },
    );
  }

  if (includeLabels) layers.push(...labelLayers(locale, showLabels, showBoundaries));

  return {
    version: 8,
    name: 'field-shift-base',
    projection: { type: 'globe' },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sky: {
      'sky-color': '#0b1630',
      'horizon-color': '#1d4f8c',
      'fog-color': '#0b1630',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.9,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
    },
    light: { anchor: 'map', position: [1.5, 90, 80] },
    sources,
    layers,
  };
}
