import { describe, expect, it } from 'vitest';
import { ndviUrl, ndviYears, photoUrl, PHOTO_IN_NDVI } from './zoneImagery';

describe('imágenes de la zona', () => {
  it('la foto de 2016 usa la capa sin año y la caja va en orden lon,lat', () => {
    const u = new URL(photoUrl(4.5, -75.6, 2016));
    expect(u.searchParams.get('LAYERS')).toBe('s2cloudless');
    expect(u.searchParams.get('BBOX')).toBe('-75.6300,4.4700,-75.5700,4.5300');
    expect(new URL(photoUrl(4.5, -75.6, 2025)).searchParams.get('LAYERS')).toBe('s2cloudless-2025');
  });

  it('el NDVI va en orden lat,lon (WMS 1.3.0) y su caja contiene la de la foto', () => {
    const u = new URL(ndviUrl(4.5, -75.6, '2016-10-01'));
    expect(u.searchParams.get('BBOX')).toBe('4.3500,-75.7500,4.6500,-75.4500');
    expect(u.searchParams.get('TIME')).toBe('2016-10-01');
    expect(PHOTO_IN_NDVI).toBeCloseTo(0.2);
  });

  it('solo ofrece los años en que ese mes tiene datos (respeta los huecos de GIBS)', () => {
    const ranges = ['2000-03-01/2025-03-01/P1M', '2025-05-01/2026-10-01/P1M'];
    const oct = ndviYears(ranges, 10);
    expect(oct[0]).toBe(2000);
    expect(oct.at(-1)).toBe(2026);
    expect(oct).toHaveLength(27);
    // Abril de 2025 falta; enero de 2000 es anterior al inicio; noviembre de 2026 aún no existe.
    expect(ndviYears(ranges, 4)).not.toContain(2025);
    expect(ndviYears(ranges, 1)[0]).toBe(2001);
    expect(ndviYears(ranges, 11).at(-1)).toBe(2025);
    expect(ndviYears(['2020-06-01'], 6)).toEqual([2020]);
  });
});
