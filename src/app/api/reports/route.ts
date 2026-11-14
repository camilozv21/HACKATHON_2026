import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { CommunityReportInput, CommunityReportResponse } from '@/lib/api/contract';
import { addReport } from '@/server/events/community';

/**
 * POST /api/reports → guarda un reporte de la comunidad (mock en memoria, sin verificar).
 * Sin datos personales: el cuerpo no tiene nombre ni contacto, el texto se limpia de teléfonos, correos y enlaces,
 * y para limitar el abuso solo se guarda un resumen irreversible de la IP durante 10 minutos.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }
  const parsed = CommunityReportInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid-report' }, { status: 400 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
  const key = createHash('sha256').update(`fieldshift:${ip}`).digest('base64url').slice(0, 16);
  const res = addReport(parsed.data, key);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === 'rate' ? 429 : 400 });
  return NextResponse.json(CommunityReportResponse.parse({ report: res.report }), { status: 201 });
}
