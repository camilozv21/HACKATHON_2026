'use client';

import { useEffect } from 'react';
import { readPermission, requestPrecisePosition } from './precise';
import { useLocationStore } from './store';

/**
 * Detecta dónde está la persona al abrir la app:
 *  1. IP (servidor, /api/locate) — inmediato y sin permisos.
 *  2. Navegador — solo si el permiso ya está concedido; si es "prompt" se ofrece un chip.
 * Después de la intro vuela a la zona: zoom ~5 por IP, ~12 si es precisa.
 * Un enlace compartido con lat/lon en la URL tiene prioridad: no se vuela a la persona.
 */
export function LocationBootstrap() {
  // 1) IP + permiso, en paralelo con la carga del globo.
  useEffect(() => {
    const ctrl = new AbortController();
    const store = useLocationStore.getState();

    // El esquema (zod) se carga en paralelo como chunk aparte para no engordar el JS inicial.
    Promise.all([
      fetch('/api/locate', { signal: ctrl.signal, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      import('./schema'),
    ])
      .then(([json, { CoarseLocationSchema }]) => {
        const parsed = CoarseLocationSchema.safeParse(json);
        if (parsed.success) useLocationStore.getState().setCoarse(parsed.data);
      })
      .catch(() => undefined);

    readPermission().then((permission) => {
      store.setPermission(permission);
      if (permission === 'granted') requestPrecisePosition('auto').catch(() => undefined);
    });

    return () => ctrl.abort();
  }, []);

  return null;
}
