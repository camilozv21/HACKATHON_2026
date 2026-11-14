import { NextResponse } from 'next/server';
import { OutlookRequest, OutlookResponse, type OutlookRequestParsed } from '@/lib/api/outlook';
import { buildMockOutlook } from '@/mocks/outlook';
import { nearestMunicipio } from '@/server/events/divipola';

export const dynamic = 'force-dynamic';

const centerOf = (g: OutlookRequestParsed['field']['geometry']): [number, number] => {
  if (g.type === 'Point') return g.coordinates;
  const ring = g.coordinates[0]!.slice(0, -1);
  return [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
};

/**
 * Mock de POST /rotations/outlook (mismo contrato que el backend real): cómo evoluciona cada rotación en 10 años
 * y qué le pide a la familia. Sin red: todo sale de las estrategias que manda el cliente y de reglas visibles.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = OutlookRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  }
  const [lon, lat] = centerOf(parsed.data.field.geometry);
  // Dentro de Colombia (a menos de 30 km del centro de un municipio) se suma el contexto del país.
  const muni = nearestMunicipio(lat, lon, 30);
  const hint = muni
    ? { region: 'co' as const, placeName: `${muni.name}, ${muni.dept}` }
    : { region: 'global' as const, placeName: null };
  await new Promise((r) => setTimeout(r, 400));
  const response = buildMockOutlook(parsed.data, hint);
  const check = OutlookResponse.safeParse(response);
  if (!check.success) {
    return NextResponse.json({ error: 'mock_out_of_contract', issues: check.error.issues }, { status: 500 });
  }
  return NextResponse.json(check.data);
}
