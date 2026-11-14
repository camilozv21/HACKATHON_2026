import { ImageResponse } from 'next/og';
import type { ProductId } from '@/lib/market/catalog';
import { getListing } from '@/server/listings';
import { productName } from '@/server/market/rules';

export const alt = 'Field Shift — finca que vende su cosecha';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Vista previa para compartir una finca (WhatsApp, redes): nombre, municipio y productos. Sin foto satelital: un PNG con
 * foto pesa ~1 MB y WhatsApp descarta las vistas previas pesadas (la foto está en la página).
 */
export default async function OpengraphImage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const l = locale === 'en' ? 'en' : 'es';
  const listing = await getListing(id).catch(() => null);
  const products = listing?.products.slice(0, 4).map((p) => productName(p.product as ProductId, l)) ?? [];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#05070d', color: '#eef2f8', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 640, padding: 64 }}>
          <div style={{ fontSize: 28, color: '#6ee39a', letterSpacing: 3, textTransform: 'uppercase' }}>
            {l === 'en' ? 'Farms selling · Field Shift' : 'Fincas que venden · Field Shift'}
          </div>
          <div style={{ fontSize: 72, fontWeight: 800, marginTop: 16, lineHeight: 1.05 }}>{listing?.farmName ?? 'Field Shift'}</div>
          {listing && <div style={{ fontSize: 34, marginTop: 14, color: '#a7b2c4' }}>{listing.place}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 28 }}>
            {products.map((p) => (
              <div
                key={p}
                style={{ display: 'flex', fontSize: 30, padding: '8px 22px', marginRight: 12, marginBottom: 12, borderRadius: 999, background: 'rgba(110,227,154,0.18)', color: '#6ee39a' }}
              >
                {p}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 26, marginTop: 18, color: '#a7b2c4' }}>
            {l === 'en' ? 'Direct contact on WhatsApp · no commissions' : 'Contacto directo por WhatsApp · sin comisiones'}
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 380,
              height: 380,
              borderRadius: 9999,
              background: 'radial-gradient(circle at 38% 32%, #6ee39a 0%, #1f8a53 45%, #0b3a22 100%)',
              boxShadow: '0 0 90px 30px rgba(124,196,255,0.25)',
              display: 'flex',
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
