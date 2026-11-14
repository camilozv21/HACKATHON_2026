'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useRef } from 'react';
import { urlOptions } from '@/lib/urlState';
import { isHazardKind } from './kindIds';
import { useEventsStore } from './store';

/** ?ev=1 (eventos visibles) o ?ev=landslide (solo un tipo): un enlace compartido abre el mapa con los eventos. */
export function EventsUrlSync() {
  const [params, setParams] = useQueryStates({ ev: parseAsString }, urlOptions);
  const initial = useRef(params.ev);

  useEffect(() => {
    const v = initial.current;
    if (!v) return;
    useEventsStore.getState().setKind(isHazardKind(v) ? v : null);
    useEventsStore.getState().setVisible(true);
  }, []);

  useEffect(
    () =>
      useEventsStore.subscribe((s, prev) => {
        if (s.visible === prev.visible && s.kind === prev.kind) return;
        void setParams({ ev: s.visible ? (s.kind ?? '1') : null });
      }),
    [setParams],
  );
  return null;
}
