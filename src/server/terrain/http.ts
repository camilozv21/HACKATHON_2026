/**
 * Respuestas de /api/terrain: CORS abierto (es una API de datos públicos, solo lectura), caché pública y
 * errores con el mismo formato `{ error, detail, hint? }`.
 */
import { NextResponse } from 'next/server';
import type { Row } from './fields';
import { QueryError } from './query';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept-Language',
  'Access-Control-Expose-Headers': 'X-Total-Count, Link',
};

/** Los datos cambian solo al regenerarlos (scripts/build-terrain-co.mjs) y desplegar. */
const CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

export const preflight = () => new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' } });

type Extra = { total?: number; next?: string | null };

function headers(extra: Extra = {}, more: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...CORS_HEADERS, 'Cache-Control': CACHE, ...more };
  if (extra.total != null) h['X-Total-Count'] = String(extra.total);
  if (extra.next) h.Link = `<${extra.next}>; rel="next"`;
  return h;
}

export function json(body: unknown, extra?: Extra) {
  return NextResponse.json(body, { headers: headers(extra) });
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly Row[], fields: readonly string[]): string {
  const lines = [fields.join(',')];
  for (const r of rows) lines.push(fields.map((f) => csvCell(r[f])).join(','));
  return `${lines.join('\n')}\n`;
}

export function csv(rows: readonly Row[], fields: readonly string[], filename: string, extra?: Extra) {
  return new NextResponse(toCsv(rows, fields), {
    headers: headers(extra, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}.csv"`,
    }),
  });
}

/** Puntos (punto interior de cada lugar) con las propiedades pedidas. `meta` va como miembro extra. */
export function geojson(full: readonly Row[], picked: readonly Row[], meta: unknown, extra?: Extra) {
  const body = {
    type: 'FeatureCollection',
    features: full.map((r, i) => ({
      type: 'Feature',
      id: r.code,
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: picked[i],
    })),
    meta,
  };
  return new NextResponse(JSON.stringify(body), {
    headers: headers(extra, { 'Content-Type': 'application/geo+json; charset=utf-8' }),
  });
}

/** URL de la página siguiente (o null si ya no hay más). */
export function nextLink(request: Request, offset: number, limit: number, total: number): string | null {
  if (offset + limit >= total) return null;
  const u = new URL(request.url);
  u.searchParams.set('offset', String(offset + limit));
  u.searchParams.set('limit', String(limit));
  return `${u.pathname}${u.search}`;
}

export function selfLink(request: Request): string {
  const u = new URL(request.url);
  return `${u.pathname}${u.search}`;
}

/** Ejecuta la consulta y convierte los errores: QueryError → 400/404 con detalle; lo demás → 503. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof QueryError)
      return NextResponse.json(
        { error: e.code, detail: e.detail, ...(e.hint ? { hint: e.hint } : {}) },
        { status: e.status, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
      );
    console.error('[terrain-api]', e);
    return NextResponse.json(
      { error: 'terrain-unavailable', detail: 'No se pudieron leer los datos del terreno.' },
      { status: 503, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
    );
  }
}
