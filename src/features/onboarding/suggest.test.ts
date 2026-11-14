import { describe, expect, it, vi } from 'vitest';
import type { OnboardingAnswers, ProfileSuggestion } from '@/lib/api/contract';
import { requestSuggestion } from './suggest';

const t = (k: string) => `t:${k}`;
const answers: OnboardingAnswers = { role: 'farmer', goal: 'climate', reading: 'listen' };
const fromClaude: ProfileSuggestion = {
  role: 'technician',
  mode: 'full',
  narrator: false,
  welcome: 'Hola desde la IA.',
  reasons: ['Porque sí.'],
  suggestions: ['¿Cómo está la lluvia?'],
  firstStep: 'layers',
  source: 'claude',
};
const res = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe('sugerencia de perfil en el cliente', () => {
  it('usa la respuesta del servidor, pero el rol y la voz de quien pidió escuchar no cambian', async () => {
    const fetchImpl = vi.fn(async () => res(fromClaude));
    const s = await requestSuggestion(answers, 'es', t, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'POST' }));
    expect(s.source).toBe('claude');
    expect(s.welcome).toBe('Hola desde la IA.');
    expect(s.role).toBe('farmer');
    expect(s.narrator).toBe(true);
    expect(s.mode).toBe('lite');
  });

  it('sin red, con error o fuera de contrato: reglas locales', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const bad = vi.fn(async () => res({ reply: 'no es un perfil' }));
    const http = vi.fn(async () => res({ error: 'rate_limited' }, false));
    for (const f of [offline, bad, http]) {
      const s = await requestSuggestion(answers, 'es', t, f as unknown as typeof fetch);
      expect(s.source).toBe('rules');
      expect(s.welcome).toBe('t:welcome.farmer');
      expect(s.narrator).toBe(true);
    }
  });
});
