import { NextResponse } from 'next/server';
import type { CoarseLocation } from '@/features/location/schema';

export const dynamic = 'force-dynamic';

/**
 * Ubicación aproximada por IP. Privacidad: no se guarda ni se registra en logs;
 * la respuesta es `private, no-store`.
 *  1. En Vercel: headers de geolocalización del edge (x-vercel-ip-*).
 *  2. En desarrollo: servicio gratuito por IP llamado desde el servidor (ve la IP de la máquina
 *     de desarrollo, no la del visitante).
 *  3. Si nada funciona: DEFAULT_LAT / DEFAULT_LON.
 */
function decode(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function defaultLocation(): CoarseLocation {
  return {
    lat: num(process.env.DEFAULT_LAT) ?? 4.711,
    lon: num(process.env.DEFAULT_LON) ?? -74.072,
    city: null,
    region: null,
    country: null,
    accuracy: 'ip',
    source: 'default',
  };
}

async function fromIpService(): Promise<CoarseLocation | null> {
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json', {
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, string | undefined>;
    const lat = num(j.latitude);
    const lon = num(j.longitude);
    if (lat == null || lon == null) return null;
    return {
      lat,
      lon,
      city: j.city ?? null,
      region: j.region ?? null,
      country: j.country_code ?? j.country ?? null,
      accuracy: 'ip',
      source: 'ip-service',
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const h = request.headers;
  const lat = num(h.get('x-vercel-ip-latitude'));
  const lon = num(h.get('x-vercel-ip-longitude'));

  let location: CoarseLocation | null = null;
  if (lat != null && lon != null) {
    location = {
      lat,
      lon,
      city: decode(h.get('x-vercel-ip-city')),
      region: decode(h.get('x-vercel-ip-country-region')),
      country: decode(h.get('x-vercel-ip-country')),
      accuracy: 'ip',
      source: 'vercel',
    };
  } else if (process.env.NODE_ENV === 'development') {
    location = await fromIpService();
  }

  return NextResponse.json(location ?? defaultLocation(), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
