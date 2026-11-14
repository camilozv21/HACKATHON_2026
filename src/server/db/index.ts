/**
 * Conexión a PostgreSQL (solo servidor). Sin `DATABASE_URL` (o vacía, como en los e2e) la app usa almacenes en
 * memoria y el seed de mercado: `dbEnabled()` lo dice.
 *
 * Un solo pool por proceso (globalThis), pequeño: en serverless cada instancia abre el suyo y Railway limita las
 * conexiones. SSL obligatorio salvo en local o en la red interna de Railway (el proxy usa un certificado propio,
 * así que no se verifica la cadena).
 */
import postgres, { type Sql } from 'postgres';
import { BOOTSTRAP_SQL, MIGRATIONS, MIGRATION_LOCK } from './migrations';

const g = globalThis as typeof globalThis & { __fieldShiftSql?: Sql; __fieldShiftSchema?: Promise<void> };

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function sslFor(url: string): false | 'require' {
  if (process.env.DATABASE_SSL === 'disable') return false;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) return false;
  } catch {
    // URL rara: que decida el driver con SSL.
  }
  return 'require';
}

/** Cliente SQL. Lanza si no hay base configurada: llama antes a `dbEnabled()`. */
export function db(): Sql {
  if (g.__fieldShiftSql) return g.__fieldShiftSql;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL no está configurada');
  g.__fieldShiftSql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX) || 3,
    idle_timeout: 20,
    max_lifetime: 600,
    connect_timeout: 10,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { application_name: 'fieldshift', statement_timeout: 8000 },
  });
  return g.__fieldShiftSql;
}

/** Aplica las migraciones pendientes en una transacción con candado. Devuelve las que aplicó. */
export async function migrate(sql: Sql = db()): Promise<string[]> {
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx.unsafe(BOOTSTRAP_SQL);
    const done = new Set((await tx<{ id: string }[]>`select id from fieldshift.schema_migrations`).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await tx.unsafe(m.sql);
      await tx`insert into fieldshift.schema_migrations (id) values (${m.id})`;
      applied.push(m.id);
    }
  });
  return applied;
}

/** Garantiza el schema una sola vez por proceso (en la primera consulta). */
export function ensureSchema(): Promise<void> {
  g.__fieldShiftSchema ??= migrate()
    .then(() => undefined)
    .catch((e) => {
      g.__fieldShiftSchema = undefined; // se reintenta en la siguiente petición
      throw e;
    });
  return g.__fieldShiftSchema;
}
