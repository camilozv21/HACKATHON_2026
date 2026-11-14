import { create } from 'zustand';
import type { CoarseLocation, PreciseLocation } from './schema';

export type PermissionStatus = 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported';

type LocationState = {
  coarse: CoarseLocation | null;
  precise: PreciseLocation | null;
  permission: PermissionStatus;
  status: 'idle' | 'locating' | 'ready' | 'error';
  /** ¿Ya volamos a la persona en esta sesión? Evita vuelos repetidos. */
  hasFlownToUser: boolean;
  setCoarse: (c: CoarseLocation) => void;
  setPrecise: (p: PreciseLocation) => void;
  setPermission: (p: PermissionStatus) => void;
  setStatus: (s: LocationState['status']) => void;
  markFlown: () => void;
};

export const useLocationStore = create<LocationState>()((set) => ({
  coarse: null,
  precise: null,
  permission: 'unknown',
  status: 'idle',
  hasFlownToUser: false,
  setCoarse: (coarse) => set({ coarse }),
  setPrecise: (precise) => set({ precise, status: 'ready' }),
  setPermission: (permission) => set({ permission }),
  setStatus: (status) => set({ status }),
  markFlown: () => set({ hasFlownToUser: true }),
}));

export type UserLocation = {
  lat: number;
  lon: number;
  accuracy: 'ip' | 'precise';
  accuracyM?: number;
  city: string | null;
  region: string | null;
  country: string | null;
};

/** La ubicación precisa siempre gana sobre la de IP. */
export function selectUserLocation(s: Pick<LocationState, 'coarse' | 'precise'>): UserLocation | null {
  const base = { city: s.coarse?.city ?? null, region: s.coarse?.region ?? null, country: s.coarse?.country ?? null };
  if (s.precise) {
    return { ...base, lat: s.precise.lat, lon: s.precise.lon, accuracy: 'precise', accuracyM: s.precise.accuracyM };
  }
  if (s.coarse) return { ...base, lat: s.coarse.lat, lon: s.coarse.lon, accuracy: 'ip' };
  return null;
}

export const getUserLocation = () => selectUserLocation(useLocationStore.getState());
