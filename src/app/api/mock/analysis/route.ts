import { NextResponse } from 'next/server';
import { AnalysisRequest, AnalysisResponse } from '@/lib/api/contract';
import { buildMockAnalysis } from '@/mocks/analysis';
import { CROP_PRODUCT } from '@/lib/market/catalog';
import { marketForPoint } from '@/server/market';
import { powerForAnalysis } from '@/server/powerAnalysis';

export const dynamic = 'force-dynamic';

const centerOf = (g: AnalysisRequest['field']['geometry']): [number, number] => {
  if (g.type === 'Point') return g.coordinates;
  const ring = g.coordinates[0]!.slice(0, -1);
  return [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
};

/** Mercado de la zona (Colombia) para el puntaje de ingresos; si tarda más de 1,5 s o falla, sigue sin él. */
async function marketFor(lat: number, lon: number, locale: 'es' | 'en') {
  if (process.env.ANALYSIS_USE_MARKET === 'false') return null;
  const products = [...new Set(Object.values(CROP_PRODUCT))];
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 1500));
  return Promise.race([marketForPoint({ lat, lon, locale, products, maxProducts: 16 }).catch(() => null), timeout]);
}

/**
 * Mock de POST /analysis (mismo contrato que el backend real). El motor de recomendaciones usa el clima real de
 * NASA POWER del punto (cacheado por celda); si POWER no responde, la plantilla de la zona. En Colombia suma el
 * mercado de la zona (precios SIPSA, rendimientos EVA): ver src/mocks/engine/market.ts. Mínimo 600 ms para
 * que la UI muestre su estado de carga igual que con el backend.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = AnalysisRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  }
  const [lon, lat] = centerOf(parsed.data.field.geometry);
  const [power, market] = await Promise.all([
    powerForAnalysis(lat, lon),
    marketFor(lat, lon, parsed.data.locale),
    new Promise((r) => setTimeout(r, 600)),
  ]);
  const response = buildMockAnalysis(parsed.data, { climate: power?.climate, dailyRangeC: power?.dailyRangeC, market });
  // El mock también debe cumplir el contrato: si no, es un bug nuestro.
  const check = AnalysisResponse.safeParse(response);
  if (!check.success) {
    return NextResponse.json({ error: 'mock_out_of_contract', issues: check.error.issues }, { status: 500 });
  }
  return NextResponse.json(check.data);
}
