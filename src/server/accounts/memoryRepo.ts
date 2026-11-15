/** Cuentas, sesiones y puntos en la memoria del servidor (sin base de datos): se pierden al reiniciar. */
import { applyAwards, type PointRow } from '@/lib/points';
import type { AccountRecord, AccountsRepo } from './repo';

type Mem = {
  accounts: Map<string, AccountRecord>;
  byKey: Map<string, string>;
  sessions: Map<string, { accountId: string; expiresAt: string }>;
  book: Map<string, PointRow[]>;
};

const g = globalThis as typeof globalThis & { __fieldShiftAccounts?: Mem };
const mem = (): Mem => (g.__fieldShiftAccounts ??= { accounts: new Map(), byKey: new Map(), sessions: new Map(), book: new Map() });
const MAX_ACCOUNTS = 5000;

export const memoryAccounts: AccountsRepo = {
  kind: 'memory',
  async create(rec) {
    const m = mem();
    if (m.byKey.has(rec.usernameKey) || m.accounts.size >= MAX_ACCOUNTS) return false;
    m.accounts.set(rec.id, { ...rec });
    m.byKey.set(rec.usernameKey, rec.id);
    return true;
  },
  async byUsername(key) {
    const m = mem();
    const id = m.byKey.get(key);
    return id ? { ...m.accounts.get(id)! } : null;
  },
  async createSession(tokenHash, accountId, expiresAt) {
    mem().sessions.set(tokenHash, { accountId, expiresAt });
  },
  async sessionAccount(tokenHash, nowIso) {
    const m = mem();
    const s = m.sessions.get(tokenHash);
    if (!s || s.expiresAt <= nowIso) return null;
    const a = m.accounts.get(s.accountId);
    return a ? { ...a } : null;
  },
  async deleteSession(tokenHash) {
    mem().sessions.delete(tokenHash);
  },
  async award(accountId, items, day) {
    const m = mem();
    const acc = m.accounts.get(accountId);
    if (!acc) return { total: 0, awarded: [] };
    const rows = m.book.get(accountId) ?? [];
    const { writes, awarded, delta } = applyAwards(rows, items, day);
    for (const w of writes) {
      const i = rows.findIndex((r) => r.action === w.action && r.ref === w.ref);
      if (i >= 0) rows[i] = w;
      else rows.push(w);
    }
    m.book.set(accountId, rows);
    acc.points += delta;
    return { total: acc.points, awarded };
  },
  async breakdown(accountId) {
    const out: Record<string, number> = {};
    for (const r of mem().book.get(accountId) ?? []) out[r.action] = (out[r.action] ?? 0) + r.points;
    return out;
  },
  async pointsByIds(ids) {
    const m = mem();
    const out = new Map<string, number>();
    for (const id of ids) {
      const a = m.accounts.get(id);
      if (a) out.set(id, a.points);
    }
    return out;
  },
};
