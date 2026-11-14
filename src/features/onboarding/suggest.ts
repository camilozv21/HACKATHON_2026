import { ProfileSuggestion, type OnboardingAnswers } from '@/lib/api/contract';
import { enforceAnswers, suggestByRules, type RulesT } from './rules';

/**
 * Pide la sugerencia a /api/profile (Claude o reglas en el servidor). Sin conexión, con error, respuesta fuera de
 * contrato o pasados 9 s, usa las reglas locales: la persona nunca se queda esperando en "Pensando…".
 */
export async function requestSuggestion(
  answers: OnboardingAnswers,
  locale: 'es' | 'en',
  t: RulesT,
  fetchImpl: typeof fetch = fetch,
): Promise<ProfileSuggestion> {
  try {
    const res = await fetchImpl('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, locale }),
      signal: AbortSignal.timeout(9_000),
    });
    if (res.ok) {
      const parsed = ProfileSuggestion.safeParse(await res.json());
      if (parsed.success) return enforceAnswers(parsed.data, answers);
    }
  } catch {
    /* sin conexión o tiempo agotado: reglas locales */
  }
  return suggestByRules(answers, t);
}
