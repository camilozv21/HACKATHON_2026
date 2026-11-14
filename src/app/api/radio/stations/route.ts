import { NextResponse } from 'next/server';
import { RadioStationsResponse, type RadioStation } from '@/lib/api/contract';
import { haversineKm } from '@/lib/geo';
import data from '@/mocks/radio.json';

/** Mock de GET /api/radio/stations?lat&lon → emisoras ordenadas por cercanía (la nacional al final). */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const lat = Number(u.searchParams.get('lat'));
  const lon = Number(u.searchParams.get('lon'));
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon);
  const stations: RadioStation[] = (data.stations as RadioStation[]).map((s) => ({
    ...s,
    distanceKm: hasPoint && s.lat != null && s.lon != null ? Math.round(haversineKm({ lat, lng: lon }, { lat: s.lat, lng: s.lon })) : null,
  }));
  stations.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return NextResponse.json(RadioStationsResponse.parse({ stations }), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
