/**
 * Migraciones SQL de Field Shift. Viven en código (no en archivos .sql) para que viajen en el bundle del servidor.
 * Todo va en el schema `fieldshift`, con nombres calificados: no choca con las tablas del backend del equipo.
 * Reglas: solo se añaden migraciones nuevas al final; nunca se edita una ya aplicada.
 * Sin imports con `@/`: también la usa `scripts/db-migrate.ts` desde Node.
 */
export type Migration = { id: string; sql: string };

export const SCHEMA = 'fieldshift';

export const MIGRATIONS: Migration[] = [
  {
    id: '001_market',
    sql: `
      create table if not exists fieldshift.market_kv (
        kind text not null,
        key text not null,
        payload jsonb not null,
        as_of date,
        updated_at timestamptz not null default now(),
        primary key (kind, key)
      );
      create table if not exists fieldshift.market_runs (
        id bigserial primary key,
        source text not null,
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        ok boolean,
        rows integer,
        error text
      );
      create index if not exists market_runs_source_idx on fieldshift.market_runs (source, started_at desc);
    `,
  },
  {
    id: '002_listings',
    sql: `
      create table if not exists fieldshift.listings (
        id text primary key,
        status text not null default 'active' check (status in ('active', 'paused', 'removed', 'hidden')),
        token_hash text not null,
        farm_name text not null,
        description text,
        whatsapp text not null,
        consent_at timestamptz not null,
        lat real not null,
        lon real not null,
        dept_code char(2) not null,
        mpio_code char(5) not null,
        place text not null,
        area_ha real,
        products jsonb not null,
        certifications text[] not null default '{}',
        ip_hash text,
        flags integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        expires_at timestamptz not null
      );
      create index if not exists listings_status_dept_idx on fieldshift.listings (status, dept_code);
      create index if not exists listings_mpio_idx on fieldshift.listings (mpio_code);
      create table if not exists fieldshift.listing_flags (
        listing_id text not null references fieldshift.listings (id) on delete cascade,
        ip_hash text not null,
        created_at timestamptz not null default now(),
        primary key (listing_id, ip_hash)
      );
    `,
  },
  {
    // Cuentas sencillas (usuario y contraseña), sesiones y puntaje. `points` es el total ya sumado del libro
    // `point_events` (se actualiza en la misma transacción). Las fincas publicadas se enlazan a una cuenta.
    id: '003_accounts_points',
    sql: `
      create table if not exists fieldshift.accounts (
        id text primary key,
        username text not null,
        username_key text not null unique,
        password_hash text not null,
        points integer not null default 0,
        created_at timestamptz not null default now(),
        last_seen_at timestamptz
      );
      create table if not exists fieldshift.sessions (
        token_hash text primary key,
        account_id text not null references fieldshift.accounts (id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      );
      create index if not exists sessions_account_idx on fieldshift.sessions (account_id);
      create table if not exists fieldshift.point_events (
        account_id text not null references fieldshift.accounts (id) on delete cascade,
        action text not null,
        ref text not null,
        day date not null,
        points integer not null,
        created_at timestamptz not null default now(),
        primary key (account_id, action, ref)
      );
      create index if not exists point_events_day_idx on fieldshift.point_events (account_id, action, day);
      alter table fieldshift.listings
        add column if not exists account_id text references fieldshift.accounts (id) on delete set null;
      create index if not exists listings_account_idx on fieldshift.listings (account_id);
    `,
  },
];

/** SQL que crea el schema y la tabla de control. Idempotente. */
export const BOOTSTRAP_SQL = `
  create schema if not exists fieldshift;
  create table if not exists fieldshift.schema_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  );
`;

/** Número fijo para pg_advisory_xact_lock: dos procesos no migran a la vez. */
export const MIGRATION_LOCK = 7_314_002_026;
