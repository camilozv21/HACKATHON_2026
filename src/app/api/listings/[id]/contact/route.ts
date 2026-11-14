import { NextResponse } from 'next/server';
import { contactLink } from '@/server/listings';
import { clientIp, createRateLimiter } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

// 30 contactos cada 10 minutos por IP: frena que se recolecten teléfonos en masa.
const limited = createRateLimiter({ windowMs: 10 * 60_000, max: 30 });

/**
 * GET /api/listings/:id/contact?locale=es&product=cafe → redirige (302) a WhatsApp con un mensaje prellenado.
 * El teléfono solo aparece en esa redirección, nunca en el JSON ni en el HTML de la publicación.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = new URL(request.url);
  const locale = u.searchParams.get('locale') === 'en' ? 'en' : 'es';
  if (limited(clientIp(request))) return NextResponse.json({ error: 'rate' }, { status: 429 });
  try {
    const link = await contactLink(id, locale, u.searchParams.get('product') ?? undefined);
    if (link === 'sample') {
      // Ejemplo de la demo: vuelve a su página con un aviso en vez de abrir un chat con un número inventado.
      return NextResponse.redirect(new URL(`/${locale}/fincas/${encodeURIComponent(id)}?ejemplo=1`, u), 302);
    }
    if (!link) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.redirect(link, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (e) {
    console.error('[listings] contact', e);
    return NextResponse.json({ error: 'storage' }, { status: 503 });
  }
}
