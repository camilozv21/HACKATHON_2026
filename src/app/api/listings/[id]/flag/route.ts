import { NextResponse } from 'next/server';
import { flagListing } from '@/server/listings';
import { clientIp } from '@/server/rateLimit';
import { hashKey } from '@/server/text';

export const dynamic = 'force-dynamic';

/** POST /api/listings/:id/flag → denuncia una publicación (una vez por IP; a las 3 se oculta hasta revisarla). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const res = await flagListing(id, hashKey(clientIp(request), 'fieldshift:flags'));
    if (!res) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ ok: true, hidden: res.hidden });
  } catch (e) {
    console.error('[listings] flag', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
