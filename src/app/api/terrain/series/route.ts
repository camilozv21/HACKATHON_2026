import { csv, handle, json, nextLink, preflight, selfLink } from '@/server/terrain/http';
import { parseQuery } from '@/server/terrain/query';
import { baseMeta, querySeries } from '@/server/terrain/service';

/**
 * GET /api/terrain/series → estado del terreno por lugar y año (ubicación × tiempo).
 *
 *   ?lat=6.2442&lon=-75.5812&level=mpio&from=2016&to=2031     (un punto; 2031 = proyección)
 *   ?code=05001,05088&from=2020&to=2025&fields=code,year,healthy,bare
 *   ?dpto=18&level=mpio&aggregate=true&to=2045                 (promedio del departamento por año)
 *   ?level=mpio&year=2025&bare=gte.0.1&sort=-bare              (filtros por año)
 *   &format=csv
 */
export async function GET(request: Request) {
  return handle(async () => {
    const q = parseQuery(new URL(request.url).searchParams, { formats: ['json', 'csv'], defaultLimit: 1000, maxLimit: 20_000 });
    const res = await querySeries(q);
    const next = nextLink(request, q.offset, q.limit, res.total);
    const extra = { total: res.total, next };
    if (q.format === 'csv') return csv(res.data, res.fields, 'terrain-series', extra);
    const meta = {
      ...baseMeta(res.terrain, q),
      total: res.total,
      count: res.data.length,
      limit: q.limit,
      offset: q.offset,
      aggregate: res.aggregate,
    };
    return json({ data: res.data, meta, links: { self: selfLink(request), next, catalog: '/api/terrain' } }, extra);
  });
}

export const OPTIONS = preflight;
