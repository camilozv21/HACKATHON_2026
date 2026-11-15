'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import type { z } from 'zod';
import type { SelectedField } from '@/features/field/types';
import { ApiError } from '@/lib/api/client';
import type { CropSeason, FieldSurvey, SoilInfo } from '@/lib/api/contract';
import { MotorStreamEvent, MotorZone, type MotorPlan, type MotorPlanRequest } from '@/lib/api/motor';
import {
  currentMotorCrop,
  historyCycle,
  lastMotorCrop,
  motorResidueOf,
  motorTexture,
  symptomsFor,
  type MotorCrop,
} from '@/lib/motorCatalog';
import { useMotorProgressStore } from './progress';
import type { MotorAnswers } from './store';

/** POST a un route handler propio (`/api/motor/*`) con validación zod de la respuesta. */
async function post<S extends z.ZodType>(path: string, body: unknown, schema: S, signal: AbortSignal, timeoutMs: number): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (err) {
    if (signal.aborted) throw new ApiError('aborted', 'Cancelado');
    if (timeout.aborted) throw new ApiError('timeout', `Sin respuesta en ${timeoutMs / 1000} s`);
    throw new ApiError('network', (err as Error).message);
  }
  if (!res.ok) throw new ApiError('http', `HTTP ${res.status}`, res.status);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError('invalid', 'La respuesta no cumple el contrato', res.status, parsed.error.issues);
  return parsed.data;
}

/**
 * POST a `/api/motor/plan`, que responde NDJSON: etapas mientras trabajan el motor y AgroAstro, y al final el plan
 * revisado (o un error). Solo se acepta un `plan` que cumpla el contrato.
 */
async function postPlan(body: MotorPlanRequest, signal: AbortSignal, onEvent: (e: MotorStreamEvent) => void): Promise<MotorPlan> {
  // El asesor investiga en la web: hasta 5 min (lo mismo que permite la función del servidor).
  const timeout = AbortSignal.timeout(300_000);
  let res: Response;
  try {
    res = await fetch('/api/motor/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (err) {
    if (signal.aborted) throw new ApiError('aborted', 'Cancelado');
    if (timeout.aborted) throw new ApiError('timeout', 'Sin respuesta en 300 s');
    throw new ApiError('network', (err as Error).message);
  }
  if (!res.ok || !res.body) throw new ApiError('http', `HTTP ${res.status}`, res.status);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let json: unknown;
        try {
          json = JSON.parse(line);
        } catch {
          throw new ApiError('invalid', 'Línea del plan que no es JSON');
        }
        const parsed = MotorStreamEvent.safeParse(json);
        if (!parsed.success) throw new ApiError('invalid', 'La respuesta no cumple el contrato', res.status, parsed.error.issues);
        const e = parsed.data;
        if (e.t === 'plan') return e.plan;
        if (e.t === 'error') throw new ApiError('http', e.error, e.status ?? 502);
        onEvent(e);
      }
      if (done) break;
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (signal.aborted) throw new ApiError('aborted', 'Cancelado');
    if (timeout.aborted) throw new ApiError('timeout', 'Sin respuesta en 300 s');
    throw new ApiError('network', (err as Error).message);
  } finally {
    reader.releaseLock();
  }
  throw new ApiError('invalid', 'El plan terminó sin respuesta');
}

const retryUnless4xx = (count: number, err: Error) => count < 1 && !(err instanceof ApiError && err.status && err.status < 500);

/** Paso 1: datos de la zona (rectángulo de los extremos de la finca). */
export function useMotorZone(field: SelectedField) {
  return useQuery({
    queryKey: ['motorZone', field.id],
    queryFn: ({ signal }) => post('/api/motor/zone', { geometry: field.geometry }, MotorZone, signal, 30_000),
    staleTime: 60 * 60_000,
    retry: retryUnless4xx,
  });
}

export type MotorInputs = Omit<MotorPlanRequest, 'fieldId' | 'zone' | 'locale' | 'place'>;

/**
 * Lo que va al motor: primero lo que la persona respondió en el plan; si no, lo que contó en la encuesta y en
 * "Tu rotación actual" (cultivo de este mes y último cultivo), y el suelo de "Faltan datos".
 */
export function useMotorInputs(
  answers: MotorAnswers,
  seasons: readonly CropSeason[],
  survey: FieldSurvey | null,
  soil: SoilInfo | undefined,
): MotorInputs {
  return useMemo(() => {
    const month = new Date().getMonth() + 1;
    const crop: MotorCrop | null = answers.crop !== undefined ? answers.crop : currentMotorCrop(seasons, month);
    const last = answers.last !== undefined ? answers.last : lastMotorCrop(survey, seasons, month);
    const allowed = new Set<string>(symptomsFor(crop).map((s) => s.id));
    return {
      crop,
      stage: crop ? (answers.stage ?? null) : null,
      symptoms: (answers.symptoms ?? []).filter((s) => allowed.has(s)),
      history: last ? [historyCycle(last)] : [],
      residue: answers.residue !== undefined ? answers.residue : motorResidueOf(survey?.residues),
      soil: {
        ph: soil?.ph != null && soil.ph >= 3 && soil.ph <= 9.5 ? soil.ph : null,
        organicMatterPct: soil?.organicMatterPct != null && soil.organicMatterPct <= 15 ? soil.organicMatterPct : null,
        texture: motorTexture(soil?.texture),
      },
    };
  }, [answers, seasons, survey, soil]);
}

/** Paso 2: el plan del motor. Arranca solo cuando llegan los datos de la zona. */
export function useMotorPlan(field: SelectedField, zone: MotorZone | undefined, inputs: MotorInputs) {
  const locale = useLocale() as 'es' | 'en';
  return useQuery({
    // El nombre del lugar no entra en la clave: renombrar la finca no debe pedir otra revisión.
    queryKey: ['motorPlan', field.id, inputs, locale],
    queryFn: async ({ signal }) => {
      const progress = useMotorProgressStore.getState();
      const body: MotorPlanRequest = { fieldId: field.id, zone: zone!, place: field.name, locale, ...inputs };
      let tools = 0;
      progress.set(field.id, { stage: 'motor', tools: 0, lastTool: null });
      try {
        return await postPlan(body, signal, (e) => {
          if (e.t === 'stage') progress.set(field.id, { stage: e.stage, tools, lastTool: null });
          if (e.t === 'activity') progress.set(field.id, { stage: 'advisor', tools: (tools = e.count), lastTool: e.tool });
        });
      } finally {
        progress.set(field.id, null);
      }
    },
    enabled: Boolean(zone),
    staleTime: 30 * 60_000,
    // Con otras respuestas de la misma finca se sigue viendo el plan anterior mientras llega el nuevo.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === field.id ? prev : undefined),
    // Cada intento es una evaluación del motor y una sesión del asesor: sin reintento automático.
    retry: false,
  });
}
