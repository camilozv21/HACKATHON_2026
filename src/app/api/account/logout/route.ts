import { NextResponse } from 'next/server';
import { logout } from '@/server/accounts';
import { clearSessionCookie, forbidden, sameOrigin, sessionToken } from '@/server/accounts/http';

export const dynamic = 'force-dynamic';

/** POST /api/account/logout → cierra la sesión (borra la cookie y la sesión guardada). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  try {
    await logout(await sessionToken());
  } catch (e) {
    console.error('[account] logout', e);
  }
  const out = new NextResponse(null, { status: 204 });
  clearSessionCookie(out);
  return out;
}
