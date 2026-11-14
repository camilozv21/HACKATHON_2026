/** Fincas publicadas en la memoria del servidor (sin base de datos): se pierden al reiniciar. */
import type { ListingQuery, ListingsRepo } from './repo';
import { FLAG_LIMIT, type ListingRecord } from './validate';

const g = globalThis as typeof globalThis & { __fieldShiftListings?: Map<string, ListingRecord>; __fieldShiftListingFlags?: Set<string> };
const MAX = 2000;

const store = () => (g.__fieldShiftListings ??= new Map());
const flagsSeen = () => (g.__fieldShiftListingFlags ??= new Set());

export function matches(r: ListingRecord, q: ListingQuery, nowIso: string): boolean {
  if (r.status !== 'active' || r.expiresAt <= nowIso) return false;
  if (q.dept && r.deptCode !== q.dept) return false;
  if (q.mpio && r.mpioCode !== q.mpio) return false;
  if (q.product && !r.products.some((p) => p.product === q.product)) return false;
  if (q.bbox) {
    const [w, s, e, n] = q.bbox;
    if (r.lat < s || r.lat > n || r.lon < w || r.lon > e) return false;
  }
  return true;
}

export const memoryRepo: ListingsRepo = {
  kind: 'memory',
  async create(rec) {
    const s = store();
    s.set(rec.id, rec);
    if (s.size > MAX) s.delete(s.keys().next().value!);
  },
  async get(id) {
    return store().get(id) ?? null;
  },
  async list(q) {
    const nowIso = (q.now ?? new Date()).toISOString();
    const all = [...store().values()].filter((r) => matches(r, q, nowIso)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const offset = q.offset ?? 0;
    return { items: all.slice(offset, offset + (q.limit ?? 100)), total: all.length };
  },
  async update(id, patch) {
    const r = store().get(id);
    if (!r) return null;
    const next = { ...r, ...patch };
    store().set(id, next);
    return next;
  },
  async flag(id, ipHash) {
    const r = store().get(id);
    if (!r) return null;
    const key = `${id}|${ipHash}`;
    if (!flagsSeen().has(key)) {
      flagsSeen().add(key);
      r.flags += 1;
      if (r.flags >= FLAG_LIMIT && r.status === 'active') r.status = 'hidden';
    }
    return { flags: r.flags, hidden: r.status === 'hidden' };
  },
  async countRecentByIp(ipHash, sinceIso) {
    return [...store().values()].filter((r) => r.ipHash === ipHash && r.createdAt >= sinceIso).length;
  },
};
