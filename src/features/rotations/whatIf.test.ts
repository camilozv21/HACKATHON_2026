import { describe, expect, it } from 'vitest';
import type { RotationStrategy } from '@/lib/api/contract';
import { applyScenario, coverFraction, NEUTRAL } from './whatIf';

const base = (id: string, water: number, monthlyCovered = 6): RotationStrategy => ({
  id,
  name: id,
  isCurrent: false,
  durationMonths: 12,
  seasons: [{ crop: 'maize', startMonth: 5, endMonth: 10, year: 1, role: 'cash' }],
  scores: { water, soilOrganicMatter: 50, nitrogen: 50, erosion: 60, pestBreak: 50, income: 70, forage: 20 },
  rationale: '',
  evidence: [],
  benefits: [],
  risks: [],
  dataGaps: [],
  needsLocalReview: [],
  confidence: 'medium',
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, waterUseMm: 50, soilCovered: i < monthlyCovered })),
});

describe('escenarios ¿y si…?', () => {
  it('el escenario neutro no cambia nada (misma referencia)', () => {
    const s = base('a', 50);
    expect(applyScenario(s, NEUTRAL)).toBe(s);
  });

  it('menos lluvia y más calor castigan más a la opción que pide más agua', () => {
    const thirsty = base('thirsty', 40);
    const saver = base('saver', 80);
    const sc = { rainPct: -30, tempC: 2 };
    const t = applyScenario(thirsty, sc);
    const s = applyScenario(saver, sc);
    expect(40 - t.scores.water).toBeGreaterThan(80 - s.scores.water);
    expect(t.scores.income).toBeLessThan(70);
    expect(s.scores.water - t.scores.water).toBeGreaterThan(40);
  });

  it('más lluvia sube el puntaje de agua pero aumenta la erosión con suelo desnudo', () => {
    const bare = applyScenario(base('bare', 50, 4), { rainPct: 30, tempC: 0 });
    const covered = applyScenario(base('covered', 50, 12), { rainPct: 30, tempC: 0 });
    expect(bare.scores.water).toBeGreaterThan(50);
    expect(bare.scores.erosion).toBeLessThan(60);
    expect(covered.scores.erosion).toBe(60);
  });

  it('el calor sube el uso de agua mensual ~4 % por °C y todo queda entre 0 y 100', () => {
    const s = applyScenario(base('a', 5), { rainPct: -30, tempC: 3 });
    expect(s.monthly![0]!.waterUseMm).toBe(56);
    expect(s.scores.water).toBe(0);
  });

  it('cobertura: usa el perfil mensual si existe', () => {
    expect(coverFraction(base('a', 50, 9))).toBe(0.75);
  });
});
