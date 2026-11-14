import { clamp, type LngLat } from './geo';

/**
 * Cajas [oeste, sur, este, norte] y encuadre de cámara. Módulo aparte de `geo.ts` a propósito: solo lo usan chunks
 * diferidos (región, límites) y así no suma bytes al JS inicial.
 */

const toRad = (d: number) => (d * Math.PI) / 180;

/** [oeste, sur, este, norte] */
export type BBox = [number, number, number, number];

export const inBBox = ([w, s, e, n]: BBox, lng: number, lat: number) =>
  lng >= w && lng <= e && lat >= s && lat <= n;

const mercY = (lat: number) => {
  const s = Math.sin(toRad(clamp(lat, -85.0511, 85.0511)));
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const mercYToLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export const unionBBox = (a: BBox, b: BBox): BBox => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

/** Lado mayor de la caja en km (aproximado, para mostrar "unos 28 km"). */
export function bboxSideKm([w, s, e, n]: BBox): number {
  return Math.max((e - w) * 111.32 * Math.cos(toRad((s + n) / 2)), (n - s) * 110.57);
}

export type Margins = { top: number; bottom: number; left: number; right: number };

/**
 * Centro y zoom (teselas de 512 px, Web Mercator) para que la caja quepa en `width`×`height` px dejando libres los
 * márgenes (número = igual en los 4 lados). Con márgenes distintos, el centro se corre para que la caja quede en
 * medio de la zona libre. Cálculo puro: sirve aunque el panel que se va a abrir todavía no esté en pantalla.
 */
export function fitBBox(
  bbox: BBox,
  width: number,
  height: number,
  margins: number | Margins = 48,
): LngLat & { zoom: number } {
  const m =
    typeof margins === 'number' ? { top: margins, bottom: margins, left: margins, right: margins } : margins;
  const [w, s, e, n] = bbox;
  const top = mercY(n);
  const bottom = mercY(s);
  const dx = Math.max((e - w) / 360, 1e-9);
  const dy = Math.max(bottom - top, 1e-9);
  const zoom = Math.log2(
    Math.min(
      Math.max(width - m.left - m.right, 1) / (dx * 512),
      Math.max(height - m.top - m.bottom, 1) / (dy * 512),
    ),
  );
  // Px → fracción del mundo a este zoom: el centro del mapa queda a medio desfase de márgenes del centro de la caja.
  const worldPx = 512 * 2 ** zoom;
  const cx = (w + e) / 2 / 360 + 0.5 - (m.left - m.right) / 2 / worldPx;
  const cy = (top + bottom) / 2 - (m.top - m.bottom) / 2 / worldPx;
  return { lng: (cx - 0.5) * 360, lat: mercYToLat(cy), zoom };
}
