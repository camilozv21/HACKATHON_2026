import { describe, expect, it } from 'vitest';
import { summarizePeriod, type DayObs } from './events';
import { parseTimeParam, periodLabel, periodOf, presets, representativeDate, shiftMonth } from './period';

const NOW = new Date('2026-11-11T12:00:00Z'); // último día con datos: 2026-11-08

describe('máquina del tiempo: periodos', () => {
  it('acepta meses y días con datos, rechaza el futuro, los últimos días y antes de 1981', () => {
    expect(parseTimeParam('2026-05', NOW)).toEqual({ kind: 'month', ym: '2026-05' });
    expect(parseTimeParam('2026-05-14', NOW)).toEqual({ kind: 'day', date: '2026-05-14' });
    expect(parseTimeParam('2026-11-10', NOW)).toBeNull();
    expect(parseTimeParam('2026-12', NOW)).toBeNull();
    expect(parseTimeParam('1980-12', NOW)).toBeNull();
    expect(parseTimeParam('2026-02-30', NOW)).toBeNull();
    expect(parseTimeParam('2026-13', NOW)).toBeNull();
    expect(parseTimeParam('mayo', NOW)).toBeNull();
  });

  it('el periodo es el mes completo; un mes en curso se corta en el último día con datos', () => {
    expect(periodOf({ kind: 'month', ym: '2026-05' }, NOW)).toMatchObject({ start: '2026-05-01', end: '2026-05-31', days: 31, partial: false, focus: null });
    expect(periodOf({ kind: 'day', date: '2024-02-10' }, NOW)).toMatchObject({ start: '2024-02-01', end: '2024-02-29', days: 29, focus: '2024-02-10' });
    expect(periodOf({ kind: 'month', ym: '2026-11' }, NOW)).toMatchObject({ end: '2026-11-08', days: 8, partial: true });
  });

  it('fecha para las capas: el día elegido, el 15 del mes o el último disponible', () => {
    expect(representativeDate({ kind: 'day', date: '2026-05-03' }, NOW)).toBe('2026-05-03');
    expect(representativeDate({ kind: 'month', ym: '2026-05' }, NOW)).toBe('2026-05-15');
    expect(representativeDate({ kind: 'month', ym: '2026-11' }, NOW)).toBe('2026-11-08');
  });

  it('etiquetas y atajos', () => {
    expect(periodLabel({ kind: 'month', ym: '2026-05' }, 'es')).toBe('mayo de 2026');
    expect(periodLabel({ kind: 'month', ym: '2026-05' }, 'en')).toBe('May 2026');
    expect(periodLabel({ kind: 'day', date: '2026-05-14' }, 'es')).toBe('14 de mayo de 2026');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(presets(NOW)).toEqual({ thisMonth: '2026-11', lastMonth: '2026-10', sameMonthLastYear: '2025-11' });
  });
});

const day = (d: number, precip: number | null, tmax: number | null = 25, tmin: number | null = 12): DayObs => ({
  date: `2026-05-${String(d).padStart(2, '0')}`,
  precip,
  tmax,
  tmin,
});

describe('máquina del tiempo: eventos', () => {
  it('total contra lo normal, días con lluvia y extremos', () => {
    const days = [day(1, 10), day(2, 0), day(3, 5, 30, 8), day(4, null)];
    const s = summarizePeriod(days, 4, 4);
    expect(s.totalMm).toBe(15);
    expect(s.normalMm).toBe(12); // 3 días con dato × 4 mm
    expect(s.pct).toBe(25);
    expect(s.rainyDays).toBe(2);
    expect(s.wettest).toEqual({ date: '2026-05-01', mm: 10 });
    expect(s.hottest?.c).toBe(30);
    expect(s.coldest?.c).toBe(8);
    expect(s.coverage).toBe(0.75);
  });

  it('lluvia fuerte: ≥ 20 mm o ≥ 3× lo normal y ≥ 10 mm; días seguidos son un evento', () => {
    const s = summarizePeriod([day(1, 25), day(2, 12), day(3, 0), day(4, 11)], 3);
    const heavy = s.events.filter((e) => e.kind === 'heavyRain');
    expect(heavy).toHaveLength(2);
    expect(heavy[0]).toMatchObject({ start: '2026-05-01', end: '2026-05-02', days: 2, value: 37, peakDate: '2026-05-01' });
    expect(heavy[1]).toMatchObject({ start: '2026-05-04', value: 11 });
    // Sin climatología solo cuenta el umbral fijo de 20 mm.
    expect(summarizePeriod([day(1, 15)], null).events).toHaveLength(0);
  });

  it('racha seca de 7+ días, calor y helada', () => {
    const dry = Array.from({ length: 8 }, (_, i) => day(i + 1, 0.2, i === 3 ? 36 : 30, i === 6 ? -1 : 5));
    const s = summarizePeriod([...dry, day(9, 6)], 2);
    expect(s.events.map((e) => e.kind).sort()).toEqual(['drySpell', 'frost', 'heat']);
    expect(s.events.find((e) => e.kind === 'drySpell')).toMatchObject({ days: 8, value: 8 });
    expect(s.events.find((e) => e.kind === 'heat')).toMatchObject({ value: 36, peakDate: '2026-05-04' });
    expect(s.events.find((e) => e.kind === 'frost')).toMatchObject({ value: -1 });
  });
});
