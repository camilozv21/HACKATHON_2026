'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { usePrioritiesStore } from '@/features/priorities/store';
import { apiFetch } from '@/lib/api/client';
import type { AnalysisResponse } from '@/lib/api/contract';
import { OutlookResponse, type OutlookRequest } from '@/lib/api/outlook';
import { useHousehold, useOutlookStore } from './store';

/**
 * Proyección de 10 años de las estrategias del análisis (POST /rotations/outlook). Las prioridades no cambian la
 * proyección (solo el orden), así que no van en la clave; las restricciones (mercados, maquinaria) y lo que contó la
 * familia sí.
 */
export function useOutlook(analysis: AnalysisResponse | undefined) {
  const locale = useLocale() as 'es' | 'en';
  const priorities = usePrioritiesStore((s) => s.priorities);
  const pace = useOutlookStore((s) => s.pace);
  const fieldId = analysis?.field.id ?? '';
  const household = useHousehold(fieldId);
  const strategies = analysis?.strategies.map(
    ({ id, name, isCurrent, durationMonths, seasons, scores, confidence }) => ({
      id,
      name,
      isCurrent,
      durationMonths,
      seasons,
      scores,
      confidence,
    }),
  );

  return useQuery({
    queryKey: ['outlook', fieldId, strategies, priorities.constraints, household, pace, locale],
    queryFn: ({ signal }) => {
      const a = analysis!;
      const body: OutlookRequest = {
        field: a.field,
        priorities,
        locale,
        strategies: strategies!,
        site: {
          annualPrecipMm: a.climate.summary.annualPrecipMm,
          tMeanC: mean(a.climate.months.map((m) => m.tMean.value)),
          elevationM: a.climate.location.elevationM,
          slopePct: a.insights.erosionRisk.slopePct,
          erosionLevel: a.insights.erosionRisk.level,
        },
        household,
        pace,
        horizonYears: 10,
      };
      return apiFetch('/rotations/outlook', { method: 'POST', body, schema: OutlookResponse, signal });
    },
    enabled: Boolean(analysis),
    staleTime: 30 * 60_000,
    // Al cambiar el ritmo o una respuesta de la familia se siguen viendo los datos anteriores (misma finca).
    placeholderData: (prev) => (prev?.fieldId === fieldId ? prev : undefined),
  });
}

function mean(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
