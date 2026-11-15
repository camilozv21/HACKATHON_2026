import { handle, json, preflight, selfLink } from '@/server/terrain/http';
import { QueryError, langOf, parseQuery } from '@/server/terrain/query';
import { baseMeta, queryPlace } from '@/server/terrain/service';

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/terrain/places/:code[?from&to | ?year] → un municipio (5 dígitos) o departamento (2): indicadores,
 * riesgo con evidencia, cadena de Markov y serie anual. `to` más allá de 2025 suma la proyección (2031, 2038, 2045).
 */
export async function GET(request: Request, ctx: Ctx) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    const { code } = await ctx.params;
    if (!/^\d{2}(\d{3})?$/.test(code))
      throw new QueryError(
        'invalid-code',
        langOf(params) === 'en'
          ? 'The code is DIVIPOLA: 2 digits (department) or 5 (municipality).'
          : 'El código es DIVIPOLA: 2 dígitos (departamento) o 5 (municipio).',
      );
    const q = parseQuery(params, { formats: ['json'], params: ['year', 'from', 'to'], filters: false });
    const res = await queryPlace(code, q);
    return json({
      data: res.data,
      meta: baseMeta(res.terrain, q),
      links: {
        self: selfLink(request),
        series: `/api/terrain/series?code=${code}&to=${res.data.series.at(-1)?.year ?? ''}`,
        catalog: '/api/terrain',
      },
    });
  });
}

export const OPTIONS = preflight;
