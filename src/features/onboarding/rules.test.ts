import { describe, expect, it } from 'vitest';
import es from '../../../messages/es.json';
import { ProfileSuggestion, type OnboardingAnswers } from '@/lib/api/contract';
import { enforceAnswers, firstStepFor, modeFor, suggestByRules } from './rules';

/** t() de prueba sobre los mensajes reales (onboarding.rules), como hacen getTranslations / useTranslations. */
const t = (key: string) => {
  const v = key.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], es.onboarding.rules);
  if (typeof v !== 'string') throw new Error(`falta el mensaje onboarding.rules.${key}`);
  return v;
};

const ROLES = ['farmer', 'technician'] as const;
const GOALS = ['climate', 'rotations', 'satellite'] as const;
const READING = ['listen', 'little', 'detail'] as const;
const all: OnboardingAnswers[] = ROLES.flatMap((role) => GOALS.flatMap((goal) => READING.map((reading) => ({ role, goal, reading }))));

describe('reglas del perfil de inicio', () => {
  it('escuchar = modo sencillo con voz, para cualquier rol', () => {
    for (const role of ROLES) {
      const s = suggestByRules({ role, goal: 'climate', reading: 'listen' }, t);
      expect(s.mode).toBe('lite');
      expect(s.narrator).toBe(true);
    }
  });

  it('leer poco: sencillo para agricultores, completo para técnicos; detalle: siempre completo', () => {
    expect(modeFor({ role: 'farmer', goal: 'climate', reading: 'little' })).toBe('lite');
    expect(modeFor({ role: 'technician', goal: 'climate', reading: 'little' })).toBe('full');
    expect(modeFor({ role: 'farmer', goal: 'climate', reading: 'detail' })).toBe('full');
    expect(modeFor({ role: 'technician', goal: 'satellite', reading: 'detail' })).toBe('full');
  });

  it('el primer paso sigue lo que quiere hacer hoy', () => {
    expect(firstStepFor({ role: 'farmer', goal: 'climate', reading: 'little' })).toBe('myArea');
    expect(firstStepFor({ role: 'farmer', goal: 'rotations', reading: 'little' })).toBe('myFarm');
    expect(firstStepFor({ role: 'technician', goal: 'satellite', reading: 'detail' })).toBe('layers');
  });

  it('toda combinación da una sugerencia válida del contrato, con textos reales y la voz solo si pidió escuchar', () => {
    for (const a of all) {
      const s = suggestByRules(a, t);
      expect(ProfileSuggestion.safeParse(s).success).toBe(true);
      expect(s.role).toBe(a.role);
      expect(s.source).toBe('rules');
      expect(s.narrator).toBe(a.reading === 'listen');
      expect(s.suggestions).toHaveLength(3);
      expect(s.reasons.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('la IA no cambia el rol ni apaga la voz de quien pidió escuchar', () => {
    const fromAi = { ...suggestByRules({ role: 'technician', goal: 'climate', reading: 'detail' }, t), source: 'claude' as const };
    const fixed = enforceAnswers({ ...fromAi, narrator: false, mode: 'full' }, { role: 'farmer', goal: 'climate', reading: 'listen' });
    expect(fixed.role).toBe('farmer');
    expect(fixed.narrator).toBe(true);
    expect(fixed.mode).toBe('lite');
    expect(fixed.source).toBe('claude');
    // Sin "escuchar", el modo y la voz de la IA se respetan.
    const kept = enforceAnswers({ ...fromAi, mode: 'lite', narrator: false }, { role: 'technician', goal: 'climate', reading: 'detail' });
    expect(kept.mode).toBe('lite');
    expect(kept.narrator).toBe(false);
  });
});
