'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { persistQueries, restoreQueries } from './persist';

/**
 * Un único QueryClient para toda la app (caché compartida entre paneles).
 * El proveedor NO envuelve la app entera: cada panel que usa datos remotos se carga con
 * next/dynamic y se envuelve con <QueryProvider>, así TanStack Query no entra en el JS inicial.
 * En el navegador, regiones, análisis y clima ya vistos se restauran de localStorage (./persist.ts).
 */
let client: QueryClient | null = null;

export function getQueryClient() {
  if (client) return client;
  client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
  if (typeof window !== 'undefined') {
    restoreQueries(client);
    persistQueries(client);
  }
  return client;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
