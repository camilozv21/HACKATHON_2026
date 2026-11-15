/**
 * Puntaje de Field Shift: reglas compartidas por el servidor (que decide y guarda) y el cliente (que estima los
 * puntos de quien aún no tiene cuenta y muestra el nivel). Sin dependencias: lo importan chunks diferidos y RSC.
 *
 * El servidor es la única fuente del total de una cuenta: el cliente dice QUÉ hizo y el servidor aplica estas reglas
 * (puntos fijos, una vez por referencia, topes diarios y totales). Detalle: docs/points.md.
 */

export const POINT_ACTIONS = [
  'signup',
  'quest',
  'visit',
  'field',
  'analyze',
  'region',
  'layer',
  'radio',
  'ask',
  'glossary',
  'report',
  'publish',
] as const;
export type PointAction = (typeof POINT_ACTIONS)[number];

export type PointRule = {
  /** Puntos fijos por cada vez que cuenta (en `quest`, la base: se suman 20 por estrella). */
  points: number;
  /**
   * - `ref`: una vez por referencia (cada capa, cada finca, cada término).
   * - `day`: una vez al día (la referencia es la fecha del servidor).
   * - `best`: se guarda el mejor resultado (repetir los retos con más estrellas suma la diferencia).
   */
  per: 'ref' | 'day' | 'best';
  /** Máximo de veces que cuenta en un día. */
  dailyCap?: number;
  /** Máximo de veces que cuenta en total. */
  totalCap?: number;
  /** Solo lo otorga el servidor (crear la cuenta; publicar se verifica con el token de la publicación). */
  serverOnly?: boolean;
};

export const POINT_RULES: Record<PointAction, PointRule> = {
  signup: { points: 100, per: 'ref', serverOnly: true },
  quest: { points: 30, per: 'best' },
  visit: { points: 10, per: 'day' },
  field: { points: 30, per: 'ref', totalCap: 5 },
  analyze: { points: 40, per: 'ref', totalCap: 5 },
  region: { points: 5, per: 'ref', dailyCap: 10 },
  layer: { points: 10, per: 'ref', totalCap: 30 },
  radio: { points: 15, per: 'day' },
  ask: { points: 5, per: 'ref', dailyCap: 5 },
  glossary: { points: 5, per: 'ref', totalCap: 40 },
  report: { points: 25, per: 'ref', dailyCap: 3 },
  publish: { points: 80, per: 'ref', totalCap: 10, serverOnly: true },
};

/** Estrellas posibles en los 7 retos de inicio (3 por reto). */
export const QUEST_MAX_STARS = 21;
export const STAR_POINTS = 20;

/** Puntos de una acción (en `quest`, según las estrellas). */
export function pointsFor(action: PointAction, value?: number): number {
  const rule = POINT_RULES[action];
  if (action === 'quest') {
    const stars = Math.max(0, Math.min(QUEST_MAX_STARS, Math.round(value ?? 0)));
    return rule.points + stars * STAR_POINTS;
  }
  return rule.points;
}

/** Referencias válidas: cortas y sin espacios (ids de capa, de finca, códigos DANE, "4.50,-75.75"). */
export const REF_RE = /^[A-Za-z0-9_.:,-]{1,64}$/;

/** Fecha del día (UTC) con la que se cuentan los topes diarios. */
export const dayOf = (d: Date = new Date()) => d.toISOString().slice(0, 10);

/** Lo que ya hay guardado para decidir un premio. */
export type AwardState = {
  /** Puntos que ya dio esta misma referencia (null = nunca). */
  existing: number | null;
  /** Veces que la acción contó hoy. */
  today: number;
  /** Veces que la acción contó en total. */
  total: number;
};

/**
 * Decide un premio. Devuelve los puntos que quedan guardados para esa referencia y cuántos se suman al total
 * (`delta`), o null si no suma nada (ya contó, se pasó el tope o no mejoró).
 */
export function evaluateAward(action: PointAction, value: number | undefined, s: AwardState): { points: number; delta: number } | null {
  const rule = POINT_RULES[action];
  const points = pointsFor(action, value);
  if (rule.per === 'best') {
    if (s.existing === null) return { points, delta: points };
    return points > s.existing ? { points, delta: points - s.existing } : null;
  }
  if (s.existing !== null) return null;
  if (rule.dailyCap !== undefined && s.today >= rule.dailyCap) return null;
  if (rule.totalCap !== undefined && s.total >= rule.totalCap) return null;
  return { points, delta: points };
}

/** Referencia que cuenta: las acciones diarias usan la fecha; las demás, la que manda el cliente. */
export const refFor = (action: PointAction, ref: string, day: string) => (POINT_RULES[action].per === 'day' ? day : ref);

// ——— Motor de premios (puro) ———
// Con las filas del libro que ya hay y lo que la persona hizo, decide qué suma. Lo usan el servidor (memoria y
// Postgres) y el cliente para los puntos de quien aún no tiene cuenta: las reglas son las mismas en todos lados.

export type PointRow = { action: PointAction; ref: string; day: string; points: number };
export type AwardItem = { action: PointAction; ref: string; value?: number };
export type Awarded = { action: PointAction; ref: string; points: number };

/** Lo que hay que leer del libro para decidir estos premios (filas de hoy, de estas referencias y de las acciones con tope total). */
export function stateQuery(items: AwardItem[], day: string) {
  const refs = [...new Set(items.map((i) => refFor(i.action, i.ref, day)))];
  const capped = [...new Set(items.map((i) => i.action).filter((a) => POINT_RULES[a].totalCap !== undefined))];
  return { refs, capped };
}

/**
 * Aplica los premios en orden sobre las filas existentes. Devuelve las filas que hay que escribir (nuevas o
 * mejoradas), lo que se sumó y el cambio del total.
 */
export function applyAwards(rows: PointRow[], items: AwardItem[], day: string): { writes: PointRow[]; awarded: Awarded[]; delta: number } {
  const book = rows.map((r) => ({ ...r }));
  const writes = new Map<string, PointRow>();
  const awarded: Awarded[] = [];
  let delta = 0;
  for (const item of items) {
    const ref = refFor(item.action, item.ref, day);
    const same = book.filter((r) => r.action === item.action);
    const existing = same.find((r) => r.ref === ref) ?? null;
    const result = evaluateAward(item.action, item.value, {
      existing: existing?.points ?? null,
      today: same.filter((r) => r.day === day).length,
      total: same.length,
    });
    if (!result) continue;
    const row: PointRow = { action: item.action, ref, day, points: result.points };
    if (existing) Object.assign(existing, row);
    else book.push(row);
    writes.set(`${item.action}|${ref}`, row);
    awarded.push({ action: item.action, ref, points: result.delta });
    delta += result.delta;
  }
  return { writes: [...writes.values()], awarded, delta };
}

// ——— Niveles ———

export const LEVELS = [
  { id: 'semilla', min: 0 },
  { id: 'brote', min: 150 },
  { id: 'raiz', min: 400 },
  { id: 'cosecha', min: 800 },
  { id: 'bosque', min: 1500 },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];
export const LEVEL_IDS = LEVELS.map((l) => l.id) as [LevelId, ...LevelId[]];

export type LevelInfo = {
  id: LevelId;
  /** Posición del nivel (1 a 5). */
  rank: number;
  /** Puntos donde empieza el siguiente nivel (null en el último). */
  next: number | null;
  /** Avance hacia el siguiente nivel (0 a 1; 1 en el último). */
  progress: number;
};

export function levelOf(points: number): LevelInfo {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1]!.min) i++;
  const cur = LEVELS[i]!;
  const nxt = LEVELS[i + 1];
  return {
    id: cur.id,
    rank: i + 1,
    next: nxt ? nxt.min : null,
    progress: nxt ? Math.max(0, Math.min(1, (points - cur.min) / (nxt.min - cur.min))) : 1,
  };
}

// ——— Cuenta ———

/** Usuario: 3 a 20 letras sin tilde, números, punto o guion bajo. No distingue mayúsculas. */
export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;
