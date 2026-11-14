import { polygonAreaHa, ringCentroid } from '@/lib/area';
import { decodePolyline, encodePolyline } from '@/lib/polyline';
import type { FieldSource, LngLatTuple, SelectedField } from './types';

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function fieldFromPoint(
  [lng, lat]: LngLatTuple,
  source: FieldSource,
  name: string | null = null,
): SelectedField {
  const c: LngLatTuple = [round5(lng), round5(lat)];
  return {
    id: `pt:${c[0]},${c[1]}`,
    name,
    geometry: { type: 'Point', coordinates: c },
    areaHa: null,
    center: c,
    source,
  };
}

export function fieldFromRing(ring: LngLatTuple[], source: FieldSource, name: string | null = null): SelectedField {
  const open =
    ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  const rounded = open.map(([x, y]) => [round5(x), round5(y)] as LngLatTuple);
  const closed = [...rounded, rounded[0]!];
  return {
    id: `p:${encodePolyline(rounded)}`,
    name,
    geometry: { type: 'Polygon', coordinates: [closed] },
    areaHa: polygonAreaHa(rounded),
    center: ringCentroid(rounded),
    source,
  };
}

/**
 * Parámetro `field` de la URL:
 *  - `demo:<id>`      finca demo
 *  - `pt:<lng>,<lat>` punto
 *  - `p:<polyline>`   polígono (polyline precisión 5)
 */
export function parseFieldParam(param: string, demos: Record<string, SelectedField>): SelectedField | null {
  try {
    if (param.startsWith('demo:')) return demos[param.slice(5)] ?? null;
    if (param.startsWith('pt:')) {
      const [lng, lat] = param.slice(3).split(',').map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat!) > 90 || Math.abs(lng!) > 180) return null;
      return fieldFromPoint([lng!, lat!], 'url');
    }
    if (param.startsWith('p:')) {
      const ring = decodePolyline(param.slice(2));
      if (ring.length < 3) return null;
      return fieldFromRing(ring, 'url');
    }
  } catch {
    return null;
  }
  return null;
}

export function fieldParam(field: SelectedField): string {
  return field.demoId ? `demo:${field.demoId}` : field.id;
}
