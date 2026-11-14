import { ImageResponse } from 'next/og';

export const alt = 'Field Shift — tu finca desde el espacio con datos de la NASA';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Imagen para compartir (Open Graph): globo verde sobre el espacio con el nombre y la promesa de la app. */
export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === 'en';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          background: 'radial-gradient(circle at 70% 50%, #0d1b2e 0%, #05070d 60%)',
          color: '#eef2f8',
          fontFamily: 'sans-serif',
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', width: 620 }}>
          <div style={{ fontSize: 30, color: '#6ee39a', letterSpacing: 4, textTransform: 'uppercase' }}>NASA Space Apps 2026</div>
          <div style={{ fontSize: 96, fontWeight: 800, marginTop: 12 }}>Field Shift</div>
          <div style={{ fontSize: 40, marginTop: 16, color: '#a7b2c4', lineHeight: 1.3 }}>
            {en
              ? 'Explore crop rotations with NASA data to care for your soil and adapt to the climate.'
              : 'Explora rotaciones de cultivos con datos de la NASA para cuidar tu suelo y adaptarte al clima.'}
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
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
