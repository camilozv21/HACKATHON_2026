import { NextResponse } from 'next/server';
import { parseWindow } from '@/features/events/window';
import { EventHistory } from '@/lib/api/contract';
import { eventHistory } from '@/server/events';

/**
 * GET /api/events/history?lat&lon[&from&to] → historial oficial UNGRD del municipio más cercano (Colombia)
 * y eventos de NASA EONET y de la comunidad a menos de 50 km en el periodo (por defecto, los últimos 90 días).
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const lat = Number(u.searchParams.get('lat'));
  const lon = Number(u.searchParams.get('lon'));
  const w = parseWindow(u.searchParams.get('from'), u.searchParams.get('to'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !w) {
    return NextResponse.json({ error: 'invalid-params' }, { status: 400 });
  }
  const data = EventHistory.parse(await eventHistory(lat, lon, w.from, w.to));
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
