import { NextResponse } from 'next/server';
import { PRODUCT_IDS, type ProductId } from '@/lib/market/catalog';
import { marketForPoint } from '@/server/market';

export const dynamic = 'force-dynamic';

/**
 * GET /api/market?lat&lon&locale=es&products=platano,cafe → mercado de la zona (Colombia) o `{ market: null }`.
 * Precios mayoristas (DANE SIPSA), rendimientos (EVA), crédito (Finagro), TRM e insumos, más la conclusión del
 * departamento. Cambia una vez al día como mucho: se guarda en caché pública una hora.
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const lat = Number(u.searchParams.get('lat'));
  const lon = Number(u.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'invalid-point' }, { status: 400 });
  }
  const locale = u.searchParams.get('locale') === 'en' ? 'en' : 'es';
  const products = (u.searchParams.get('products') ?? '')
    .split(',')
    .filter((p): p is ProductId => (PRODUCT_IDS as readonly string[]).includes(p))
    .slice(0, 8);
  try {
    const market = await marketForPoint({ lat, lon, locale, products });
    return NextResponse.json({ market }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch (e) {
    console.error('[market]', e);
    return NextResponse.json({ error: 'market-unavailable' }, { status: 503 });
  }
}
