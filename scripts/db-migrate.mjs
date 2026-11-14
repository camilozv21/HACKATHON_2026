// Aplica las migraciones pendientes del schema `fieldshift` (src/server/db/migrations.ts). Idempotente.
// Uso: pnpm db:migrate   (lee DATABASE_URL de .env.local)
import postgres from 'postgres';
import { BOOTSTRAP_SQL, MIGRATIONS, MIGRATION_LOCK } from '../src/server/db/migrations.ts';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('Falta DATABASE_URL (ponla en .env.local).');
  process.exit(1);
}
const host = new URL(url).hostname;
const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal');
const sql = postgres(url, {
  max: 1,
  connect_timeout: 10,
  ssl: process.env.DATABASE_SSL === 'disable' || local ? false : 'require',
  onnotice: () => {},
});

try {
  const applied = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx.unsafe(BOOTSTRAP_SQL);
    const done = new Set((await tx`select id from fieldshift.schema_migrations`).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await tx.unsafe(m.sql);
      await tx`insert into fieldshift.schema_migrations (id) values (${m.id})`;
      applied.push(m.id);
    }
  });
  console.log(applied.length ? `Aplicadas: ${applied.join(', ')}` : 'Sin migraciones pendientes.');
} finally {
  await sql.end({ timeout: 5 });
}
