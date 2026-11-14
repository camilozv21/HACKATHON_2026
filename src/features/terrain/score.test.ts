import type { TerrainItem } from '@/lib/api/terrain';
import { combine, confidenceOf, levelOf, ramp, scoreHazard, scoreTerrain, slopeFactor } from './score';

const calm: TerrainItem['i'] = {
  smAnom: 2,
  smWet: 5,
  pAnom: 3,
  pHeavy: 0.5,
  mfi: 60,
  etRatio: 0.9,
  lstHot: 0,
  lstAnom: 0,
  gwTrend: 0.2,
  slope: 3,
  flat: 10,
  ndviTrend: 0.01,
  toBare: 0,
};
const item = (i: Partial<TerrainItem['i']>, p1 = [700, 250, 30, 20]): TerrainItem => ({
  a: 100,
  v: 0.9,
  p0: [700, 250, 30, 20],
  p1,
  i: { ...calm, ...i },
});

describe('score', () => {
  it('ramp sirve para tramos que suben y que bajan, y se recorta en 0–100', () => {
    expect(ramp(-12.5, 0, -25)).toBe(50);
    expect(ramp(-40, 0, -25)).toBe(100);
    expect(ramp(5, 0, -25)).toBe(0);
    expect(ramp(4, 0, 8)).toBe(50);
  });

  it('niveles: bajo < 34 ≤ medio < 67 ≤ alto', () => {
    expect(levelOf(33)).toBe('low');
    expect(levelOf(34)).toBe('medium');
    expect(levelOf(67)).toBe('high');
  });

  it('un municipio tranquilo sale bajo en todo', () => {
    const r = scoreTerrain(item({}), { synthetic: false });
    expect(r.all.level).toBe('low');
    expect(r.confidence).toBe('high');
  });

  it('sequía: suelo seco, poca lluvia y plantas sin agua → alto, con la evidencia ordenada', () => {
    const r = scoreHazard(item({ smAnom: -25, pAnom: -30, etRatio: 0.3, gwTrend: -1 }), 'drought');
    expect(r.level).toBe('high');
    expect(r.evidence[0]!.points).toBe(100);
    expect(r.evidence.map((e) => e.source)).toContain('SMAP');
  });

  it('encharcamiento usa la parte del área con agua al final (p1)', () => {
    const dry = scoreHazard(item({ pHeavy: 4, smWet: 20, flat: 30 }), 'water').score!;
    const wet = scoreHazard(item({ pHeavy: 4, smWet: 20, flat: 30 }, [600, 200, 50, 150]), 'water').score!;
    expect(wet).toBeGreaterThan(dry);
  });

  it('la erosión pesa más en ladera que en plano', () => {
    const plain = scoreHazard(item({ mfi: 160, slope: 1 }), 'soil').score!;
    const hill = scoreHazard(item({ mfi: 160, slope: 35 }), 'soil').score!;
    expect(hill).toBeGreaterThan(plain);
    expect(slopeFactor(0)).toBeCloseTo(0.2);
    expect(slopeFactor(60)).toBe(1);
  });

  it('sin la mitad de los datos no da puntaje y dice qué falta', () => {
    const r = scoreHazard(item({ lstHot: null }), 'heat');
    expect(r.score).toBeNull();
    expect(r.level).toBeNull();
    expect(r.missing).toContain('lstHot');
  });

  it('el combinado no diluye un riesgo grave', () => {
    expect(combine([90, 10, 10, 10])).toBe(66);
    expect(combine([null, null])).toBeNull();
  });

  it('el set sintético siempre tiene confianza baja', () => {
    expect(confidenceOf(0.95, true)).toBe('low');
    expect(confidenceOf(0.6, false)).toBe('medium');
  });
});
