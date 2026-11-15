/** Cuentas, sesiones y puntos en PostgreSQL (migración 003). */
import { applyAwards, stateQuery, type PointAction, type PointRow } from '@/lib/points';
import { db, ensureSchema } from '@/server/db';
import type { AccountRecord, AccountsRepo } from './repo';

type Row = {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  points: number;
  created_at: Date | string;
};

const fromRow = (r: Row): AccountRecord => ({
  id: r.id,
  username: r.username,
  usernameKey: r.username_key,
  passwordHash: r.password_hash,
  points: Number(r.points),
  createdAt: new Date(r.created_at).toISOString(),
});

async function sql() {
  await ensureSchema();
  return db();
}

export const pgAccounts: AccountsRepo = {
  kind: 'pg',
  async create(r) {
    const q = await sql();
    const rows = await q`
      insert into fieldshift.accounts (id, username, username_key, password_hash, points, created_at)
      values (${r.id}, ${r.username}, ${r.usernameKey}, ${r.passwordHash}, ${r.points}, ${r.createdAt})
      on conflict (username_key) do nothing
      returning id`;
    return rows.length > 0;
  },
  async byUsername(key) {
    const q = await sql();
    const [row] = await q<Row[]>`select * from fieldshift.accounts where username_key = ${key}`;
    return row ? fromRow(row) : null;
  },
  async createSession(tokenHash, accountId, expiresAt) {
    const q = await sql();
    await q`
      insert into fieldshift.sessions (token_hash, account_id, expires_at)
      values (${tokenHash}, ${accountId}, ${expiresAt})`;
  },
  async sessionAccount(tokenHash, nowIso) {
    const q = await sql();
    const [row] = await q<Row[]>`
      select a.* from fieldshift.sessions s
      join fieldshift.accounts a on a.id = s.account_id
      where s.token_hash = ${tokenHash} and s.expires_at > ${nowIso}`;
    return row ? fromRow(row) : null;
  },
  async deleteSession(tokenHash) {
    const q = await sql();
    await q`delete from fieldshift.sessions where token_hash = ${tokenHash}`;
  },
  async award(accountId, items, day) {
    const q = await sql();
    return q.begin(async (tx) => {
      // Candado de la cuenta: dos peticiones a la vez no se saltan los topes.
      const [acc] = await tx<{ points: number }[]>`select points from fieldshift.accounts where id = ${accountId} for update`;
      if (!acc) return { total: 0, awarded: [] };
      const { refs, capped } = stateQuery(items, day);
      const rows = await tx<PointRow[]>`
        select action, ref, day::text as day, points from fieldshift.point_events
        where account_id = ${accountId}
          and (day = ${day}::date or ref = any(${refs}::text[]) or action = any(${capped}::text[]))`;
      const { writes, awarded, delta } = applyAwards(rows, items, day);
      if (!writes.length) return { total: Number(acc.points), awarded };
      const values = writes.map((w) => ({ account_id: accountId, action: w.action, ref: w.ref, day: w.day, points: w.points }));
      await tx`
        insert into fieldshift.point_events ${tx(values, 'account_id', 'action', 'ref', 'day', 'points')}
        on conflict (account_id, action, ref) do update set points = excluded.points, day = excluded.day`;
      const [next] = await tx<{ points: number }[]>`
        update fieldshift.accounts set points = points + ${delta}, last_seen_at = now()
        where id = ${accountId} returning points`;
      return { total: Number(next?.points ?? acc.points + delta), awarded };
    });
  },
  async breakdown(accountId) {
    const q = await sql();
    const rows = await q<{ action: PointAction; points: number }[]>`
      select action, sum(points)::int as points from fieldshift.point_events
      where account_id = ${accountId} group by action`;
    return Object.fromEntries(rows.map((r) => [r.action, Number(r.points)]));
  },
  async pointsByIds(ids) {
    const out = new Map<string, number>();
    if (!ids.length) return out;
    const q = await sql();
    const rows = await q<{ id: string; points: number }[]>`
      select id, points from fieldshift.accounts where id = any(${ids}::text[])`;
    for (const r of rows) out.set(r.id, Number(r.points));
    return out;
  },
};
