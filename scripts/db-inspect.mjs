// Inspección de SOLO LECTURA de la base PostgreSQL: schemas, tablas y filas aproximadas.
// Sirve para no chocar con tablas del backend del equipo antes de migrar.
// Uso: pnpm db:inspect   (lee DATABASE_URL de .env.local)
import postgres from 'postgres';

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
  const [{ version }] = await sql`select version()`;
  console.log(`Servidor: ${version.split(',')[0]}  (host ${host})`);
  const tables = await sql`
    select n.nspname as schema, c.relname as table, c.reltuples::bigint as approx_rows
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%'
    order by 1, 2`;
  if (!tables.length) console.log('La base no tiene tablas de usuario.');
  for (const t of tables) console.log(`${t.schema}.${t.table}  (~${Math.max(0, Number(t.approx_rows))} filas)`);
  const schemas = await sql`select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by 1`;
  console.log(`Schemas: ${schemas.map((s) => s.nspname).join(', ')}`);
} finally {
  await sql.end({ timeout: 5 });
}
