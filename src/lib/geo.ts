export type LngLat = { lng: number; lat: number };

const R_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Distancia de gran círculo en km. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** Normaliza longitud a [-180, 180). */
export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function formatCoords({ lng, lat }: LngLat, digits = 3, locale = 'es'): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : locale === 'en' ? 'W' : 'O';
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(wrapLng(lng)).toFixed(digits)}° ${ew}`;
}

/** Tile XYZ (Web Mercator) que contiene un punto. */
export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number; z: number } {
  const n = 2 ** z;
  const x = Math.floor(((wrapLng(lng) + 180) / 360) * n);
  const latR = toRad(clamp(lat, -85.0511, 85.0511));
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1), z };
}

/** Posición del punto dentro de su tile (0–1) para leer píxeles. */
export function lngLatToTileFraction(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const fx = ((wrapLng(lng) + 180) / 360) * n;
  const latR = toRad(clamp(lat, -85.0511, 85.0511));
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  return { x: Math.floor(fx), y: Math.floor(fy), px: fx - Math.floor(fx), py: fy - Math.floor(fy) };
}
