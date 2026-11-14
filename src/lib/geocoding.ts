import { env } from './env';
import { roundTo } from './geo';

/**
 * Geocoding: MapTiler si hay clave; si no, Nominatim (OSM) respetando su política de uso:
 * máx. 1 petición/s, resultados cacheados y debounce ≥ 400 ms en la búsqueda.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

export type GeocodeResult = {
  id: string;
  name: string;
  context: string;
  lng: number;
  lat: number;
  /** Zoom sugerido para volar al resultado. */
  zoom: number;
  bbox?: [number, number, number, number];
};

const NOMINATIM = 'https://nominatim.openstreetmap.org';
let nextNominatimSlot = 0;

/** Cola simple: garantiza ≥ 1.1 s entre peticiones a Nominatim. */
async function nominatimThrottle(signal?: AbortSignal) {
  const now = Date.now();
  const slot = Math.max(now, nextNominatimSlot);
  nextNominatimSlot = slot + 1100;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
}

const reverseCache = new Map<string, string | null>();

function detailLevel(mapZoom: number) {
  if (mapZoom < 3.5) return 3;
  if (mapZoom < 6) return 5;
  if (mapZoom < 9) return 8;
  return 10;
}

type NominatimAddress = Partial<
  Record<
    'country' | 'state' | 'region' | 'county' | 'city' | 'town' | 'village' | 'municipality' | 'hamlet',
    string
  >
>;

function labelFromAddress(a: NominatimAddress, level: number): string | null {
  const local = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? a.county;
  const region = a.state ?? a.region;
  const parts =
    level <= 3 ? [a.country] : level <= 5 ? [region, a.country] : [local ?? region, local ? region : a.country];
  const label = parts.filter(Boolean).join(', ');
  return label || null;
}

/** Nombre del lugar bajo un punto, con nivel de detalle según el zoom (país → región → municipio). */
export async function reverseGeocode(
  p: { lng: number; lat: number; zoom: number },
  locale: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const level = detailLevel(p.zoom);
  const step = level <= 3 ? 1 : level <= 5 ? 0.25 : 0.02;
  const key = `${locale}:${level}:${roundTo(p.lat, step).toFixed(2)}:${roundTo(p.lng, step).toFixed(2)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;

  let label: string | null = null;
  if (env.maptilerKey) {
    const types = level <= 3 ? 'country' : level <= 5 ? 'region,country' : 'municipality,place,county,region';
    const url = `https://api.maptiler.com/geocoding/${p.lng},${p.lat}.json?key=${encodeURIComponent(env.maptilerKey)}&language=${locale}&limit=1&types=${types}`;
    const res = await fetch(url, { signal });
    if (res.ok) {
      const data = (await res.json()) as { features?: { place_name?: string }[] };
      const name = data.features?.[0]?.place_name;
      label = name ? name.split(',').slice(0, 2).join(',').trim() : null;
    }
  } else {
    await nominatimThrottle(signal);
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${p.lat.toFixed(5)}&lon=${p.lng.toFixed(5)}&zoom=${level}&accept-language=${locale}`;
    const res = await fetch(url, { signal });
    if (res.ok) {
      const data = (await res.json()) as { address?: NominatimAddress; error?: string };
      label = data.address ? labelFromAddress(data.address, level) : null;
    }
  }
  reverseCache.set(key, label);
  return label;
}

function zoomForType(type: string, cls = ''): number {
  if (type === 'country') return 5;
  if (['state', 'region', 'province'].includes(type)) return 7;
  if (['county', 'district', 'subregion'].includes(type)) return 9.5;
  if (['city', 'administrative', 'municipality', 'joint_municipality'].includes(type)) return 11;
  if (['town', 'place', 'locality'].includes(type)) return 12;
  if (['village', 'hamlet', 'farm', 'farmland', 'isolated_dwelling', 'neighbourhood'].includes(type) || cls === 'landuse')
    return 14;
  return 13;
}

export async function searchPlaces(query: string, locale: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  if (env.maptilerKey) {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${encodeURIComponent(env.maptilerKey)}&language=${locale}&limit=6&autocomplete=true`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`geocoding ${res.status}`);
    const data = (await res.json()) as {
      features: {
        id: string;
        text: string;
        place_name: string;
        center: [number, number];
        bbox?: [number, number, number, number];
        place_type?: string[];
      }[];
    };
    return data.features.map((f) => ({
      id: f.id,
      name: f.text,
      context: f.place_name.split(',').slice(1).join(',').trim(),
      lng: f.center[0],
      lat: f.center[1],
      zoom: zoomForType(f.place_type?.[0] ?? ''),
      bbox: f.bbox,
    }));
  }

  await nominatimThrottle(signal);
  const url = `${NOMINATIM}/search?format=jsonv2&limit=6&addressdetails=0&accept-language=${locale}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const data = (await res.json()) as {
    place_id: number;
    name: string;
    display_name: string;
    lat: string;
    lon: string;
    type: string;
    class: string;
    boundingbox?: [string, string, string, string];
  }[];
  return data.map((r) => {
    const bb = r.boundingbox?.map(Number);
    return {
      id: String(r.place_id),
      name: r.name || r.display_name.split(',')[0] || q,
      context: r.display_name.split(',').slice(1, 4).join(',').trim(),
      lng: Number(r.lon),
      lat: Number(r.lat),
      zoom: zoomForType(r.type, r.class),
      // Nominatim: [sur, norte, oeste, este] → [oeste, sur, este, norte]
      bbox: bb && bb.length === 4 ? [bb[2]!, bb[0]!, bb[3]!, bb[1]!] : undefined,
    };
  });
}
