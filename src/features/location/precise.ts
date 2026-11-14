import { useLocationStore, type PermissionStatus } from './store';

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 10 * 60_000 };

export async function readPermission(): Promise<PermissionStatus> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unsupported';
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (!status) return 'prompt';
    // Mantener el store al día si la persona cambia el permiso desde el navegador.
    status.onchange = () => useLocationStore.getState().setPermission(status.state as PermissionStatus);
    return status.state as PermissionStatus;
  } catch {
    // Safari antiguo no soporta permissions.query para geolocalización.
    return 'prompt';
  }
}

export class GeoError extends Error {
  constructor(public code: 'denied' | 'unavailable' | 'timeout' | 'unsupported') {
    super(code);
  }
}

/** Pide la posición precisa. Solo debe llamarse tras un gesto de la persona (o si ya hay permiso). */
export function requestPrecisePosition(origin: 'auto' | 'user' = 'user'): Promise<{ lat: number; lon: number; accuracyM: number }> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.reject(new GeoError('unsupported'));
  }
  useLocationStore.getState().setStatus('locating');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy };
        const store = useLocationStore.getState();
        store.setPrecise({ ...p, accuracy: 'precise', at: Date.now(), origin });
        store.setPermission('granted');
        resolve(p);
      },
      (err) => {
        const code = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
        const store = useLocationStore.getState();
        if (code === 'denied') store.setPermission('denied');
        store.setStatus('error');
        reject(new GeoError(code));
      },
      GEO_OPTIONS,
    );
  });
}
