import { create } from 'zustand';

/**
 * Estado de "Fincas que venden" y de "Publicar mi finca". Liviano (sin zod ni tipos del contrato completo) porque
 * lo importan piezas del shell: la capa, el formulario y la tarjeta se descargan aparte (ListingsRuntime).
 */

/** Publicación hecha desde este teléfono: el token permite pausarla o borrarla (no hay cuentas). */
export type MyListing = { id: string; token: string; fieldId: string | null; farmName: string; expiresAt: string };

/** Lo mínimo de una publicación para el globo (la tarjeta valida el resto con zod). */
export type ListingPoint = {
  id: string;
  lat: number;
  lon: number;
  farmName: string;
  place: string;
  products: { product: string }[];
  sample?: boolean;
};

const MINE_KEY = 'fieldshift:my-listings:v1';

function readMine(): MyListing[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(MINE_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as MyListing[]).filter((x) => x && typeof x.id === 'string' && typeof x.token === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeMine(mine: MyListing[]) {
  try {
    window.localStorage.setItem(MINE_KEY, JSON.stringify(mine));
  } catch {
    /* modo privado: la llave solo dura esta visita */
  }
}

type PublishDraft = { fieldId: string | null; lat: number; lon: number; name: string | null; areaHa: number | null };

type ListingsState = {
  /** Capa "Fincas que venden" visible en el globo. */
  visible: boolean;
  points: ListingPoint[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  nonce: number;
  /** Publicación abierta en la tarjeta. */
  selectedId: string | null;
  /** Formulario de publicación abierto (con los datos de la finca). */
  publish: PublishDraft | null;
  /** Panel "Mi publicación" abierto. */
  manageId: string | null;
  mine: MyListing[];
  setVisible: (v: boolean) => void;
  setPoints: (p: ListingPoint[], status: ListingsState['status']) => void;
  reload: () => void;
  select: (id: string | null) => void;
  openPublish: (d: PublishDraft) => void;
  closePublish: () => void;
  openManage: (id: string | null) => void;
  addMine: (m: MyListing) => void;
  removeMine: (id: string) => void;
};

export const useListingsStore = create<ListingsState>()((set, get) => ({
  visible: false,
  points: [],
  status: 'idle',
  nonce: 0,
  selectedId: null,
  publish: null,
  manageId: null,
  mine: readMine(),
  setVisible: (visible) => set(visible ? { visible } : { visible, selectedId: null }),
  setPoints: (points, status) => set({ points, status }),
  reload: () => set((s) => ({ nonce: s.nonce + 1 })),
  select: (selectedId) => set({ selectedId }),
  openPublish: (publish) => set({ publish, manageId: null }),
  closePublish: () => set({ publish: null }),
  openManage: (manageId) => set({ manageId, publish: null }),
  addMine: (m) => {
    const mine = [m, ...get().mine.filter((x) => x.id !== m.id)].slice(0, 20);
    writeMine(mine);
    set({ mine });
  },
  removeMine: (id) => {
    const mine = get().mine.filter((x) => x.id !== id);
    writeMine(mine);
    set({ mine });
  },
}));

/** La publicación de esta finca hecha desde este teléfono (si la hay). */
export const myListingFor = (mine: MyListing[], fieldId: string | null | undefined) => (fieldId ? (mine.find((m) => m.fieldId === fieldId) ?? null) : null);

/** El runtime de publicaciones hace falta si la capa está visible o hay un formulario o panel abierto. */
export const listingsActive = (s: Pick<ListingsState, 'visible' | 'publish' | 'manageId' | 'selectedId'>) =>
  s.visible || s.publish !== null || s.manageId !== null || s.selectedId !== null;
