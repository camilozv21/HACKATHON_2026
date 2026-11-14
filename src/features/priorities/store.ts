import { create } from 'zustand';
import { DEFAULT_PRIORITIES, FarmerPriorities } from '@/lib/api/contract';
import { LEVEL_WEIGHT, PRIORITY_KEYS, type Level, type PriorityKey } from './ranking';

export type Irrigation = FarmerPriorities['constraints']['irrigation'];
export const IRRIGATION: Irrigation[] = ['none', 'limited', 'full'];

/** Maquinaria que se puede marcar (chips). Textos en messages → priorities.equipment.<id>. */
export const EQUIPMENT = ['tractor', 'seed-drill', 'harvester', 'sprayer', 'animal', 'hand-tools'] as const;

/** Mercados sugeridos si todavía no hay análisis (luego se usan los cultivos de la zona). */
export const DEFAULT_MARKETS = ['maize', 'soybean', 'wheat', 'beans', 'vegetables', 'livestock'] as const;

const STORAGE_KEY = 'fieldshift:priorities:v1';
const MAX_MARKETS = 12;

export type WizardStep = 0 | 1 | 2;

type PrioritiesState = {
  priorities: FarmerPriorities;
  /** La persona ya confirmó un perfil (o vino de un enlace o de su último perfil guardado). */
  configured: boolean;
  step: WizardStep;
  setLevel: (key: PriorityKey, level: Level) => void;
  setIrrigation: (v: Irrigation) => void;
  toggleEquipment: (id: string) => void;
  toggleMarket: (id: string) => void;
  /** Mercado escrito a mano. Devuelve false si quedó vacío o ya estaba. */
  addMarket: (text: string) => boolean;
  setStep: (step: WizardStep) => void;
  confirm: () => void;
  /** Perfil que llega por URL (enlace compartido). */
  load: (p: FarmerPriorities) => void;
};

/** Limpia texto libre de mercados: sin comas (separan la lista en la URL), espacios simples, máx. 30 caracteres. */
export function cleanMarket(text: string): string {
  return text.replace(/[,|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function readSaved(): FarmerPriorities | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = FarmerPriorities.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function save(p: FarmerPriorities) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* modo privado o almacenamiento lleno: el perfil sigue en memoria y en la URL */
  }
}

const saved = readSaved();

export const usePrioritiesStore = create<PrioritiesState>()((set, get) => ({
  priorities: saved ?? DEFAULT_PRIORITIES,
  configured: Boolean(saved),
  step: saved ? 2 : 0,
  setLevel: (key, level) => set((s) => ({ priorities: { ...s.priorities, [key]: LEVEL_WEIGHT[level] } })),
  setIrrigation: (irrigation) =>
    set((s) => ({ priorities: { ...s.priorities, constraints: { ...s.priorities.constraints, irrigation } } })),
  toggleEquipment: (id) =>
    set((s) => ({
      priorities: {
        ...s.priorities,
        constraints: { ...s.priorities.constraints, equipment: toggle(s.priorities.constraints.equipment, id) },
      },
    })),
  toggleMarket: (id) =>
    set((s) => ({
      priorities: {
        ...s.priorities,
        constraints: { ...s.priorities.constraints, markets: toggle(s.priorities.constraints.markets, id).slice(0, MAX_MARKETS) },
      },
    })),
  addMarket: (text) => {
    const m = cleanMarket(text);
    const markets = get().priorities.constraints.markets;
    if (!m || markets.some((x) => x.toLowerCase() === m.toLowerCase()) || markets.length >= MAX_MARKETS) return false;
    set((s) => ({
      priorities: { ...s.priorities, constraints: { ...s.priorities.constraints, markets: [...markets, m] } },
    }));
    return true;
  },
  setStep: (step) => set({ step }),
  confirm: () => set({ configured: true, step: 2 }),
  load: (priorities) => set({ priorities, configured: true, step: 2 }),
}));

// Último perfil en localStorage (solo cuando la persona ya lo confirmó).
usePrioritiesStore.subscribe((s, prev) => {
  if (s.configured && (s.priorities !== prev.priorities || !prev.configured)) save(s.priorities);
});

// ---------------------------------------------------------------- URL (compartir enlace)

const IRR_CODE: Record<Irrigation, string> = { none: 'n', limited: 'l', full: 'f' };

/** Pesos + riego en 7 caracteres: "533132n". Maquinaria y mercados van en sus propios parámetros. */
export function encodePriorities(p: FarmerPriorities): { pr: string; eq: string[] | null; mk: string[] | null } {
  const digits = PRIORITY_KEYS.map((k) => String(Math.max(0, Math.min(5, Math.round(p[k]))))).join('');
  return {
    pr: digits + IRR_CODE[p.constraints.irrigation],
    eq: p.constraints.equipment.length ? p.constraints.equipment : null,
    mk: p.constraints.markets.length ? p.constraints.markets : null,
  };
}

export function decodePriorities(pr: string | null, eq: string[] | null, mk: string[] | null): FarmerPriorities | null {
  if (!pr || !/^[0-5]{6}[nlf]$/.test(pr)) return null;
  const irrigation = (Object.entries(IRR_CODE).find(([, c]) => c === pr[6])?.[0] ?? 'none') as Irrigation;
  const weights = Object.fromEntries(PRIORITY_KEYS.map((k, i) => [k, Number(pr[i])])) as Record<PriorityKey, number>;
  const equipment = (eq ?? []).filter((x) => (EQUIPMENT as readonly string[]).includes(x));
  const markets = (mk ?? []).map(cleanMarket).filter(Boolean).slice(0, MAX_MARKETS);
  return { ...weights, constraints: { irrigation, equipment, markets } };
}
