import { NextResponse } from 'next/server';
import { ZoneRequest } from '@/lib/api/motor';
import { bboxOf, gatherZone } from '@/server/motor/zone';
import { clientIp, createRateLimiter } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const rateLimited = createRateLimiter({ windowMs: 60_000, max: 30 });

/**
 * POST /api/motor/zone { geometry } — paso 1 del plan de rotación: los datos de la zona de la finca (rectángulo de
 * sus extremos) que después se le pasan al motor agronómico. NASA POWER diario de 90 días + pendiente SRTM (Colombia).
 */
export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const parsed = ZoneRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  const ring = parsed.data.geometry.type === 'Polygon' ? parsed.data.geometry.coordinates[0]! : null;
  if (ring && ring.length > 500) return NextResponse.json({ error: 'polygon_too_large' }, { status: 400 });

  const zone = await gatherZone(bboxOf(parsed.data.geometry));
  return NextResponse.json(zone, { headers: { 'Cache-Control': 'private, max-age=600' } });
}
