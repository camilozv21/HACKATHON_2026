/**
 * Colormaps oficiales de GIBS (v1.3) convertidos a JSON compacto: [r, g, b, min, max] por entrada.
 * Se cargan bajo demanda (solo cuando hay una capa activa).
 */
import { gibsTileUrl } from '@/features/globe/gibs';
import { lngLatToTileFraction } from '@/lib/geo';
import type { LayerConfig, LegendSpec } from './layers.config';
import { fetchGibsTile, GibsNoTileError } from './tileCache';

export type Colormap = { title: string; units: string; entries: [number, number, number, number, number][] };

const loaders: Record<string, () => Promise<{ default: unknown }>> = {
  MODIS_Terra_L3_NDVI_Monthly: () => import('./colormaps/MODIS_Terra_L3_NDVI_Monthly.json'),
  SMAP_L4_Analyzed_Root_Zone_Soil_Moisture: () => import('./colormaps/SMAP_L4_Analyzed_Root_Zone_Soil_Moisture.json'),
  IMERG_Precipitation_Rate: () => import('./colormaps/IMERG_Precipitation_Rate.json'),
  MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day: () =>
    import('./colormaps/MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day.json'),
  MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night: () =>
    import('./colormaps/MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night.json'),
  MERRA2_Evaporation_Land_Monthly: () => import('./colormaps/MERRA2_Evaporation_Land_Monthly.json'),
  GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI: () =>
    import('./colormaps/GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI.json'),
};

const cache = new Map<string, Colormap>();

export async function loadColormap(id: string): Promise<Colormap | null> {
  if (cache.has(id)) return cache.get(id)!;
  const load = loaders[id];
  if (!load) return null;
  const cm = (await load()).default as Colormap;
  cache.set(id, cm);
  return cm;
}

const BIG = 1e8;
/** Valor representativo de una entrada (centro del intervalo; bordes infinitos → el borde finito). */
export function entryValue([, , , min, max]: Colormap['entries'][number]) {
  if (Math.abs(min) >= BIG) return max;
  if (Math.abs(max) >= BIG) return min;
  return (min + max) / 2;
}

/** CSS linear-gradient de la leyenda con `n` paradas entre legend.min y legend.max. */
export function legendGradient(cm: Colormap, legend: LegendSpec, n = 10): string {
  const inRange = cm.entries.filter((e) => entryValue(e) >= legend.min && entryValue(e) <= legend.max);
  if (!inRange.length) return 'transparent';
  const stops: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const target = legend.log
      ? Math.exp(Math.log(legend.min) + t * (Math.log(legend.max) - Math.log(legend.min)))
      : legend.min + t * (legend.max - legend.min);
    const e = inRange.reduce((best, cur) =>
      Math.abs(entryValue(cur) - target) < Math.abs(entryValue(best) - target) ? cur : best,
    );
    stops.push(`rgb(${e[0]} ${e[1]} ${e[2]}) ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** Entrada del colormap más parecida a un color (las teselas usan los colores exactos de la paleta). */
export function lookupColor(cm: Colormap, [r, g, b]: [number, number, number]) {
  let best: Colormap['entries'][number] | null = null;
  let bestD = Infinity;
  for (const e of cm.entries) {
    const d = (e[0] - r) ** 2 + (e[1] - g) ** 2 + (e[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
      if (d === 0) break;
    }
  }
  // Un color muy distinto (bordes, mezcla por remuestreo) no es fiable.
  return best && bestD <= 300 ? best : null;
}

/** Lee el color del píxel de la tesela GIBS bajo un punto (CORS abierto en GIBS). */
export async function readGibsPixel(
  layer: LayerConfig,
  date: string,
  lng: number,
  lat: number,
): Promise<{ rgba: [number, number, number, number] } | null> {
  if (!layer.gibs) return null;
  const z = layer.gibs.level;
  const { x, y, px, py } = lngLatToTileFraction(lng, lat, z);
  const url = gibsTileUrl({ id: layer.gibs.id, level: z, format: layer.gibs.format }, date)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  // Misma caché que las capas del mapa: tocar varias veces la misma zona no vuelve a descargar.
  const buf = await fetchGibsTile(url).catch((e: unknown) => {
    if (e instanceof GibsNoTileError) return null;
    throw e;
  });
  if (!buf) return null;
  const bitmap = await createImageBitmap(new Blob([buf]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const ix = Math.min(bitmap.width - 1, Math.floor(px * bitmap.width));
  const iy = Math.min(bitmap.height - 1, Math.floor(py * bitmap.height));
  const d = ctx.getImageData(ix, iy, 1, 1).data;
  bitmap.close();
  return { rgba: [d[0]!, d[1]!, d[2]!, d[3]!] };
}

export function formatLegendValue(legend: LegendSpec, raw: number, locale: string) {
  const v = legend.transform(raw);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: legend.decimals }).format(v);
}
