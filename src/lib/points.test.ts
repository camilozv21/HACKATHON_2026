import { describe, expect, it } from 'vitest';
import { applyAwards, evaluateAward, levelOf, pointsFor, type PointRow } from './points';

const D1 = '2026-11-15';
const D2 = '2026-11-16';

describe('reglas de puntos', () => {
  it('retos: 30 por terminarlos y 20 por estrella, con tope en 21 estrellas', () => {
    expect(pointsFor('quest', 0)).toBe(30);
    expect(pointsFor('quest', 14)).toBe(310);
    expect(pointsFor('quest', 99)).toBe(450);
    expect(pointsFor('layer')).toBe(10);
  });

  it('una vez por referencia y topes diarios/totales', () => {
    expect(evaluateAward('layer', undefined, { existing: null, today: 0, total: 0 })).toEqual({ points: 10, delta: 10 });
    expect(evaluateAward('layer', undefined, { existing: 10, today: 1, total: 1 })).toBeNull();
    expect(evaluateAward('region', undefined, { existing: null, today: 10, total: 30 })).toBeNull();
    expect(evaluateAward('field', undefined, { existing: null, today: 0, total: 5 })).toBeNull();
  });

  it('retos: se guarda el mejor resultado y solo suma la diferencia', () => {
    expect(evaluateAward('quest', 10, { existing: null, today: 0, total: 0 })).toEqual({ points: 230, delta: 230 });
    expect(evaluateAward('quest', 8, { existing: 230, today: 0, total: 1 })).toBeNull();
    expect(evaluateAward('quest', 12, { existing: 230, today: 0, total: 1 })).toEqual({ points: 270, delta: 40 });
  });

  it('applyAwards: diarios por fecha, sin repetir dentro del mismo lote', () => {
    const first = applyAwards([], [{ action: 'visit', ref: 'x' }, { action: 'visit', ref: 'y' }, { action: 'layer', ref: 'ndvi' }, { action: 'layer', ref: 'ndvi' }], D1);
    expect(first.delta).toBe(20);
    expect(first.writes.map((w) => `${w.action}:${w.ref}`)).toEqual(['visit:2026-11-15', 'layer:ndvi']);
    const rows: PointRow[] = first.writes;
    expect(applyAwards(rows, [{ action: 'visit', ref: 'x' }], D1).delta).toBe(0);
    expect(applyAwards(rows, [{ action: 'visit', ref: 'x' }], D2).delta).toBe(10);
  });

  it('applyAwards: el tope diario de regiones se reinicia al otro día', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ action: 'region' as const, ref: `r${i}` }));
    const day1 = applyAwards([], items, D1);
    expect(day1.awarded).toHaveLength(10);
    const day2 = applyAwards(day1.writes, [{ action: 'region', ref: 'r11' }], D2);
    expect(day2.delta).toBe(5);
  });

  it('niveles y avance', () => {
    expect(levelOf(0)).toMatchObject({ id: 'semilla', rank: 1, next: 150, progress: 0 });
    expect(levelOf(275)).toMatchObject({ id: 'brote', next: 400, progress: 0.5 });
    expect(levelOf(5000)).toMatchObject({ id: 'bosque', rank: 5, next: null, progress: 1 });
  });
});
