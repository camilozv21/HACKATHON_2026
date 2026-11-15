import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RadioProgramResponse } from '@/lib/api/contract';
import { buildProgram } from '@/server/radio/program';
import { clientIp, createRateLimiter } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/radio/program?lat&lon[&name][&station][&locale][&role][&mode][&units][&quick=1]
 * Programa del día de la radio para un punto, escrito con sus datos (NASA POWER, sensores, eventos, terreno,
 * mercado). Con quick=1 responde enseguida con el guion de plantillas (`pending: true` si Claude puede mejorarlo);
 * sin quick, Claude lo reescribe (10–20 s la primera vez; luego, una hora en caché).
 * Detalle: docs/radio.md.
 */
const rateLimited = createRateLimiter({ windowMs: 60_000, max: 30 });

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  name: z.string().trim().max(120).optional(),
  station: z.string().max(80).optional(),
  locale: z.enum(['es', 'en']).default('es'),
  role: z.enum(['farmer', 'technician']).optional(),
  mode: z.enum(['lite', 'full']).default('full'),
  units: z.enum(['metric', 'imperial']).default('metric'),
  quick: z.enum(['0', '1']).optional(),
});

export async function GET(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const q = Query.safeParse(params);
  if (!q.success) return NextResponse.json({ error: 'invalid_request', issues: q.error.issues }, { status: 400 });

  const { lat, lon, name, station, locale, role, mode, units, quick } = q.data;
  try {
    const { program } = await buildProgram({ lat, lon, name, stationId: station, locale, role, mode, units, quick: quick === '1' });
    return NextResponse.json(RadioProgramResponse.parse(program), {
      headers: { 'Cache-Control': 'no-store', 'X-Radio-Script': program.by },
    });
  } catch (err) {
    console.warn('[radio] no se pudo armar el programa', (err as Error).name);
    return NextResponse.json({ error: 'program_failed' }, { status: 502 });
  }
}
