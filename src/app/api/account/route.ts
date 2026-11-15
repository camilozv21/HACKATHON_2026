import { NextResponse } from 'next/server';
import { accountDetails, accountFromToken } from '@/server/accounts';
import { sessionToken } from '@/server/accounts/http';

export const dynamic = 'force-dynamic';

/** GET /api/account → la cuenta de la sesión con su puntaje por acción, o 401 `{ account: null }`. */
export async function GET() {
  try {
    const account = await accountFromToken(await sessionToken());
    if (!account) return NextResponse.json({ account: null }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(await accountDetails(account), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[account]', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
