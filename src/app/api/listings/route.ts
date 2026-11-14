import { NextResponse } from 'next/server';
import { CreateListingResponse, ListingsResponse } from '@/lib/api/listings';
import { createListing, listListings } from '@/server/listings';
import { clientIp } from '@/server/rateLimit';
import { hashKey } from '@/server/text';

export const dynamic = 'force-dynamic';

const STATUS = { invalid: 400, phone: 400, outside: 422, rate: 429 } as const;

/**
 * GET /api/listings?dept=63&mpio=63130&product=cafe&bbox=w,s,e,n&limit=100 → fincas publicadas activas.
 * Sin teléfonos ni ubicación exacta (ver docs/listings.md).
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const s = u.searchParams;
  const bbox = s.get('bbox')?.split(',').map(Number);
  const validBbox = bbox?.length === 4 && bbox.every(Number.isFinite) ? (bbox as [number, number, number, number]) : undefined;
  const code = (k: string, len: number) => {
    const v = s.get(k);
    return v && new RegExp(`^\\d{${len}}$`).test(v) ? v : undefined;
  };
  try {
    const data = await listListings({
      dept: code('dept', 2),
      mpio: code('mpio', 5),
      product: s.get('product') ?? undefined,
      bbox: validBbox,
      limit: Math.min(200, Math.max(1, Number(s.get('limit')) || 100)),
    });
    return NextResponse.json(ListingsResponse.parse(data), { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (e) {
    console.error('[listings]', e);
    return NextResponse.json({ error: 'listings-unavailable' }, { status: 503 });
  }
}

/**
 * POST /api/listings → publica una finca. Responde `{ listing, token }` (201); el token de edición solo se
 * entrega esta vez. Límite: 3 publicaciones por hora por IP (solo se guarda un resumen irreversible de la IP).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }
  try {
    const res = await createListing(body, hashKey(clientIp(request), 'fieldshift:listings'));
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: STATUS[res.reason] });
    return NextResponse.json(CreateListingResponse.parse({ listing: res.listing, token: res.token }), { status: 201 });
  } catch (e) {
    console.error('[listings] no se pudo guardar', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
