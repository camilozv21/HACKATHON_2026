import { NextResponse } from 'next/server';
import { login } from '@/server/accounts';
import { forbidden, sameOrigin, setSessionCookie } from '@/server/accounts/http';
import { clientIp, createRateLimiter } from '@/server/rateLimit';
import { hashKey } from '@/server/text';

export const dynamic = 'force-dynamic';

const limited = createRateLimiter({ windowMs: 600_000, max: 10 });

/**
 * POST /api/account/login `{ username, password }` → abre la sesión (cookie httpOnly). 401 `credentials` sin decir
 * si el usuario existe; 429 `rate` tras 10 intentos en 10 minutos.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  if (limited(hashKey(clientIp(request), 'fieldshift:login'))) return NextResponse.json({ error: 'rate' }, { status: 429 });
  const body = await request.json().catch(() => null);
  try {
    const res = await login(body);
    if (!res.ok) return NextResponse.json({ error: res.reason === 'invalid' ? 'invalid' : 'credentials' }, { status: res.reason === 'invalid' ? 400 : 401 });
    const out = NextResponse.json({ account: res.account, awarded: [] });
    setSessionCookie(out, res.token);
    return out;
  } catch (e) {
    console.error('[account] login', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
