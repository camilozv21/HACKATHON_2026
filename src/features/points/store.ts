import { create } from 'zustand';
import { dayOf, type LevelId, type PointAction, type PointRow } from '@/lib/points';

/**
 * Estado del puntaje en el teléfono. Lo importan piezas diferidas (TopRight, FirstLayer, la finca): nunca el JS
 * inicial. El total de una cuenta lo decide el servidor; aquí solo se recuerda para pintarlo al abrir.
 *
 * Sin cuenta, los puntos se guardan "pendientes" en este teléfono (mismas reglas que el servidor) y se suman a la
 * cuenta al crearla o entrar.
 */
export type AccountInfo = { username: string; points: number; level: LevelId };
/** Puntos pendientes (sin cuenta): la fila del libro más las estrellas de los retos. */
export type PendingRow = PointRow & { value?: number };
/** Último premio, para el "+N" junto al botón de puntos (`action: null` = varios a la vez, al guardar). */
export type Flash = { seq: number; points: number; action: PointAction | null; saved: boolean };

const ACCOUNT_KEY = 'fieldshift:account:v1';
const PENDING_KEY = 'fieldshift:points:pending:v1';
const MAX_PENDING = 200;

function read<T>(key: string, check: (v: unknown) => T | null): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? check(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado o almacenamiento lleno: vale solo en esta visita */
  }
}

const readAccount = () =>
  read<AccountInfo>(ACCOUNT_KEY, (v) => {
    const a = v as AccountInfo;
    return a && typeof a.username === 'string' && typeof a.points === 'number' ? a : null;
  });

const readPending = () =>
  read<PendingRow[]>(PENDING_KEY, (v) =>
    Array.isArray(v) ? (v as PendingRow[]).filter((r) => r && typeof r.action === 'string' && typeof r.points === 'number').slice(-MAX_PENDING) : null,
  ) ?? [];

type PointsState = {
  account: AccountInfo | null;
  pending: PendingRow[];
  flash: Flash | null;
  dialogOpen: boolean;
  setAccount: (a: AccountInfo | null) => void;
  setPending: (rows: PendingRow[]) => void;
  showFlash: (f: Omit<Flash, 'seq'>) => void;
  setDialogOpen: (v: boolean) => void;
};

let seq = 0;

export const usePointsStore = create<PointsState>()((set) => ({
  account: readAccount(),
  pending: readPending(),
  flash: null,
  dialogOpen: false,
  setAccount: (account) => {
    write(ACCOUNT_KEY, account);
    set({ account });
  },
  setPending: (rows) => {
    const pending = rows.slice(-MAX_PENDING);
    write(PENDING_KEY, pending.length ? pending : null);
    set({ pending });
  },
  showFlash: (f) => set({ flash: { ...f, seq: ++seq } }),
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}));

/** Puntos sin guardar (sin cuenta). */
export const pendingTotal = (rows: PendingRow[]) => rows.reduce((sum, r) => sum + r.points, 0);

/** Puntos que se muestran: los de la cuenta o, sin cuenta, los pendientes. */
export const shownPoints = (s: Pick<PointsState, 'account' | 'pending'>) => (s.account ? s.account.points : pendingTotal(s.pending));

export const today = () => dayOf();
