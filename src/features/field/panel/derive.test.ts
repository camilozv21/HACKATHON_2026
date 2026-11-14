import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIORITIES } from '@/lib/api/contract';
import { buildMockAnalysis } from '@/mocks/analysis';
import { DEMO_FARMS, demoField } from '../demoFarms';
import { toFieldInput } from '../toFieldInput';
import { buildYear, monthRanges } from './derive';

const NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

describe('calendario de la finca', () => {
  it('maíz–soya en Iowa: suelo desnudo de noviembre a abril y heladas en invierno', () => {
    const a = buildMockAnalysis({ field: toFieldInput(demoField(DEMO_FARMS[1]!, 'es')), priorities: DEFAULT_PRIORITIES, locale: 'es' });
    const year = buildYear(a.climate, a.field.currentRotation, { insights: a.insights });
    expect(year).toHaveLength(12);
    const bare = year.filter((m) => m.bare).map((m) => m.month);
    expect(monthRanges(bare, NAMES)).toBe('nov–abr');
    expect(year[0]!.stress).toContain('frost');
    expect(year[6]!.crop?.crop).toBe('maize');
  });

  it('agrupa meses que cruzan el año', () => {
    expect(monthRanges([11, 12, 1, 2], NAMES)).toBe('nov–feb');
    expect(monthRanges([3, 5, 6], NAMES)).toBe('mar, may–jun');
    expect(monthRanges([], NAMES)).toBe('');
  });
});
