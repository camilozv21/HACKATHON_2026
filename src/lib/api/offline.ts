import type { AnalysisResponse } from './contract';

/**
 * Último análisis guardado en el teléfono (localStorage) para verlo sin conexión.
 * Solo se guarda el último (no los tiles del mapa ni otras fincas) y siempre con try/catch.
 */
const KEY = 'fieldshift:lastAnalysis:v1';

type Saved = { fieldId: string; savedAt: string; data: AnalysisResponse };

export function saveLastAnalysis(fieldId: string, data: AnalysisResponse) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ fieldId, savedAt: new Date().toISOString(), data } satisfies Saved));
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

export function readLastAnalysis(fieldId?: string): Saved | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (fieldId && saved.fieldId !== fieldId) return null;
    return saved;
  } catch {
    return null;
  }
}

/** ¿El error es por falta de red? (sin conexión o la petición ni siquiera salió). */
export function isNetworkError(e: unknown) {
  return (typeof navigator !== 'undefined' && !navigator.onLine) || e instanceof TypeError;
}
