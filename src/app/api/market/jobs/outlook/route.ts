import { NextResponse } from 'next/server';
import { dbEnabled } from '@/server/db';
import { buildOutlooks, claudeOutlookEnabled } from '@/server/market/outlook';
import { checkJobSecret } from '@/server/text';

export const dynamic = 'force-dynamic';
// Una llamada a Claude por departamento (33), 4 a la vez.
export const maxDuration = 300;

/**
 * POST /api/market/jobs/outlook[?depts=63,76] → conclusiones de mercado por departamento (Claude; reglas sin
 * clave o si falla). Header `X-FieldShift-Secret: $MARKET_JOB_SECRET`. Correr después de refrescar SIPSA.
 */
export async function POST(request: Request) {
  const denied = checkJobSecret(request);
  if (denied) return NextResponse.json({ error: denied.status === 503 ? 'job-secret-not-configured' : 'unauthorized' }, { status: denied.status });
  if (!dbEnabled()) return NextResponse.json({ error: 'no-database' }, { status: 503 });
  const depts = (new URL(request.url).searchParams.get('depts') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{2}$/.test(s));
  const report = await buildOutlooks({ depts });
  return NextResponse.json({ by: claudeOutlookEnabled() ? 'claude' : 'rules', report });
}
