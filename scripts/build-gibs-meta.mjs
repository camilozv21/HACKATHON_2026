/**
 * Genera metadatos compactos de las capas NASA GIBS que usa la app:
 *  - src/features/layers/gibs-meta.json   → formato, nivel máximo, fecha por defecto y rangos de fechas válidas
 *  - src/features/layers/colormaps/*.json → colores y valores (leyenda + lectura aproximada del píxel)
 * Fuente: GetCapabilities EPSG:3857 y colormaps v1.3 de GIBS. Re-ejecutar antes de la demo para fechas frescas:
 *   node scripts/build-gibs-meta.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const CAPS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml';
const LAYERS = [
  'MODIS_Terra_L3_NDVI_Monthly',
  'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
  'IMERG_Precipitation_Rate',
  'MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day',
  'MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night',
  'MERRA2_Evaporation_Land_Monthly',
  'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI',
];

const xml = await (await fetch(CAPS)).text();
const blocks = xml.split('<Layer>').slice(1);
const meta = { generatedAt: new Date().toISOString(), source: CAPS, layers: {} };
const colormapUrls = {};

for (const id of LAYERS) {
  const b = blocks.find((x) => x.includes(`<ows:Identifier>${id}</ows:Identifier>`));
  if (!b) throw new Error(`Capa no encontrada en GetCapabilities: ${id}`);
  const format = b.match(/<Format>image\/([a-z]+)<\/Format>/)?.[1];
  const level = Number(b.match(/GoogleMapsCompatible_Level(\d+)/)?.[1]);
  const defaultTime = b.match(/<Default>([^<]+)<\/Default>/)?.[1] ?? null;
  const ranges = [...b.matchAll(/<Value>([^<]+)<\/Value>/g)].map((m) => m[1]);
  const title = b.match(/<ows:Title[^>]*>([^<]+)<\/ows:Title>/)?.[1];
  const cm = [...b.matchAll(/xlink:href=["']([^"']+colormaps\/v1\.3\/[^"']+\.xml)["']/g)].map((m) => m[1])[0];
  const legend = [...b.matchAll(/xlink:href=["']([^"']+legends\/[^"']+_H\.svg)["']/g)].map((m) => m[1])[0];
  meta.layers[id] = { title, format: format === 'jpeg' ? 'jpeg' : format, level, defaultTime, ranges, legend };
  if (cm) colormapUrls[id] = cm;
  console.log(`${id}: L${level} ${format} default=${defaultTime} ranges=${ranges.length}`);
}

/** "[0.1,0.2)" | "[-9999]" | "[0.9,+INF)" → [min, max] */
function parseInterval(s) {
  const m = s.match(/[[(]\s*([^,\])]+)\s*(?:,\s*([^\])]+))?\s*[\])]/);
  if (!m) return null;
  const num = (x) => (x == null ? null : /INF/.test(x) ? (x.includes('-') ? -Infinity : Infinity) : Number(x));
  const a = num(m[1]);
  const b = m[2] == null ? a : num(m[2]);
  return [a, b];
}

mkdirSync('src/features/layers/colormaps', { recursive: true });
for (const [id, url] of Object.entries(colormapUrls)) {
  const cx = await (await fetch(url)).text();
  const maps = cx.split('</ColorMap>').filter((m) => m.includes('<ColorMapEntry'));
  const data = maps.find((m) => !/title="No Data"/.test(m) && /units=/.test(m)) ?? maps.find((m) => !/No Data/.test(m));
  const units = data.match(/units="([^"]*)"/)?.[1] ?? '';
  const title = data.match(/title="([^"]*)"/)?.[1] ?? '';
  const entries = [...data.matchAll(/<ColorMapEntry([^>]*)\/>/g)]
    .map((m) => m[1])
    .filter((attrs) => !/nodata="true"/.test(attrs) && !/transparent="true"/.test(attrs))
    .map((attrs) => {
      const rgb = attrs.match(/rgb="(\d+),(\d+),(\d+)"/).slice(1).map(Number);
      const iv = parseInterval(attrs.match(/ value="([^"]+)"/)?.[1] ?? attrs.match(/sourceValue="([^"]+)"/)?.[1] ?? '');
      return iv ? [rgb[0], rgb[1], rgb[2], iv[0], iv[1]] : null;
    })
    .filter(Boolean)
    .map((e) => e.map((v) => (v === Infinity ? 1e9 : v === -Infinity ? -1e9 : v)));
  writeFileSync(`src/features/layers/colormaps/${id}.json`, JSON.stringify({ title, units, entries }));
  console.log(`  colormap ${id}: ${entries.length} entradas, unidades "${units}"`);
}

writeFileSync('src/features/layers/gibs-meta.json', JSON.stringify(meta, null, 1));
console.log('OK → src/features/layers/gibs-meta.json');
