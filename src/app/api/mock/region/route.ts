import { NextResponse } from 'next/server';
import { parseTimeParam, periodLabel, periodOf } from '@/features/time/period';
import { RegionSummary } from '@/lib/api/contract';
import { buildMockRegion } from '@/mocks/region';
import { powerPeriod, powerRecent } from '@/server/powerRecent';

export const dynamic = 'force-dynamic';

/**
 * Mock de GET /region?lat&lon[&demo][&name][&t]&locale — mismo contrato que el backend real.
 * `t` (2026-05 o 2026-05-14): máquina del tiempo; las tarjetas muestran ese mes con datos reales de NASA POWER.
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const lat = Number(u.searchParams.get('lat'));
  const lon = Number(u.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const locale = u.searchParams.get('locale') === 'en' ? 'en' : 'es';
  const rawT = u.searchParams.get('t');
  const sel = parseTimeParam(rawT);
  if (rawT && !sel) return NextResponse.json({ error: 'invalid_time' }, { status: 400 });
  const period = sel ? periodOf(sel) : null;

  const [power] = await Promise.all([
    period ? powerPeriod(lat, lon, period.start, period.end) : powerRecent(lat, lon),
    new Promise((r) => setTimeout(r, 300)),
  ]);
  const summary = buildMockRegion(
    {
      lat,
      lon,
      demoId: u.searchParams.get('demo') ?? undefined,
      name: u.searchParams.get('name'),
      locale,
      period:
        sel && period
          ? { start: period.start, end: period.end, partial: period.partial, label: periodLabel({ kind: 'month', ym: period.start.slice(0, 7) }, locale) }
          : undefined,
    },
    power,
  );
  const check = RegionSummary.safeParse(summary);
  if (!check.success) return NextResponse.json({ error: 'mock_out_of_contract', issues: check.error.issues }, { status: 500 });
  return NextResponse.json(check.data);
}
