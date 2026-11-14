import { NextResponse } from 'next/server';
import { dbEnabled } from '@/server/db';
import { MARKET_SOURCES, refreshMarket, type MarketSource } from '@/server/market/refresh';
import { checkJobSecret } from '@/server/text';

export const dynamic = 'force-dynamic';
// SIPSA manda la historia completa (~60 MB): la descarga y la agregación tardan 20–60 s.
export const maxDuration = 300;

/**
 * POST /api/market/jobs/refresh?sources=trm,inputs | sipsa,sipsa-supply | eva,finagro
 * Header `X-FieldShift-Secret: $MARKET_JOB_SECRET` (lo envía n8n; ver docs/n8n/market-scheduler.json).
 * Responde el reporte de cada fuente; 207 si alguna falló.
 */
export async function POST(request: Request) {
  const denied = checkJobSecret(request);
  if (denied) return NextResponse.json({ error: denied.status === 503 ? 'job-secret-not-configured' : 'unauthorized' }, { status: denied.status });
  if (!dbEnabled()) return NextResponse.json({ error: 'no-database' }, { status: 503 });

  const requested = (new URL(request.url).searchParams.get('sources') ?? 'trm,inputs').split(',').map((s) => s.trim());
  const sources = requested.filter((s): s is MarketSource => (MARKET_SOURCES as readonly string[]).includes(s));
  if (!sources.length) return NextResponse.json({ error: 'invalid-sources', allowed: MARKET_SOURCES }, { status: 400 });

  const report = await refreshMarket(sources);
  return NextResponse.json({ report }, { status: report.every((r) => r.ok) ? 200 : 207 });
}
