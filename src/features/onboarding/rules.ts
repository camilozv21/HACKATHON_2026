import type { OnboardingAnswers, ProfileSuggestion } from '@/lib/api/contract';

/**
 * Reglas locales para sugerir el modo de la app a partir de las preguntas de inicio. Se usan cuando Claude no
 * está (sin clave, sin conexión, error, tiempo agotado o en los e2e) y para corregir lo que la IA no puede cambiar.
 * Los textos salen de next-intl (`onboarding.rules`): el servidor pasa getTranslations y el cliente useTranslations.
 */
export type RulesT = (key: string) => string;

export function modeFor(a: OnboardingAnswers): ProfileSuggestion['mode'] {
  if (a.reading === 'detail') return 'full';
  if (a.reading === 'listen') return 'lite';
  // "Leer poco": sencillo para agricultores; el técnico necesita fuente, fecha y resolución para su trabajo.
  return a.role === 'technician' ? 'full' : 'lite';
}

export function firstStepFor(a: OnboardingAnswers): ProfileSuggestion['firstStep'] {
  if (a.goal === 'climate') return 'myArea';
  if (a.goal === 'rotations') return 'myFarm';
  return 'layers';
}

export function suggestByRules(a: OnboardingAnswers, t: RulesT): ProfileSuggestion {
  const mode = modeFor(a);
  const narrator = a.reading === 'listen';
  return {
    role: a.role,
    mode,
    narrator,
    welcome: t(`welcome.${a.role}`),
    reasons: [narrator ? t('reason.voice') : null, t(`reason.${mode}`), t(`reason.${a.goal}`)].filter((r): r is string => Boolean(r)),
    suggestions: [t(`suggest.${a.goal}1`), t(`suggest.${a.goal}2`), t('suggest.common')],
    firstStep: firstStepFor(a),
    source: 'rules',
  };
}

/**
 * Lo que la IA no decide: el rol lo dijo la persona y, si pidió escuchar, la voz queda encendida (sin ella no
 * podría usar la app). El modo y el primer paso sí pueden venir de la IA.
 */
export function enforceAnswers(s: ProfileSuggestion, a: OnboardingAnswers): ProfileSuggestion {
  return { ...s, role: a.role, narrator: s.narrator || a.reading === 'listen', mode: a.reading === 'listen' ? 'lite' : s.mode };
}
