import { describe, expect, it } from 'vitest';
import { isValidDate, monthOptions, parseRanges, snapDate } from './dates';
import type { LayerConfig } from './layers.config';

const monthly: LayerConfig = {
  id: 'ndvi',
  kind: 'gibs',
  icon: 'Leaf',
  source: 'MODIS',
  mission: 'Terra',
  cadence: 'monthly',
  defaultOpacity: 0.8,
  gibs: {
    id: 'X',
    level: 7,
    format: 'png',
    defaultTime: '2026-10-01',
    // Hueco real de GIBS: falta abril de 2025.
    ranges: ['2000-03-01/2025-03-01/P1M', '2025-05-01/2026-10-01/P1M'],
  },
};

const daily: LayerConfig = {
  ...monthly,
  id: 'soil-moisture',
  cadence: 'daily',
  gibs: { ...monthly.gibs!, defaultTime: '2026-11-08', ranges: ['2026-09-01/2026-11-06/P1D', '2026-11-08/2026-11-08/P1D'] },
};

describe('rangos de fechas GIBS', () => {
  it('interpreta periodos mensuales y diarios', () => {
    const r = parseRanges(monthly.gibs!.ranges);
    expect(r).toHaveLength(2);
    expect(r[0]!.stepMonths).toBe(1);
    expect(parseRanges(daily.gibs!.ranges)[0]!.stepDays).toBe(1);
  });

  it('valida fechas dentro de los rangos y respeta los huecos', () => {
    expect(isValidDate(monthly, '2024-06-01')).toBe(true);
    expect(isValidDate(monthly, '2024-06-15')).toBe(false);
    expect(isValidDate(monthly, '2025-04-01')).toBe(false);
    expect(isValidDate(daily, '2026-11-07')).toBe(false);
    expect(isValidDate(daily, '2026-11-08')).toBe(true);
  });

  it('ajusta una fecha a la válida más cercana', () => {
    expect(snapDate(monthly)).toBe('2026-10-01');
    expect(snapDate(monthly, '2030-01-01')).toBe('2026-10-01');
    expect(snapDate(monthly, '2024-06-20')).toBe('2024-07-01');
    expect(snapDate(daily, '2026-11-07')).toMatch(/2026-11-0[68]/);
  });

  it('el timeline de 12 meses marca los meses sin datos', () => {
    const opts = monthOptions(monthly, 24);
    expect(opts).toHaveLength(24);
    expect(opts.at(-1)).toEqual({ key: '2026-10', date: '2026-10-01' });
    expect(opts.find((o) => o.key === '2025-04')?.date).toBeNull();
  });

  it('en capas diarias cada mes usa un día representativo', () => {
    const opts = monthOptions(daily, 3);
    expect(opts.map((o) => o.key)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(opts[0]!.date).toBe('2026-09-15');
    expect(opts[2]!.date).toBe('2026-11-08');
  });
});
