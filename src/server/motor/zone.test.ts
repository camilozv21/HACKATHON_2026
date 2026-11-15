// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bboxCenter, bboxOf, gatherZone, powerCellOf, powerSamples, samplePoints } from './zone';

vi.mock('@/server/terrain/data', () => ({ loadTerrain: () => Promise.reject(new Error('sin terreno en la prueba')) }));

const ring: [number, number][] = [
  [-75.7, 4.5],
  [-75.68, 4.51],
  [-75.69, 4.53],
  [-75.71, 4.52],
  [-75.7, 4.5],
];

describe('zona de la finca: rectángulo de los extremos, no el polígono', () => {
  it('toma el mínimo y el máximo de longitud y latitud', () => {
    expect(bboxOf({ type: 'Polygon', coordinates: [ring] })).toEqual([-75.71, 4.5, -75.68, 4.53]);
    expect(bboxCenter([-75.71, 4.5, -75.68, 4.53])).toEqual([-75.695, 4.515]);
  });

  it('un punto da un rectángulo de tamaño cero y una sola muestra', () => {
    const b = bboxOf({ type: 'Point', coordinates: [-75.7, 4.5] });
    expect(b).toEqual([-75.7, 4.5, -75.7, 4.5]);
    expect(samplePoints(b)).toHaveLength(1);
  });

  it('una finca chica cae en una sola celda de NASA POWER; una que cruza el borde, en dos', () => {
    expect(powerSamples([-75.71, 4.5, -75.68, 4.53])).toHaveLength(1);
    // 4,5° es borde de celda en latitud (rejilla de 0,5°).
    const across = powerSamples([-75.71, 4.49, -75.68, 4.51]);
    expect(across).toHaveLength(2);
    expect(new Set(across.map((s) => s.cell)).size).toBe(2);
    expect(powerCellOf([-75.7, 4.49])).not.toBe(powerCellOf([-75.7, 4.51]));
  });
});

describe('gatherZone', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('con dos celdas, cada día queda con el valor máximo y la lluvia de 7 días suma esos máximos', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: URL) => {
      calls.push(String(url));
      const lat = Number(url.searchParams.get('latitude'));
      const wet = lat >= 4.5; // el centro (4,50) cae en la celda de arriba
      const days = Array.from({ length: 10 }, (_, i) => `202611${String(i + 1).padStart(2, '0')}`);
      const series = (v: number) => Object.fromEntries(days.map((d) => [d, v]));
      return new Response(
        JSON.stringify({
          geometry: { coordinates: [-75.7, lat, wet ? 1800 : 1500] },
          header: { fill_value: -999 },
          properties: {
            parameter: {
              T2M: series(wet ? 18 : 20),
              T2M_MAX: series(wet ? 24 : 27),
              T2M_MIN: series(12),
              RH2M: series(wet ? 85 : 80),
              PRECTOTCORR: series(wet ? 6 : 2),
              GWETROOT: series(wet ? 0.7 : -999),
              GWETTOP: series(0.6),
              WS2M: series(1.5),
              ALLSKY_SFC_SW_DWN: series(17),
            },
          },
        }),
      );
    });
    const zone = await gatherZone([-75.71, 4.49, -75.68, 4.51], { now: new Date('2026-11-15T12:00:00Z') });
    expect(calls).toHaveLength(2);
    expect(zone.powerCells).toBe(2);
    expect(zone.powerCellsOk).toBe(2);
    expect(zone.days).toHaveLength(10);
    expect(zone.days[0]).toMatchObject({ t2m: 20, tmax: 27, precip: 6, rh: 85, soilRoot: 70 });
    expect(zone.summary.rain7d).toBe(42);
    expect(zone.summary.elevationM).toBe(1800);
    expect(zone.terrain).toBeNull();
    expect(zone.point).toBe(false);
  });

  it('si NASA POWER no responde, la zona sale sin serie (el motor trabaja con lo que haya)', async () => {
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
    const zone = await gatherZone([-60.1, -33.9, -60.1, -33.9], { now: new Date('2026-11-15T12:00:00Z') });
    expect(zone.powerCellsOk).toBe(0);
    expect(zone.days).toEqual([]);
    expect(zone.summary.rain7d).toBeNull();
  });
});
