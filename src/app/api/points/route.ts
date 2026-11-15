import { NextResponse } from 'next/server';
import { levelOf } from '@/lib/points';
import { accountFromToken, awardPoints, PointsRequest } from '@/server/accounts';
import { forbidden, sameOrigin, sessionToken } from '@/server/accounts/http';
import { createRateLimiter } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const limited = createRateLimiter({ windowMs: 60_000, max: 30 });

/**
 * POST /api/points `{ awards: [{ action, ref, value? }], listings: [{ id, token }] }` (con sesión) → aplica las
 * reglas de puntos y enlaza las fincas publicadas desde este teléfono. Responde `{ total, level, awarded }`.
 * 401 sin sesión, 400 `invalid`, 429 `rate`.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  const parsed = PointsRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  try {
    const account = await accountFromToken(await sessionToken());
    if (!account) return NextResponse.json({ error: 'session' }, { status: 401 });
    if (limited(account.id)) return NextResponse.json({ error: 'rate' }, { status: 429 });
    const { total, awarded } = await awardPoints(account, parsed.data);
    return NextResponse.json({ total, level: levelOf(total).id, awarded });
  } catch (e) {
    console.error('[points]', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
