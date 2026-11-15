/**
 * Lenguaje de consulta de /api/terrain, al estilo de PostgREST:
 *
 *   ?campo=valor               igual (en códigos y enums, `a,b` = cualquiera de la lista)
 *   ?campo=op.valor            op ∈ eq, neq, gt, gte, lt, lte, in, nin, like, ilike, is
 *   ?pHeavy=gte.3&pHeavy=lt.8  varias condiciones se combinan con Y
 *   ?riskLevel=in.(medium,high)   ?name=ilike.*san*   ?gwTrend=is.null
 *
 * Más los parámetros reservados (fields, sort, limit, offset, format, lang, q, lat, lon, bbox, near, radiusKm,
 * year, from, to, aggregate). Cualquier otro nombre debe ser un campo del catálogo: un error dice cuáles hay.
 */
import { FIELD_MAP, type FieldDef, type Row, type Value } from './fields';

export const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'like', 'ilike', 'is'] as const;
export type Op = (typeof OPERATORS)[number];

export const RESERVED = [
  'fields',
  'sort',
  'limit',
  'offset',
  'format',
  'lang',
  'q',
  'lat',
  'lon',
  'bbox',
  'near',
  'radiusKm',
  'year',
  'from',
  'to',
  'aggregate',
] as const;
const RESERVED_SET = new Set<string>(RESERVED);

export type Lang = 'es' | 'en';
export type Format = 'json' | 'csv' | 'geojson';

/** Error de la consulta (400). `code` es estable; `detail` explica en el idioma pedido. */
export class QueryError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
    readonly hint?: Record<string, unknown>,
    readonly status = 400,
  ) {
    super(detail);
  }
}

export type Filter = {
  field: FieldDef;
  op: Op;
  /** Valor ya convertido al tipo del campo; lista para in/nin; 'null' | 'notnull' para is. */
  value: Value | Value[];
  /** Expresión regular para like/ilike. */
  pattern?: RegExp;
};

export type SortKey = { field: string; desc: boolean };

export type Query = {
  lang: Lang;
  format: Format;
  filters: Filter[];
  sort: SortKey[];
  fields: string[] | null;
  limit: number;
  offset: number;
  q: string | null;
  point: { lat: number; lon: number } | null;
  bbox: [number, number, number, number] | null;
  near: { lat: number; lon: number; radiusKm: number } | null;
  year: number | null;
  from: number | null;
  to: number | null;
  aggregate: boolean;
};

export type Reserved = (typeof RESERVED)[number];

export type QueryOptions = {
  formats: readonly Format[];
  defaultLimit?: number;
  maxLimit?: number;
  /** Parámetros reservados que acepta el endpoint (por defecto, todos). Los demás dan error en vez de ignorarse. */
  params?: readonly Reserved[];
  /** ¿Acepta filtros por campo? (por defecto, sí). */
  filters?: boolean;
};

/** Idioma de mensajes y descripciones: solo por `lang` (no por Accept-Language, para no partir la caché pública). */
export function langOf(params: URLSearchParams): Lang {
  return params.get('lang') === 'en' ? 'en' : 'es';
}

const msg = (lang: Lang, es: string, en: string) => (lang === 'en' ? en : es);

/** Quita tildes y pasa a minúsculas: "Medellín" ~ "medellin". */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function toNumber(raw: string, lang: Lang, what: string): number {
  const n = Number(raw.trim());
  if (raw.trim() === '' || !Number.isFinite(n))
    throw new QueryError('invalid-number', msg(lang, `"${what}" debe ser un número (llegó "${raw}").`, `"${what}" must be a number (got "${raw}").`));
  return n;
}

function toInt(raw: string, lang: Lang, what: string): number {
  const n = toNumber(raw, lang, what);
  if (!Number.isInteger(n))
    throw new QueryError('invalid-integer', msg(lang, `"${what}" debe ser un entero.`, `"${what}" must be an integer.`));
  return n;
}

function coerce(field: FieldDef, raw: string, lang: Lang): Value {
  if (raw === 'null') return null;
  if (field.type === 'number' || field.type === 'integer') return toNumber(raw, lang, field.name);
  if (field.type === 'enum' && field.values && !field.values.includes(raw))
    throw new QueryError(
      'invalid-value',
      msg(lang, `"${raw}" no es un valor de "${field.name}".`, `"${raw}" is not a value of "${field.name}".`),
      { field: field.name, values: field.values },
    );
  return raw;
}

const listOf = (raw: string) =>
  raw
    .replace(/^\((.*)\)$/s, '$1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** `*` = cualquier texto. ilike ignora mayúsculas y tildes. */
function likePattern(raw: string, insensitive: boolean): RegExp {
  const src = (insensitive ? fold(raw) : raw).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${src}$`, 's');
}

export function parseFilter(name: string, raw: string, lang: Lang): Filter {
  const field = FIELD_MAP.get(name);
  if (!field)
    throw new QueryError(
      'unknown-field',
      msg(lang, `"${name}" no es un campo ni un parámetro. Mira GET /api/terrain.`, `"${name}" is not a field or parameter. See GET /api/terrain.`),
      { fields: [...FIELD_MAP.keys()], params: RESERVED },
    );
  const m = /^(eq|neq|gt|gte|lt|lte|in|nin|like|ilike|is)\.(.*)$/s.exec(raw);
  const textual = field.type === 'string' || field.type === 'enum';
  if (!m) {
    // Atajo: `campo=valor` es igual; en códigos y enums, `a,b` es cualquiera de la lista.
    const list = field.type === 'enum' || field.name === 'code' || field.name === 'dpto' ? listOf(raw) : [raw];
    if (list.length > 1) return { field, op: 'in', value: list.map((v) => coerce(field, v, lang)) };
    return { field, op: 'eq', value: coerce(field, raw, lang) };
  }
  const op = m[1] as Op;
  const rest = m[2]!;
  if (op === 'is') {
    if (rest !== 'null' && rest !== 'notnull')
      throw new QueryError('invalid-value', msg(lang, 'Usa is.null o is.notnull.', 'Use is.null or is.notnull.'));
    return { field, op, value: rest };
  }
  if (op === 'in' || op === 'nin') return { field, op, value: listOf(rest).map((v) => coerce(field, v, lang)) };
  if (op === 'like' || op === 'ilike') {
    if (!textual)
      throw new QueryError('invalid-operator', msg(lang, `${op} solo sirve con campos de texto.`, `${op} only works on text fields.`));
    return { field, op, value: rest, pattern: likePattern(rest, op === 'ilike') };
  }
  return { field, op, value: coerce(field, rest, lang) };
}

function cmp(a: Value, b: Value): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** ¿La fila cumple el filtro? Como en SQL, un valor null solo cumple `is.null`. */
export function matches(row: Row, f: Filter): boolean {
  const v = row[f.field.name] ?? null;
  if (f.op === 'is') return f.value === 'null' ? v == null : v != null;
  // `campo=null` (eq.null) es lo mismo que is.null; cualquier otra comparación con null no se cumple.
  if (v == null) return f.op === 'eq' && f.value === null;
  switch (f.op) {
    case 'eq':
      return f.value !== null && cmp(v, f.value as Value) === 0;
    case 'neq':
      return f.value === null || cmp(v, f.value as Value) !== 0;
    case 'gt':
      return f.value !== null && cmp(v, f.value as Value) > 0;
    case 'gte':
      return f.value !== null && cmp(v, f.value as Value) >= 0;
    case 'lt':
      return f.value !== null && cmp(v, f.value as Value) < 0;
    case 'lte':
      return f.value !== null && cmp(v, f.value as Value) <= 0;
    case 'in':
      return (f.value as Value[]).some((x) => x !== null && cmp(v, x) === 0);
    case 'nin':
      return !(f.value as Value[]).some((x) => x !== null && cmp(v, x) === 0);
    case 'like':
      return f.pattern!.test(String(v));
    case 'ilike':
      return f.pattern!.test(fold(String(v)));
  }
}

export const matchesAll = (row: Row, filters: readonly Filter[]) => filters.every((f) => matches(row, f));

/** Ordena sin mutar; los null van siempre al final. */
export function sortRows<T extends Row>(rows: T[], keys: readonly SortKey[]): T[] {
  if (!keys.length) return rows;
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const va = a[k.field] ?? null;
      const vb = b[k.field] ?? null;
      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = cmp(va, vb);
      if (c) return k.desc ? -c : c;
    }
    return 0;
  });
}

export function pick(row: Row, fields: readonly string[] | null): Row {
  if (!fields) return row;
  const out: Row = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out;
}

function parseCoords(raw: string, lang: Lang, what: string): { lat: number; lon: number } {
  const parts = raw.split(',');
  if (parts.length !== 2)
    throw new QueryError('invalid-location', msg(lang, `"${what}" va como lat,lon.`, `"${what}" must be lat,lon.`));
  return checkPoint(toNumber(parts[0]!, lang, what), toNumber(parts[1]!, lang, what), lang);
}

function checkPoint(lat: number, lon: number, lang: Lang) {
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180)
    throw new QueryError('invalid-location', msg(lang, 'Latitud o longitud fuera de rango.', 'Latitude or longitude out of range.'));
  return { lat, lon };
}

/** Lee y valida toda la consulta. Lanza QueryError con un mensaje que dice cómo arreglarla. */
export function parseQuery(params: URLSearchParams, opts: QueryOptions): Query {
  const lang = langOf(params);
  const allowed = new Set<string>(opts.params ?? RESERVED);
  allowed.add('lang');

  const filters: Filter[] = [];
  for (const name of new Set(params.keys())) {
    // `_algo` se ignora (p. ej. `_=123` para romper cachés).
    if (name.startsWith('_')) continue;
    if (RESERVED_SET.has(name)) {
      if (!allowed.has(name))
        throw new QueryError(
          'unsupported-param',
          msg(lang, `Este endpoint no usa "${name}".`, `This endpoint does not use "${name}".`),
          { params: [...allowed] },
        );
      continue;
    }
    if (opts.filters === false)
      throw new QueryError(
        'unsupported-param',
        msg(lang, `Este endpoint no filtra por campos ("${name}").`, `This endpoint does not filter by fields ("${name}").`),
        { params: [...allowed] },
      );
    for (const raw of params.getAll(name)) filters.push(parseFilter(name, raw, lang));
  }

  const format = (params.get('format') ?? 'json') as Format;
  if (!opts.formats.includes(format))
    throw new QueryError('invalid-format', msg(lang, `Formatos: ${opts.formats.join(', ')}.`, `Formats: ${opts.formats.join(', ')}.`), {
      formats: opts.formats,
    });

  const fieldsRaw = params.get('fields');
  let fields: string[] | null = null;
  if (fieldsRaw && fieldsRaw !== '*') {
    fields = listOf(fieldsRaw);
    const bad = fields.filter((f) => !FIELD_MAP.has(f));
    if (bad.length)
      throw new QueryError('unknown-field', msg(lang, `Campos desconocidos: ${bad.join(', ')}.`, `Unknown fields: ${bad.join(', ')}.`), {
        fields: [...FIELD_MAP.keys()],
      });
  }

  const sort: SortKey[] = listOf(params.get('sort') ?? '').map((s) => {
    const desc = s.startsWith('-');
    const field = desc ? s.slice(1) : s.replace(/^\+/, '');
    if (!FIELD_MAP.has(field))
      throw new QueryError('unknown-field', msg(lang, `No se puede ordenar por "${field}".`, `Cannot sort by "${field}".`), {
        fields: [...FIELD_MAP.keys()],
      });
    return { field, desc };
  });

  const limitRaw = params.get('limit');
  const maxLimit = opts.maxLimit ?? 1000;
  const limit = limitRaw == null ? (opts.defaultLimit ?? 100) : toInt(limitRaw, lang, 'limit');
  if (limit < 1 || limit > maxLimit)
    throw new QueryError('invalid-limit', msg(lang, `limit va de 1 a ${maxLimit}.`, `limit goes from 1 to ${maxLimit}.`));
  const offset = params.has('offset') ? toInt(params.get('offset')!, lang, 'offset') : 0;
  if (offset < 0) throw new QueryError('invalid-offset', msg(lang, 'offset no puede ser negativo.', 'offset cannot be negative.'));

  const hasLat = params.has('lat');
  const hasLon = params.has('lon');
  if (hasLat !== hasLon)
    throw new QueryError('invalid-location', msg(lang, 'lat y lon van juntos.', 'lat and lon go together.'));
  const point = hasLat ? checkPoint(toNumber(params.get('lat')!, lang, 'lat'), toNumber(params.get('lon')!, lang, 'lon'), lang) : null;

  let bbox: Query['bbox'] = null;
  const bboxRaw = params.get('bbox');
  if (bboxRaw != null) {
    const b = bboxRaw.split(',').map((v) => toNumber(v, lang, 'bbox'));
    if (b.length !== 4 || b[0]! > b[2]! || b[1]! > b[3]!)
      throw new QueryError('invalid-bbox', msg(lang, 'bbox va como oeste,sur,este,norte.', 'bbox must be west,south,east,north.'));
    bbox = b as [number, number, number, number];
  }

  let near: Query['near'] = null;
  const nearRaw = params.get('near');
  if (nearRaw != null) {
    const radiusKm = params.has('radiusKm') ? toNumber(params.get('radiusKm')!, lang, 'radiusKm') : 25;
    if (radiusKm <= 0 || radiusKm > 1000)
      throw new QueryError('invalid-radius', msg(lang, 'radiusKm va de 0 a 1000.', 'radiusKm goes from 0 to 1000.'));
    near = { ...parseCoords(nearRaw, lang, 'near'), radiusKm };
  } else if (params.has('radiusKm')) {
    throw new QueryError('invalid-location', msg(lang, 'radiusKm necesita near=lat,lon.', 'radiusKm needs near=lat,lon.'));
  }

  const yearOf = (k: string) => (params.has(k) ? toInt(params.get(k)!, lang, k) : null);
  const year = yearOf('year');
  const from = yearOf('from');
  const to = yearOf('to');
  if (year != null && (from != null || to != null))
    throw new QueryError('invalid-time', msg(lang, 'Usa year o from/to, no los dos.', 'Use year or from/to, not both.'));
  if (from != null && to != null && from > to)
    throw new QueryError('invalid-time', msg(lang, 'from no puede ser mayor que to.', 'from cannot be greater than to.'));

  const agg = params.get('aggregate');
  if (agg != null && agg !== 'true' && agg !== 'false')
    throw new QueryError('invalid-value', msg(lang, 'aggregate es true o false.', 'aggregate is true or false.'));

  const q = params.get('q')?.trim() || null;

  return { lang, format, filters, sort, fields, limit, offset, q, point, bbox, near, year, from, to, aggregate: agg === 'true' };
}
