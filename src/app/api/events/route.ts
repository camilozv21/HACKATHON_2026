import { NextResponse } from 'next/server';
import { parseWindow } from '@/features/events/window';
import { EventsResponse } from '@/lib/api/contract';
import { loadEvents } from '@/server/events';

/**
 * GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD (sin fechas: últimos 90 días)
 * → eventos de NASA EONET, UNGRD y la comunidad en ese periodo. Las fuentes se cachean en el servidor;
 * la respuesta no, para que un reporte nuevo aparezca enseguida.
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const w = parseWindow(u.searchParams.get('from'), u.searchParams.get('to'));
  if (!w) return NextResponse.json({ error: 'invalid-window' }, { status: 400 });
  const data = EventsResponse.parse(await loadEvents(w.from, w.to));
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
