'use client';

import type { ReactNode } from 'react';

/**
 * Proveedores globales mínimos para mantener el JS inicial por debajo de ~150 KB gz:
 *  - TanStack Query va dentro de cada panel con datos remotos (src/lib/query/client.tsx).
 *  - nuqs va dentro de cada chunk que usa la URL (src/lib/url/UrlStateProvider.tsx).
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
