/**
 * Registro de capas de datos NASA. Identificadores, formato, nivel máximo y fechas válidas verificados en el
 * GetCapabilities EPSG:3857 de GIBS (scripts/build-gibs-meta.mjs → gibs-meta.json).
 * Los textos para agricultores (nombre, explicación, "¿qué significa para mi cultivo?") están en
 * messages/<locale>.json → layers.items.<id>.
 */
import type { DataSource } from '@/lib/api/contract';
import meta from './gibs-meta.json';
import type { LayerId } from './ids';

export type Cadence = 'daily' | 'monthly' | 'static';

export type LegendSpec = {
  /** Archivo de colormap (src/features/layers/colormaps/<gibsId>.json). */
  colormap: string;
  /** Valor del colormap → unidad que ve el agricultor. */
  transform: (v: number) => number;
  unit: string;
  /** Rango que se dibuja en la barra de leyenda (en unidades del colormap). */
  min: number;
  max: number;
  decimals: number;
  /** Barra en escala logarítmica (lluvia). */
  log?: boolean;
};

export type LayerConfig = {
  id: LayerId;
  kind: 'gibs' | 'hillshade';
  /** Ícono lucide (nombre). */
  icon: 'Leaf' | 'Droplets' | 'CloudRain' | 'Sun' | 'Moon' | 'Wind' | 'Waves' | 'Mountain';
  source: DataSource;
  mission: string;
  cadence: Cadence;
  gibs?: { id: string; level: number; format: 'png' | 'jpeg'; defaultTime: string | null; ranges: string[] };
  legend?: LegendSpec;
  defaultOpacity: number;
  /** Término del glosario relacionado. */
  glossary?: string;
};

type MetaLayer = { level: number; format: string; defaultTime: string | null; ranges: string[] };
const m = meta.layers as Record<string, MetaLayer>;

function gibs(id: string) {
  const l = m[id];
  if (!l) throw new Error(`Falta ${id} en gibs-meta.json (ejecuta scripts/build-gibs-meta.mjs)`);
  return { id, level: l.level, format: (l.format === 'jpeg' ? 'jpeg' : 'png') as 'png' | 'jpeg', defaultTime: l.defaultTime, ranges: l.ranges };
}

const kelvinToC = (k: number) => k - 273.15;

export const LAYERS: LayerConfig[] = [
  {
    id: 'ndvi',
    kind: 'gibs',
    icon: 'Leaf',
    source: 'MODIS',
    mission: 'Terra',
    cadence: 'monthly',
    gibs: gibs('MODIS_Terra_L3_NDVI_Monthly'),
    legend: { colormap: 'MODIS_Terra_L3_NDVI_Monthly', transform: (v) => v, unit: '', min: 0, max: 1, decimals: 2 },
    defaultOpacity: 0.8,
    glossary: 'ndvi',
  },
  {
    id: 'soil-moisture',
    kind: 'gibs',
    icon: 'Droplets',
    source: 'SMAP',
    mission: 'SMAP',
    cadence: 'daily',
    gibs: gibs('SMAP_L4_Analyzed_Root_Zone_Soil_Moisture'),
    legend: {
      colormap: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
      transform: (v) => v * 100,
      unit: '%',
      min: 0,
      max: 0.6,
      decimals: 0,
    },
    defaultOpacity: 0.8,
    glossary: 'soil-moisture',
  },
  {
    id: 'rain',
    kind: 'gibs',
    icon: 'CloudRain',
    source: 'GPM',
    mission: 'GPM (IMERG)',
    cadence: 'daily',
    gibs: gibs('IMERG_Precipitation_Rate'),
    legend: {
      colormap: 'IMERG_Precipitation_Rate',
      // Tasa media del día en mm/h → mm en el día.
      transform: (v) => v * 24,
      unit: 'mm/día',
      min: 0.1,
      max: 50,
      decimals: 0,
      log: true,
    },
    defaultOpacity: 0.85,
    glossary: 'rain',
  },
  {
    id: 'lst-day',
    kind: 'gibs',
    icon: 'Sun',
    source: 'MODIS',
    mission: 'Terra',
    cadence: 'monthly',
    gibs: gibs('MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day'),
    legend: {
      colormap: 'MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day',
      transform: kelvinToC,
      unit: '°C',
      min: 253,
      max: 333,
      decimals: 0,
    },
    defaultOpacity: 0.75,
    glossary: 'lst',
  },
  {
    id: 'lst-night',
    kind: 'gibs',
    icon: 'Moon',
    source: 'MODIS',
    mission: 'Terra',
    cadence: 'monthly',
    gibs: gibs('MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night'),
    legend: {
      colormap: 'MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night',
      transform: kelvinToC,
      unit: '°C',
      min: 243,
      max: 313,
      decimals: 0,
    },
    defaultOpacity: 0.75,
    glossary: 'frost',
  },
  {
    id: 'evap',
    kind: 'gibs',
    icon: 'Wind',
    // No hay ECOSTRESS ni MODIS ET en GIBS EPSG:3857: usamos el modelo MERRA-2 de NASA GMAO y lo decimos.
    source: 'MERRA-2',
    mission: 'MERRA-2 (NASA GMAO)',
    cadence: 'monthly',
    gibs: gibs('MERRA2_Evaporation_Land_Monthly'),
    legend: {
      colormap: 'MERRA2_Evaporation_Land_Monthly',
      transform: (v) => v * 86_400,
      unit: 'mm/día',
      min: 0,
      max: 0.00008,
      decimals: 1,
    },
    defaultOpacity: 0.8,
    glossary: 'et',
  },
  {
    id: 'groundwater',
    kind: 'gibs',
    icon: 'Waves',
    source: 'GRACE',
    mission: 'GRACE / GRACE-FO',
    cadence: 'monthly',
    gibs: gibs('GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI'),
    legend: {
      colormap: 'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI',
      transform: (v) => v,
      unit: 'cm',
      min: -30,
      max: 30,
      decimals: 0,
    },
    defaultOpacity: 0.7,
    glossary: 'grace',
  },
  {
    id: 'relief',
    kind: 'hillshade',
    icon: 'Mountain',
    source: 'SRTM',
    mission: 'SRTM',
    cadence: 'static',
    defaultOpacity: 0.7,
    glossary: 'slope',
  },
];

export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<LayerId, LayerConfig>;
export const GIBS_META_GENERATED_AT = meta.generatedAt;
