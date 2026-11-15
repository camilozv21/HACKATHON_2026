import { catalog } from '@/server/terrain/catalog';
import { handle, json, preflight } from '@/server/terrain/http';
import { langOf } from '@/server/terrain/query';

/**
 * GET /api/terrain[?lang=en] → catálogo de la API abierta del terreno: campos (unidad, misión, descripción),
 * operadores de filtro, años con dato (observados y proyectados) y ejemplos. Ver docs/terrain-api.md.
 */
export async function GET(request: Request) {
  return handle(async () => json(await catalog(langOf(new URL(request.url).searchParams))));
}

export const OPTIONS = preflight;
