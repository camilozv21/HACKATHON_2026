import { csv, geojson, handle, json, nextLink, preflight, selfLink } from '@/server/terrain/http';
import { parseQuery } from '@/server/terrain/query';
import { baseMeta, queryPlaces } from '@/server/terrain/service';

/**
 * GET /api/terrain/places → municipios y departamentos con todos sus campos.
 *
 *   ?level=mpio&riskLevel=in.(medium,high)&sort=-riskScore&limit=20
 *   ?dpto=05&pHeavy=gte.5&fields=code,name,pHeavy
 *   ?near=4.711,-74.072&radiusKm=60          ?lat=6.24&lon=-75.58          ?bbox=w,s,e,n
 *   ?year=2024&bare=gte.0.05                 (estado del terreno ese año)
 *   &format=csv | geojson
 */
export async function GET(request: Request) {
  return handle(async () => {
    const q = parseQuery(new URL(request.url).searchParams, {
      formats: ['json', 'csv', 'geojson'],
      defaultLimit: 100,
      maxLimit: 2000,
      params: ['fields', 'sort', 'limit', 'offset', 'format', 'q', 'lat', 'lon', 'bbox', 'near', 'radiusKm', 'year'],
    });
    const res = await queryPlaces(q);
    const next = nextLink(request, q.offset, q.limit, res.total);
    const extra = { total: res.total, next };
    if (q.format === 'csv') return csv(res.data, res.fields, 'terrain-places', extra);
    const meta = { ...baseMeta(res.terrain, q), total: res.total, count: res.data.length, limit: q.limit, offset: q.offset };
    if (q.format === 'geojson') return geojson(res.rows, res.data, meta, extra);
    return json({ data: res.data, meta, links: { self: selfLink(request), next, catalog: '/api/terrain' } }, extra);
  });
}

export const OPTIONS = preflight;
