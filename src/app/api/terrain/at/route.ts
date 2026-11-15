import { handle, json, preflight, selfLink } from '@/server/terrain/http';
import { parseQuery } from '@/server/terrain/query';
import { baseMeta, queryAt } from '@/server/terrain/service';

/**
 * GET /api/terrain/at?lat&lon[&from&to | &year] → el municipio y el departamento que contienen el punto (límites
 * del DANE), con su detalle y su serie. Fuera de Colombia: 404 `outside-coverage` con el municipio más cercano
 * (si hay uno a menos de 50 km).
 */
export async function GET(request: Request) {
  return handle(async () => {
    const q = parseQuery(new URL(request.url).searchParams, {
      formats: ['json'],
      params: ['lat', 'lon', 'year', 'from', 'to'],
      filters: false,
    });
    const res = await queryAt(q);
    return json({ data: res.data, meta: baseMeta(res.terrain, q), links: { self: selfLink(request), catalog: '/api/terrain' } });
  });
}

export const OPTIONS = preflight;
