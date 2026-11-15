/**
 * Almacén de cuentas, sesiones y puntos: PostgreSQL (`fieldshift.accounts`, `sessions`, `point_events`, migración
 * 003) si hay `DATABASE_URL`; si no, memoria del servidor (desarrollo sin base y e2e). Una escritura que falla en
 * Postgres NUNCA cae a memoria en silencio.
 */
import type { Awarded, AwardItem, PointAction } from '@/lib/points';
import { dbEnabled } from '@/server/db';
import { memoryAccounts } from './memoryRepo';
import { pgAccounts } from './pgRepo';

export type AccountRecord = {
  id: string;
  username: string;
  /** Usuario en minúsculas (único). */
  usernameKey: string;
  passwordHash: string;
  points: number;
  createdAt: string;
};

export interface AccountsRepo {
  readonly kind: 'pg' | 'memory';
  /** false si el usuario ya existe. */
  create(rec: AccountRecord): Promise<boolean>;
  byUsername(usernameKey: string): Promise<AccountRecord | null>;
  createSession(tokenHash: string, accountId: string, expiresAt: string): Promise<void>;
  /** Cuenta de una sesión vigente (null si no existe o venció). */
  sessionAccount(tokenHash: string, nowIso: string): Promise<AccountRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Aplica los premios de una vez (con candado por cuenta) y devuelve lo que sumó y el total nuevo. */
  award(accountId: string, items: AwardItem[], day: string): Promise<{ total: number; awarded: Awarded[] }>;
  /** Puntos por acción (para "Cómo vas"). */
  breakdown(accountId: string): Promise<Partial<Record<PointAction, number>>>;
  /** Total de varias cuentas (para el puntaje de cada finca). */
  pointsByIds(ids: string[]): Promise<Map<string, number>>;
}

export function accountsRepo(): AccountsRepo {
  return dbEnabled() ? pgAccounts : memoryAccounts;
}
