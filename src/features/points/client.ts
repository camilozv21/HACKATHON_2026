/**
 * Puntaje en el cliente: `award()` cuenta lo que hace la persona.
 * - Con cuenta: se agrupa (1 s) y se manda a `/api/points`, que decide con las reglas del servidor.
 * - Sin cuenta: se aplica aquí con las mismas reglas y queda pendiente en el teléfono hasta crear la cuenta o entrar.
 * Al entrar también se envían las fincas publicadas desde este teléfono (con su token) para enlazarlas a la cuenta.
 */
import { useListingsStore } from '@/features/listings/store';
import { applyAwards, levelOf, POINT_RULES, type Awarded, type AwardItem, type LevelId, type PointAction } from '@/lib/points';
import { today, usePointsStore, type AccountInfo, type PendingRow } from './store';

const MAX_BATCH = 80;
let queue: AwardItem[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
/** En el próximo envío van también las fincas publicadas desde este teléfono. */
let claimListings = false;
let inFlight: Promise<void> | null = null;

const cleanRef = (ref: string) => ref.replace(/[^A-Za-z0-9_.:,-]/g, '').slice(0, 64) || 'x';

/** Suma los puntos de una acción (si las reglas lo permiten). */
export function award(action: PointAction, ref: string, value?: number) {
  const item: AwardItem = { action, ref: cleanRef(ref), ...(value !== undefined ? { value } : {}) };
  const s = usePointsStore.getState();
  if (s.account) {
    // Publicar lo verifica el servidor con el token de la publicación (va en `listings`).
    if (action === 'publish') claimListings = true;
    else if (!POINT_RULES[action].serverOnly) queue.push(item);
    schedule();
    return;
  }
  addPending(item);
}

function addPending(item: AwardItem) {
  const s = usePointsStore.getState();
  const { writes, awarded } = applyAwards(s.pending, [item], today());
  if (!awarded.length) return;
  const rows: PendingRow[] = [...s.pending];
  for (const w of writes) {
    const row: PendingRow = item.value !== undefined ? { ...w, value: item.value } : w;
    const i = rows.findIndex((r) => r.action === w.action && r.ref === w.ref);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
  }
  s.setPending(rows);
  s.showFlash({ points: awarded[0]!.points, action: item.action, saved: false });
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, 1000);
}

/** Manda lo acumulado (y los puntos pendientes de antes de entrar) a la cuenta. */
export function flush(): Promise<void> {
  inFlight ??= send().finally(() => {
    inFlight = null;
    if (queue.length) schedule();
  });
  return inFlight;
}

async function send() {
  const s = usePointsStore.getState();
  if (!s.account) return;
  const items = queue.splice(0, MAX_BATCH);
  const pending = s.pending
    .filter((r) => !POINT_RULES[r.action].serverOnly)
    .map((r): AwardItem => ({ action: r.action, ref: r.ref, ...(r.value !== undefined ? { value: r.value } : {}) }));
  const awards = [...pending, ...items].slice(0, MAX_BATCH);
  const listings = claimListings ? useListingsStore.getState().mine.map((m) => ({ id: m.id, token: m.token })) : [];
  if (!awards.length && !listings.length) return;
  try {
    const res = await fetch('/api/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ awards, listings }),
    });
    if (res.status === 401) {
      // La sesión venció: lo hecho queda pendiente en el teléfono hasta volver a entrar.
      s.setAccount(null);
      items.forEach(addPending);
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { total: number; level: LevelId; awarded: Awarded[] };
    claimListings = false;
    const now = usePointsStore.getState();
    if (pending.length) now.setPending([]);
    if (now.account) now.setAccount({ ...now.account, points: data.total, level: data.level });
    const gained = data.awarded.reduce((sum, a) => sum + a.points, 0);
    if (gained > 0) {
      const single = data.awarded.length === 1 || items.length === 1;
      now.showFlash({ points: gained, action: single ? data.awarded.at(-1)!.action : null, saved: true });
    }
  } catch {
    // Sin conexión o error: se reintenta con el próximo premio.
    queue = [...items, ...queue].slice(0, MAX_BATCH);
  }
}

type AuthReason = 'username' | 'password' | 'taken' | 'credentials' | 'rate' | 'invalid' | 'storage' | 'network';
export type AuthOutcome = { ok: true } | { ok: false; reason: AuthReason };

/** Crea la cuenta (`signup`) o entra (`login`). Al lograrlo, guarda los puntos pendientes y enlaza las fincas. */
export async function authenticate(mode: 'signup' | 'login', username: string, password: string): Promise<AuthOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/account/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  const data = (await res.json().catch(() => ({}))) as { account?: AccountInfo; awarded?: Awarded[]; error?: AuthReason };
  if (!res.ok || !data.account) return { ok: false, reason: data.error ?? 'storage' };
  const s = usePointsStore.getState();
  s.setAccount({ username: data.account.username, points: data.account.points, level: levelOf(data.account.points).id });
  const welcome = (data.awarded ?? []).reduce((sum, a) => sum + a.points, 0);
  if (welcome > 0) s.showFlash({ points: welcome, action: 'signup', saved: true });
  claimListings = true;
  await flush();
  return { ok: true };
}

export async function logout() {
  await fetch('/api/account/logout', { method: 'POST' }).catch(() => null);
  queue = [];
  usePointsStore.getState().setAccount(null);
}

export type AccountDetails = { account: AccountInfo & { createdAt: string }; breakdown: Partial<Record<PointAction, number>> };

/** Pide la cuenta de la sesión (y su puntaje por acción). null si no hay sesión. */
export async function refreshAccount(): Promise<AccountDetails | null> {
  try {
    const res = await fetch('/api/account', { cache: 'no-store' });
    if (res.status === 401) {
      usePointsStore.getState().setAccount(null);
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as AccountDetails;
    usePointsStore.getState().setAccount({ username: data.account.username, points: data.account.points, level: data.account.level });
    return data;
  } catch {
    return null;
  }
}
