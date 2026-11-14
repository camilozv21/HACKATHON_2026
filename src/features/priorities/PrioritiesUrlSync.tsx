'use client';

import { useQueryStates } from 'nuqs';
import { useEffect, useRef } from 'react';
import { priorityParams, urlOptions } from '@/lib/urlState';
import { decodePriorities, encodePriorities, usePrioritiesStore } from './store';

/**
 * Prioridades ↔ URL (para compartir el enlace con el técnico o la familia).
 *  - Al abrir: si el enlace trae ?pr, gana sobre el último perfil guardado.
 *  - Después: solo escribe cuando la persona ya confirmó un perfil (no ensucia la URL con valores por defecto).
 */
export function PrioritiesUrlSync() {
  const [params, setParams] = useQueryStates(priorityParams, urlOptions);
  const initial = useRef(params);

  useEffect(() => {
    const { pr, eq, mk } = initial.current;
    const fromUrl = decodePriorities(pr, eq, mk);
    const store = usePrioritiesStore.getState();
    if (fromUrl) store.load(fromUrl);
    else if (store.configured) void setParams(encodePriorities(store.priorities));

    return usePrioritiesStore.subscribe((s, prev) => {
      if (!s.configured) return;
      if (s.priorities === prev.priorities && prev.configured) return;
      void setParams(encodePriorities(s.priorities));
    });
  }, [setParams]);

  return null;
}
