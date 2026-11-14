'use client';

import { useQueryStates } from 'nuqs';
import { useEffect, useRef } from 'react';
import { listingParams, urlOptions } from '@/lib/urlState';
import { useListingsStore } from './store';

/** ?shop=1 (fincas que venden visibles) y ?listing=<id> (tarjeta abierta): un enlace compartido abre ahí. */
export function ListingsUrlSync() {
  const [params, setParams] = useQueryStates(listingParams, urlOptions);
  const initial = useRef(params);

  useEffect(() => {
    const { shop, listing } = initial.current;
    if (shop || listing) useListingsStore.getState().setVisible(true);
    if (listing) useListingsStore.getState().select(listing);
  }, []);

  useEffect(
    () =>
      useListingsStore.subscribe((s, prev) => {
        if (s.visible === prev.visible && s.selectedId === prev.selectedId) return;
        void setParams({ shop: s.visible ? '1' : null, listing: s.selectedId });
      }),
    [setParams],
  );
  return null;
}
