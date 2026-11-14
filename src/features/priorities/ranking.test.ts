import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIORITIES, type CropSeason, type FarmerPriorities, type RotationStrategy } from '@/lib/api/contract';
import { laborScore, levelOf, priorityScores, rankStrategies, scoreStrategy, sowingsPerYear } from './ranking';

const season = (crop: CropSeason['crop'], role: CropSeason['role'] = 'cash'): CropSeason => ({
  crop,
  startMonth: 4,
  endMonth: 9,
  year: 1,
  role,
});

type S = Pick<RotationStrategy, 'id' | 'scores' | 'seasons' | 'durationMonths'>;
const strat = (id: string, scores: Partial<RotationStrategy['scores']>, seasons = [season('maize')], durationMonths: 12 | 24 | 36 = 12): S => ({
  id,
  durationMonths,
  seasons,
  scores: { water: 50, soilOrganicMatter: 50, nitrogen: 50, erosion: 50, pestBreak: 50, income: 50, forage: 50, ...scores },
});

const P = (w: Partial<Omit<FarmerPriorities, 'constraints'>>): FarmerPriorities => ({
  waterSaving: 1,
  soilHealth: 1,
  income: 1,
  forage: 1,
  erosionControl: 1,
  laborEquipment: 1,
  constraints: DEFAULT_PRIORITIES.constraints,
  ...w,
});

describe('ranking de estrategias', () => {
  it('convierte pesos en niveles mucho/algo/poco', () => {
    expect([5, 4, 3, 2, 1, 0].map(levelOf)).toEqual(['high', 'high', 'mid', 'mid', 'low', 'low']);
  });

  it('cuenta siembras por año (perenne = media, descanso = cero)', () => {
    expect(sowingsPerYear([season('maize'), season('soybean')], 24)).toBe(1);
    expect(sowingsPerYear([season('rice'), season('wheat'), season('mungbean')], 12)).toBe(3);
    expect(sowingsPerYear([season('coffee', 'perennial')], 12)).toBe(0.5);
    expect(sowingsPerYear([season('fallow', 'fallow'), season('millet')], 12)).toBe(1);
    expect(laborScore([season('coffee', 'perennial')], 12)).toBe(100);
    expect(laborScore([season('rice'), season('wheat'), season('mungbean')], 12)).toBe(50);
  });

  it('mejorar el suelo promedia materia orgánica, nitrógeno y corte de plagas', () => {
    expect(priorityScores(strat('a', { soilOrganicMatter: 90, nitrogen: 60, pestBreak: 30 })).soilHealth).toBe(60);
  });

  it('con pesos iguales el total es el promedio simple', () => {
    const s = strat('a', { water: 100, income: 40 });
    const ps = priorityScores(s);
    const mean = Object.values(ps).reduce((a, b) => a + b, 0) / 6;
    expect(scoreStrategy(s, P({})).total).toBe(Math.round(mean));
  });

  it('si todos los pesos son 0, pesan igual (no divide entre 0)', () => {
    const zero = P({ waterSaving: 0, soilHealth: 0, income: 0, forage: 0, erosionControl: 0, laborEquipment: 0 });
    expect(scoreStrategy(strat('a', {}), zero).total).toBe(scoreStrategy(strat('a', {}), P({})).total);
  });

  it('los aportes suman el total', () => {
    const { total, parts } = scoreStrategy(strat('a', { water: 80, income: 20 }), P({ waterSaving: 5, income: 3 }));
    expect(Math.round(parts.reduce((a, p) => a + p.points, 0))).toBe(total);
  });

  it('el orden cambia al cambiar prioridades', () => {
    const saver = strat('saver', { water: 90, income: 30 });
    const earner = strat('earner', { water: 30, income: 90 });
    const water = rankStrategies([earner, saver], P({ waterSaving: 5, income: 1 }));
    const money = rankStrategies([earner, saver], P({ waterSaving: 1, income: 5 }));
    expect(water.map((r) => r.strategy.id)).toEqual(['saver', 'earner']);
    expect(money.map((r) => r.strategy.id)).toEqual(['earner', 'saver']);
    expect(water[0]!.rank).toBe(1);
  });

  it('en empate respeta el orden original', () => {
    const r = rankStrategies([strat('x', {}), strat('y', {})], P({}));
    expect(r.map((x) => x.strategy.id)).toEqual(['x', 'y']);
  });
});
