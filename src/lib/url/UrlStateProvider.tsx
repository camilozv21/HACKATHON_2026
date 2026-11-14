'use client';

import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense, type ReactNode } from 'react';

/**
 * Adaptador de nuqs + Suspense (useSearchParams en página estática).
 * Va dentro de cada chunk diferido que lee/escribe la URL, no en el layout: así nuqs (~7.5 KB gz)
 * no entra en el JS inicial. Varias instancias comparten la misma cola de actualizaciones de nuqs.
 */
export function UrlStateProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <NuqsAdapter>{children}</NuqsAdapter>
    </Suspense>
  );
}
