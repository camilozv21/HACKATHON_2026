import { NextResponse } from 'next/server';
import { Listing, ListingPatch } from '@/lib/api/listings';
import { getListing, removeListing, updateListing } from '@/server/listings';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
const STATUS = { 'not-found': 404, forbidden: 403 } as const;

/** GET /api/listings/:id → la publicación (404 si no existe, venció, se borró o está oculta). */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const listing = await getListing(id);
    if (!listing) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ listing: Listing.parse(listing) }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (e) {
    console.error('[listings]', e);
    return NextResponse.json({ error: 'listings-unavailable' }, { status: 503 });
  }
}

/** PATCH /api/listings/:id (Authorization: Bearer <token>) → pausar, reactivar, cambiar productos o renovar. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsed = ListingPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  try {
    const res = await updateListing(id, bearer(request), parsed.data);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: STATUS[res.reason] });
    return NextResponse.json({ listing: res.listing });
  } catch (e) {
    console.error('[listings]', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}

/** DELETE /api/listings/:id (Authorization: Bearer <token>) → retira la publicación. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const res = await removeListing(id, bearer(request));
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: STATUS[res.reason] });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('[listings]', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
