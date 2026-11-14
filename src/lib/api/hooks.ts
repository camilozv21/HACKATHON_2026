'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { apiFetch } from './client';
import { AnalysisResponse, RegionSummary, type FarmerPriorities, type FieldInput } from './contract';
import { isNetworkError, readLastAnalysis, saveLastAnalysis } from './offline';
import { fetchPowerClimate, fetchPowerDaily, powerCacheKey } from './power';

/**
 * Análisis completo de la finca (backend o mock). Las prioridades NO forman parte de la clave:
 * el orden de estrategias se recalcula en el cliente (Fase 8). Las restricciones sí, porque cambian
 * qué estrategias son viables.
 */
export function useAnalysis(field: FieldInput | null, priorities: FarmerPriorities, opts: { enabled?: boolean } = {}) {
  const locale = useLocale() as 'es' | 'en';
  return useQuery({
    queryKey: ['analysis', field?.id, field?.currentRotation, field?.soil, field?.survey, priorities.constraints, locale],
    queryFn: async ({ signal }) => {
      try {
        const data = await apiFetch('/analysis', {
          method: 'POST',
          body: { field, priorities, locale },
          schema: AnalysisResponse,
          signal,
        });
        if (field) saveLastAnalysis(field.id, data);
        return data;
      } catch (e) {
        // Sin conexión: el último análisis guardado de esta finca (la UI avisa que es el guardado).
        const saved = field && isNetworkError(e) ? readLastAnalysis(field.id) : null;
        if (saved) return saved.data;
        throw e;
      }
    },
    enabled: Boolean(field) && (opts.enabled ?? true),
    staleTime: 30 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Clima real de NASA POWER para un punto (cacheado por celda de 0.1°, sin backend). */
export function useClimate(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery({
    queryKey: powerCacheKey(lat ?? 0, lon ?? 0),
    queryFn: ({ signal }) => fetchPowerClimate(lat!, lon!, signal),
    enabled: lat != null && lon != null,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}

/** Resumen de sensores NASA para una región (drawer). */
/** `when`: máquina del tiempo (2026-05 o 2026-05-14); sin él, los datos más recientes. */
/** `admin`: departamento o municipio de Colombia que se eligió (`co:05` o `co:05001`, código DIVIPOLA). */
export function useRegionSummary(
  q: { lat: number; lon: number; demoId?: string; name?: string | null; when?: string; admin?: string } | null,
) {
  const locale = useLocale() as 'es' | 'en';
  const queryKey = [
    'region',
    q?.demoId ?? null,
    q ? q.lat.toFixed(2) : null,
    q ? q.lon.toFixed(2) : null,
    q?.admin ?? null,
    q?.when ?? null,
    locale,
  ] as const;
  return useQuery<RegionSummary>({
    queryKey,
    // Mismo lugar, otro periodo (o idioma): se siguen viendo los datos anteriores mientras llegan los nuevos,
    // sin volver al esqueleto. Con otro lugar no: serían datos de otra región.
    placeholderData: (prev, prevQuery) => {
      const k = prevQuery?.queryKey;
      return k && k[1] === queryKey[1] && k[2] === queryKey[2] && k[3] === queryKey[3] && k[4] === queryKey[4]
        ? prev
        : undefined;
    },
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ lat: String(q!.lat), lon: String(q!.lon), locale });
      if (q!.demoId) params.set('demo', q!.demoId);
      if (q!.name) params.set('name', q!.name);
      if (q!.when) params.set('t', q!.when);
      if (q!.admin) params.set('admin', q!.admin);
      return apiFetch(`/region?${params}`, { schema: RegionSummary, signal });
    },
    enabled: Boolean(q),
    staleTime: 15 * 60_000,
  });
}

/** Datos diarios de NASA POWER para un periodo pasado (máquina del tiempo). El pasado no cambia: cache larga. */
export function usePowerDaily(lat: number | null | undefined, lon: number | null | undefined, start: string | null, end: string | null) {
  return useQuery({
    queryKey: ['powerDaily', ...powerCacheKey(lat ?? 0, lon ?? 0), start, end],
    queryFn: ({ signal }) => fetchPowerDaily(lat!, lon!, start!, end!, signal),
    enabled: lat != null && lon != null && Boolean(start && end),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}
