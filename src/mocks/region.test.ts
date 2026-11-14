import { describe, expect, it } from 'vitest';
import { RegionSummary } from '@/lib/api/contract';
import { buildMockRegion, type PowerRecent } from './region';

const power: PowerRecent = {
  days: Array.from({ length: 40 }, (_, i) => ({
    date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    precip: i % 3 === 0 ? 0 : 2,
    tmax: 38 + (i % 3),
    tmin: 24,
  })),
  climPrecipMmDay: Array(12).fill(4),
  climTmax: Array(12).fill(33),
};

describe('mock de región', () => {
  it('con datos de NASA POWER cumple el contrato y usa cifras reales para lluvia y calor', () => {
    const r = buildMockRegion({ lat: 30.85, lon: 75.75, demoId: 'punjab-ludhiana', locale: 'es', now: new Date('2026-11-11T12:00:00Z') }, power);
    const parsed = RegionSummary.safeParse(r);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3)));
    const rain = r.cards.find((c) => c.id === 'rain')!;
    expect(rain.source).toBe('NASA POWER');
    expect(rain.simulated).toBeUndefined();
    const heat = r.cards.find((c) => c.id === 'heat')!;
    expect(heat.headline).toMatch(/35 °C/);
    expect(r.alerts.length).toBeGreaterThan(0);
    expect(r.cards.map((c) => c.id)).toEqual(['soil-moisture', 'rain', 'ndvi', 'heat', 'et', 'groundwater', 'relief']);
  });

  it('sin POWER marca lluvia y calor como simulados', () => {
    const r = buildMockRegion({ lat: 4.5, lon: -75.7, locale: 'en' }, null);
    expect(RegionSummary.safeParse(r).success).toBe(true);
    expect(r.cards.find((c) => c.id === 'rain')!.simulated).toBe(true);
    expect(r.kind).toBe('cell');
  });
});
