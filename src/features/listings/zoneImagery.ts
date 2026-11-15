/**
 * Imágenes de la zona de una finca publicada para comparar dos años (página /fincas/[id]). Siempre alrededor de la
 * celda pública aproximada, nunca de la finca exacta.
 */

/**
 * Años con mosaico anual Sentinel-2 sin nubes (EOX, ~10 m/píxel) que cubren Colombia. El de 2017 solo existe para
 * Europa. Cuando EOX publique uno nuevo, añádelo aquí (GetCapabilities de https://tiles.maps.eox.at/wms).
 */
export const PHOTO_YEARS = [2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const;
export type PhotoYear = (typeof PHOTO_YEARS)[number];

export const NDVI_LAYER = 'MODIS_Terra_L3_NDVI_Monthly';

/** Media caja de la foto en grados: ~6,6 km de lado. */
const PHOTO_HALF = 0.03;
/** El NDVI de MODIS mide ~1 km por píxel: su caja es 5 veces mayor (~33 km) para que se distinga algo. */
const NDVI_HALF = 0.15;
/** Fracción del lado del NDVI que ocupa la zona de la foto (para dibujar el recuadro). */
export const PHOTO_IN_NDVI = PHOTO_HALF / NDVI_HALF;

const fixed = (ns: number[]) => ns.map((n) => n.toFixed(4)).join(',');

/** Mosaico Sentinel-2 sin nubes de un año (WMS 1.1.1, EPSG:4326: caja lon,lat). */
export function photoUrl(lat: number, lon: number, year: PhotoYear) {
  const layer = year === 2016 ? 's2cloudless' : `s2cloudless-${year}`;
  const bbox = fixed([lon - PHOTO_HALF, lat - PHOTO_HALF, lon + PHOTO_HALF, lat + PHOTO_HALF]);
  return `https://tiles.maps.eox.at/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${layer}&STYLES=&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=640&HEIGHT=640&FORMAT=image/jpeg`;
}

/** Verdor NASA MODIS (NDVI mensual) de un mes `YYYY-MM-01` (WMS 1.3.0, EPSG:4326: caja lat,lon). */
export function ndviUrl(lat: number, lon: number, date: string) {
  const bbox = fixed([lat - NDVI_HALF, lon - NDVI_HALF, lat + NDVI_HALF, lon + NDVI_HALF]);
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${NDVI_LAYER}&STYLES=&CRS=EPSG:4326&BBOX=${bbox}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TIME=${date}`;
}

export const monthDate = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`;

/**
 * Años con NDVI para el mes `month` (1-12) según los rangos de GIBS (`2000-03-01/2025-03-01/P1M`, o una fecha sola).
 * Compara siempre el mismo mes para no confundir la época seca con un cambio de la zona.
 */
export function ndviYears(ranges: string[], month: number): number[] {
  const years = new Set<number>();
  for (const r of ranges) {
    const [start, end = start] = r.split('/');
    if (!start || !end) continue;
    for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
      const d = monthDate(y, month);
      if (d >= start.slice(0, 10) && d <= end.slice(0, 10)) years.add(y);
    }
  }
  return [...years].sort((a, b) => a - b);
}
