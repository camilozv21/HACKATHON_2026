/**
 * Cuentas sencillas y puntaje (las usan /api/account, /api/points y las fincas publicadas).
 *
 * - Solo usuario y contraseña: sin correo ni teléfono. La contraseña se guarda con scrypt.
 * - Sesión: token aleatorio en una cookie httpOnly; en la base solo su sha256.
 * - Puntos: el cliente dice qué hizo y el servidor aplica las reglas de `src/lib/points.ts` (puntos fijos, una vez
 *   por referencia, topes). Crear la cuenta y publicar una finca (verificado con su token de edición) los da el
 *   servidor.
 * - El puntaje de una cuenta se ve en cada finca publicada enlazada a ella (sin mostrar el usuario).
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { dayOf, levelOf, PASSWORD_MAX, PASSWORD_MIN, POINT_ACTIONS, POINT_RULES, QUEST_MAX_STARS, REF_RE, USERNAME_RE, type Awarded, type LevelId, type PointAction } from '@/lib/points';
import { claimListing } from '@/server/listings';
import { sha256 } from '@/server/text';
import { burnPasswordTime, hashPassword, verifyPassword } from './password';
import { accountsRepo, type AccountRecord } from './repo';

export const SESSION_COOKIE = 'fs_session';
export const SESSION_DAYS = 180;
const DAY = 86_400_000;

export type PublicAccount = { username: string; points: number; level: LevelId; createdAt: string };

export const toPublicAccount = (a: AccountRecord): PublicAccount => ({
  username: a.username,
  points: a.points,
  level: levelOf(a.points).id,
  createdAt: a.createdAt,
});

const Credentials = z.object({
  username: z.string().trim(),
  password: z.string(),
});

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const newAccountId = () => Array.from(randomBytes(12), (b) => B62[b % 62]).join('');
const newSessionToken = () => randomBytes(32).toString('base64url');

async function openSession(accountId: string, now: Date): Promise<string> {
  const token = newSessionToken();
  await accountsRepo().createSession(sha256(token), accountId, new Date(now.getTime() + SESSION_DAYS * DAY).toISOString());
  return token;
}

export type AuthResult =
  | { ok: true; account: PublicAccount; token: string; awarded: Awarded[] }
  | { ok: false; reason: 'invalid' | 'username' | 'password' | 'taken' | 'credentials' };

export async function signup(body: unknown, now = new Date()): Promise<AuthResult> {
  const parsed = Credentials.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const { username, password } = parsed.data;
  if (!USERNAME_RE.test(username)) return { ok: false, reason: 'username' };
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { ok: false, reason: 'password' };
  const repo = accountsRepo();
  const rec: AccountRecord = {
    id: newAccountId(),
    username,
    usernameKey: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    points: 0,
    createdAt: now.toISOString(),
  };
  if (!(await repo.create(rec))) return { ok: false, reason: 'taken' };
  const { total, awarded } = await repo.award(rec.id, [{ action: 'signup', ref: 'signup' }], dayOf(now));
  const token = await openSession(rec.id, now);
  return { ok: true, account: toPublicAccount({ ...rec, points: total }), token, awarded };
}

export async function login(body: unknown, now = new Date()): Promise<AuthResult> {
  const parsed = Credentials.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const { username, password } = parsed.data;
  if (!USERNAME_RE.test(username) || password.length > PASSWORD_MAX) {
    await burnPasswordTime(password.slice(0, PASSWORD_MAX));
    return { ok: false, reason: 'credentials' };
  }
  const rec = await accountsRepo().byUsername(username.toLowerCase());
  if (!rec) {
    await burnPasswordTime(password);
    return { ok: false, reason: 'credentials' };
  }
  if (!(await verifyPassword(password, rec.passwordHash))) return { ok: false, reason: 'credentials' };
  const token = await openSession(rec.id, now);
  return { ok: true, account: toPublicAccount(rec), token, awarded: [] };
}

export async function logout(token: string | null | undefined): Promise<void> {
  if (token) await accountsRepo().deleteSession(sha256(token));
}

/** Cuenta de la cookie de sesión (null si no hay sesión válida). */
export async function accountFromToken(token: string | null | undefined, now = new Date()): Promise<AccountRecord | null> {
  if (!token || token.length > 100) return null;
  return accountsRepo().sessionAccount(sha256(token), now.toISOString());
}

/** Acciones que puede reportar el cliente (crear la cuenta y publicar las decide el servidor). */
const CLIENT_ACTIONS = POINT_ACTIONS.filter((a) => !POINT_RULES[a].serverOnly) as [PointAction, ...PointAction[]];

export const PointsRequest = z.object({
  awards: z
    .array(
      z.object({
        action: z.enum(CLIENT_ACTIONS),
        ref: z.string().regex(REF_RE),
        value: z.number().int().min(0).max(QUEST_MAX_STARS).optional(),
      }),
    )
    .max(80)
    .default([]),
  /** Fincas publicadas desde este teléfono: con su token de edición quedan enlazadas a la cuenta. */
  listings: z
    .array(z.object({ id: z.string().regex(/^[A-Za-z0-9]{10}$/), token: z.string().min(10).max(100) }))
    .max(20)
    .default([]),
});
export type PointsRequest = z.input<typeof PointsRequest>;

/** Aplica lo que hizo la persona (y enlaza sus fincas publicadas). Devuelve lo que sumó y el total nuevo. */
export async function awardPoints(account: AccountRecord, req: z.output<typeof PointsRequest>, now = new Date()) {
  const items: { action: PointAction; ref: string; value?: number }[] = [...req.awards];
  for (const l of req.listings) {
    if (await claimListing(l.id, l.token, account.id)) items.push({ action: 'publish', ref: l.id });
  }
  return accountsRepo().award(account.id, items, dayOf(now));
}

export async function accountDetails(account: AccountRecord) {
  return { account: toPublicAccount(account), breakdown: await accountsRepo().breakdown(account.id) };
}
