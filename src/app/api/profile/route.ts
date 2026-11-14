import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { enforceAnswers, suggestByRules } from '@/features/onboarding/rules';
import { ProfileRequest, type ProfileSuggestion } from '@/lib/api/contract';
import { claudeAgentEnabled } from '@/server/claudeAgent';
import { suggestProfileWithClaude } from '@/server/claudeProfile';
import { clientIp, createRateLimiter } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const rateLimited = createRateLimiter({ windowMs: 60_000, max: 10 });

/**
 * POST /api/profile — sugerencia de modo (sencillo/completo), voz y primer paso a partir de las preguntas de inicio.
 * Orden: Claude (si hay ANTHROPIC_API_KEY y no AGENT_FORCE_MOCK) → reglas locales. Cabecera X-Profile: claude | rules.
 * La persona ve la sugerencia y la confirma o la cambia; nada se aplica sin su toque.
 */
export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const parsed = ProfileRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  const { answers, locale } = parsed.data;

  let suggestion: ProfileSuggestion | null = null;
  if (claudeAgentEnabled()) {
    try {
      suggestion = enforceAnswers(await suggestProfileWithClaude(parsed.data), answers);
    } catch (err) {
      // Solo el tipo y el estado del error: nunca la clave ni las respuestas de la persona.
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      console.warn('[profile] Claude no respondió, uso las reglas locales', (err as Error).name, status ?? '');
    }
  }
  if (!suggestion) {
    const t = await getTranslations({ locale, namespace: 'onboarding.rules' });
    suggestion = suggestByRules(answers, (k) => t(k as never));
  }
  return NextResponse.json(suggestion, { headers: { 'Cache-Control': 'no-store', 'X-Profile': suggestion.source } });
}
