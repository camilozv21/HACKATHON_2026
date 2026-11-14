'use client';

import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useFinePointer = () => useMediaQuery('(pointer: fine)');
