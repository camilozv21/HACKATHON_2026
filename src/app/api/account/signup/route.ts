import { NextResponse } from 'next/server';
import { signup } from '@/server/accounts';
import { forbidden, sameOrigin, setSessionCookie } from '@/server/accounts/http';
import { clientIp, createRateLimiter } from '@/server/rateLimit';
import { hashKey } from '@/server/text';

export const dynamic = 'force-dynamic';

const limited = createRateLimiter({ windowMs: 3_600_000, max: 5 });
const STATUS = { invalid: 400, username: 400, password: 400, taken: 409, credentials: 401 } as const;

/**
 * POST /api/account/signup `{ username, password }` → crea la cuenta (suma los puntos de bienvenida) y abre la
 * sesión (cookie httpOnly). Errores: 400 `username`/`password`, 409 `taken`, 429 `rate`, 503 `storage`.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  if (limited(hashKey(clientIp(request), 'fieldshift:signup'))) return NextResponse.json({ error: 'rate' }, { status: 429 });
  const body = await request.json().catch(() => null);
  try {
    const res = await signup(body);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: STATUS[res.reason] });
    const out = NextResponse.json({ account: res.account, awarded: res.awarded }, { status: 201 });
    setSessionCookie(out, res.token);
    return out;
  } catch (e) {
    console.error('[account] no se pudo crear', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
