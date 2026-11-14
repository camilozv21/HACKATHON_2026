import { NextResponse } from 'next/server';
import { RadioSegmentsResponse, type RadioSegment, type RadioStation } from '@/lib/api/contract';
import data from '@/mocks/radio.json';

/**
 * Mock de GET /api/radio/stations/:id/segments.
 * Orden: segmentos destacados (regionId "destacado", suenan primero en todas las emisoras),
 * luego los de la emisora y al final los de la nacional como relleno.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const station = (data.stations as RadioStation[]).find((s) => s.id === id);
  if (!station) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const all = data.segments as RadioSegment[];
  const featured = all.filter((s) => s.regionId === 'destacado');
  const own = all.filter((s) => s.regionId === id);
  const national = all.filter((s) => s.regionId === 'campo-nacional');
  const segments = id === 'campo-nacional' ? [...featured, ...national] : [...featured, ...own, ...national];
  return NextResponse.json(RadioSegmentsResponse.parse({ station, segments }), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
