/**
 * GET /api/terrain: la API se describe sola (campos, unidades, operadores, años y ejemplos), para que cualquiera
 * (el frontend, el agente de n8n, un notebook) pueda usarla sin leer el código.
 */
import { HAZARDS, LAND_STATES } from '@/features/terrain/kinds';
import { availableYears, loadTerrain, MAX_PROJECTION_STEPS } from './data';
import { FIELDS } from './fields';
import { OPERATORS, RESERVED, type Lang } from './query';
import { caveats } from './service';

type Endpoint = { method: 'GET'; path: string; es: string; en: string; params: string[]; formats: string[]; examples: string[] };

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/terrain',
    es: 'Este catálogo: campos, operadores, años con dato y ejemplos.',
    en: 'This catalog: fields, operators, years with data and examples.',
    params: ['lang'],
    formats: ['json'],
    examples: ['/api/terrain?lang=en'],
  },
  {
    method: 'GET',
    path: '/api/terrain/places',
    es: 'Municipios y departamentos con todos sus campos. Filtra por cualquier campo, por ubicación y, con year, por el estado del terreno ese año.',
    en: 'Municipalities and departments with all their fields. Filter by any field, by location and, with year, by the land state that year.',
    params: ['<campo>=op.valor', 'fields', 'sort', 'limit', 'offset', 'format', 'lang', 'q', 'lat', 'lon', 'bbox', 'near', 'radiusKm', 'year'],
    formats: ['json', 'csv', 'geojson'],
    examples: [
      '/api/terrain/places?level=mpio&riskLevel=in.(medium,high)&sort=-riskScore&limit=20',
      '/api/terrain/places?dpto=05&pHeavy=gte.5&fields=code,name,pHeavy,waterLevel',
      '/api/terrain/places?near=4.711,-74.072&radiusKm=60&sort=distanceKm',
      '/api/terrain/places?year=2024&level=mpio&bare=gte.0.05&sort=-bare',
      '/api/terrain/places?q=san jose&fields=code,name,dptoName',
      '/api/terrain/places?level=dpto&format=geojson',
    ],
  },
  {
    method: 'GET',
    path: '/api/terrain/places/{code}',
    es: 'Detalle de un lugar: indicadores, riesgo con evidencia, cadena de Markov y serie anual (from/to; hasta 2045 incluye la proyección).',
    en: 'One place: indicators, risk with evidence, Markov chain and annual series (from/to; up to 2045 adds the projection).',
    params: ['from', 'to', 'year', 'lang'],
    formats: ['json'],
    examples: ['/api/terrain/places/05001', '/api/terrain/places/05001?from=2016&to=2045'],
  },
  {
    method: 'GET',
    path: '/api/terrain/series',
    es: 'Lugar × año: estado del terreno por año para una ubicación (código, punto, caja, cercanía o filtros). aggregate=true promedia los lugares elegidos.',
    en: 'Place × year: land state per year for a location (code, point, box, radius or filters). aggregate=true averages the selected places.',
    params: ['<campo>=op.valor', 'fields', 'sort', 'limit', 'offset', 'format', 'lang', 'q', 'lat', 'lon', 'bbox', 'near', 'radiusKm', 'year', 'from', 'to', 'aggregate'],
    formats: ['json', 'csv'],
    examples: [
      '/api/terrain/series?lat=6.2442&lon=-75.5812&level=mpio&from=2016&to=2031',
      '/api/terrain/series?code=05001,05088&from=2020&to=2025&fields=code,name,year,healthy,bare',
      '/api/terrain/series?dpto=18&level=mpio&aggregate=true&to=2045',
      '/api/terrain/series?level=mpio&year=2025&bare=gte.0.1&sort=-bare',
      '/api/terrain/series?bbox=-75.7,6.1,-75.4,6.4&format=csv',
    ],
  },
  {
    method: 'GET',
    path: '/api/terrain/at',
    es: 'Qué hay en un punto: el municipio y el departamento que lo contienen, con su detalle y su serie.',
    en: 'What is at a point: the municipality and department containing it, with detail and series.',
    params: ['lat', 'lon', 'from', 'to', 'year', 'lang'],
    formats: ['json'],
    examples: ['/api/terrain/at?lat=4.711&lon=-74.072', '/api/terrain/at?lat=10.39&lon=-75.51&to=2038'],
  },
];

const OPERATOR_TEXT: Record<(typeof OPERATORS)[number], { es: string; en: string; example: string }> = {
  eq: { es: 'igual (también campo=valor)', en: 'equal (also field=value)', example: 'riskLevel=eq.high' },
  neq: { es: 'distinto', en: 'not equal', example: 'trend=neq.stable' },
  gt: { es: 'mayor que', en: 'greater than', example: 'pHeavy=gt.5' },
  gte: { es: 'mayor o igual', en: 'greater or equal', example: 'riskScore=gte.34' },
  lt: { es: 'menor que', en: 'less than', example: 'smAnom=lt.-5' },
  lte: { es: 'menor o igual', en: 'less or equal', example: 'etRatio=lte.0.5' },
  in: { es: 'cualquiera de la lista', en: 'any of the list', example: 'code=in.(05001,11001)' },
  nin: { es: 'ninguno de la lista', en: 'none of the list', example: 'dpto=nin.(88,91)' },
  like: { es: 'texto con comodín * (exacto)', en: 'text with * wildcard (exact case)', example: 'name=like.San*' },
  ilike: { es: 'texto con comodín *, sin mayúsculas ni tildes', en: 'text with * wildcard, case and accent insensitive', example: 'name=ilike.*bogota*' },
  is: { es: 'sin dato (null) o con dato (notnull)', en: 'missing (null) or present (notnull)', example: 'gwTrend=is.null' },
};

const PARAM_TEXT: Record<(typeof RESERVED)[number], { es: string; en: string }> = {
  fields: { es: 'Campos a devolver, separados por coma (por defecto todos).', en: 'Fields to return, comma separated (default: all).' },
  sort: { es: 'Orden: campos separados por coma; "-" delante = descendente. Los null van al final.', en: 'Sort: comma separated fields; leading "-" = descending. Nulls last.' },
  limit: { es: 'Filas por página.', en: 'Rows per page.' },
  offset: { es: 'Filas a saltar (paginación; mira links.next).', en: 'Rows to skip (pagination; see links.next).' },
  format: { es: 'json, csv o geojson (según el endpoint).', en: 'json, csv or geojson (depends on the endpoint).' },
  lang: { es: 'es o en (mensajes, descripciones y avisos).', en: 'es or en (messages, descriptions and caveats).' },
  q: { es: 'Busca por nombre del lugar y del departamento, sin tildes.', en: 'Search by place and department name, accent insensitive.' },
  lat: { es: 'Con lon: el municipio y el departamento que contienen el punto.', en: 'With lon: the municipality and department containing the point.' },
  lon: { es: 'Ver lat.', en: 'See lat.' },
  bbox: { es: 'oeste,sur,este,norte: lugares que tocan la caja.', en: 'west,south,east,north: places touching the box.' },
  near: { es: 'lat,lon: lugares cuyo límite está a menos de radiusKm del punto (añade distanceKm; 0 = el punto cae dentro).', en: 'lat,lon: places whose boundary is within radiusKm of the point (adds distanceKm; 0 = the point is inside).' },
  radiusKm: { es: 'Radio para near (por defecto 25, máximo 1000).', en: 'Radius for near (default 25, max 1000).' },
  year: { es: 'Un año (observado o proyectado).', en: 'One year (observed or projected).' },
  from: { es: 'Primer año (por defecto, el primero observado).', en: 'First year (default: first observed).' },
  to: { es: 'Último año (por defecto, el último observado; más allá suma la proyección).', en: 'Last year (default: last observed; beyond it adds the projection).' },
  aggregate: { es: 'true: una fila por año, promedio ponderado por el área con dato válido.', en: 'true: one row per year, weighted by the valid area.' },
};

export async function catalog(lang: Lang) {
  const terrain = await loadTerrain();
  const { meta } = terrain;
  const counts = { mpio: 0, dpto: 0 };
  for (const p of terrain.places) counts[p.level]++;
  const t = <T extends { es: string; en: string }>(o: T) => o[lang];
  return {
    name: 'Field Shift — terrain API',
    version: 1,
    description: t({
      es: 'Datos abiertos del terreno de Colombia por municipio y departamento, calculados en Google Earth Engine con misiones NASA (SMAP, GPM IMERG, MODIS, GRACE/GRACE-FO, SRTM). Solo lectura, sin clave, CORS abierto.',
      en: 'Open land data for Colombia by municipality and department, computed in Google Earth Engine from NASA missions (SMAP, GPM IMERG, MODIS, GRACE/GRACE-FO, SRTM). Read only, no key, open CORS.',
    }),
    docs: 'docs/terrain-api.md',
    source: meta.source,
    generatedAt: meta.generatedAt,
    datasets: meta.datasets,
    coverage: { country: 'CO', ...counts },
    periods: meta.periods,
    years: { ...availableYears(meta), projectionStepYears: meta.periods.stepYears, maxProjectionSteps: MAX_PROJECTION_STEPS },
    states: LAND_STATES,
    hazards: HAZARDS,
    endpoints: ENDPOINTS.map(({ es, en, ...e }) => ({ ...e, description: lang === 'en' ? en : es })),
    query: {
      syntax: t({
        es: 'campo=op.valor (estilo PostgREST). Varias condiciones se combinan con Y; repite el campo para un rango.',
        en: 'field=op.value (PostgREST style). Conditions are combined with AND; repeat the field for a range.',
      }),
      operators: OPERATORS.map((op) => ({ op, description: OPERATOR_TEXT[op][lang], example: OPERATOR_TEXT[op].example })),
      params: RESERVED.map((p) => ({ name: p, description: PARAM_TEXT[p][lang] })),
    },
    fields: FIELDS.map(({ es, en, ...f }) => ({ ...f, description: lang === 'en' ? en : es })),
    caveats: caveats(lang, meta),
  };
}
