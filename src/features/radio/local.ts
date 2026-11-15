/**
 * Emisora de la zona: cuando no hay una emisora cerca de la mira, la radio arma una para ese lugar con sus datos
 * (lluvia, suelo, alertas, precios). Celdas de 0,25° (~28 km): un paseo corto por el globo no cambia de emisora.
 * Módulo puro: lo usan el cliente (sintonía) y el servidor (programa).
 *
 * "Radio Campo" / "Farm Radio" es el nombre de la radio de la app (como las emisoras del mock), no un texto de UI.
 */
import type { RadioStation } from '@/lib/api/contract';

export const LOCAL_CELL_DEG = 0.25;
/** Con el globo entero a la vista no hay "zona": suena la emisora nacional. */
export const LOCAL_MIN_ZOOM = 4.5;

const snap = (v: number) => Math.round(v / LOCAL_CELL_DEG) * LOCAL_CELL_DEG;
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

export function localCell(lat: number, lon: number) {
  return { lat: Math.max(-90, Math.min(90, snap(lat))), lon: wrapLon(snap(lon)) };
}

export function localStationId(lat: number, lon: number) {
  const c = localCell(lat, lon);
  return `local:${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
}

export function parseLocalStationId(id: string): { lat: number; lon: number } | null {
  const m = /^local:(-?\d{1,2}\.\d{2}),(-?\d{1,3}\.\d{2})$/.exec(id);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** Frecuencia estable por celda, entre 88.1 y 107.9 FM (décimas impares, como en la radio de verdad). */
export function localFrequency(lat: number, lon: number): string {
  const c = localCell(lat, lon);
  let h = 2166136261;
  for (const ch of `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `${(88.1 + ((h >>> 0) % 100) * 0.2).toFixed(1)} FM`;
}

/** "Salento, Quindío" → "Salento". */
export const shortPlace = (place: string) => place.split(',')[0]?.trim() || place.trim();

export function localStation(lat: number, lon: number, place: string, locale: 'es' | 'en'): RadioStation {
  const c = localCell(lat, lon);
  return {
    id: localStationId(lat, lon),
    name: `${locale === 'en' ? 'Farm Radio' : 'Radio Campo'} ${shortPlace(place)}`,
    region: place,
    lat: c.lat,
    lon: c.lon,
    frequencyLabel: localFrequency(lat, lon),
    language: locale,
    local: true,
  };
}
