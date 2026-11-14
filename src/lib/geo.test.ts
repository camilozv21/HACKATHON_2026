import { describe, expect, it } from 'vitest';
import { polygonAreaHa, ringBounds, ringCentroid } from './area';
import { formatCoords, haversineKm, lngLatToTile, wrapLng } from './geo';
import { decodePolyline, encodePolyline } from './polyline';

describe('polyline', () => {
  it('codifica el ejemplo de referencia de Google', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const coords: [number, number][] = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    expect(encodePolyline(coords)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('ida y vuelta conserva las coordenadas con ~1 m de precisión', () => {
    const ring: [number, number][] = [
      [-75.70312, 4.53101],
      [-75.69844, 4.53122],
      [-75.69811, 4.52731],
      [-75.70295, 4.52708],
    ];
    const back = decodePolyline(encodePolyline(ring));
    back.forEach(([lng, lat], i) => {
      expect(lng).toBeCloseTo(ring[i]![0], 5);
      expect(lat).toBeCloseTo(ring[i]![1], 5);
    });
  });

  it('rechaza cadenas truncadas', () => {
    expect(() => decodePolyline('_p~iF~ps|U_ulL')).toThrow();
  });
});

describe('área', () => {
  it('un cuadrado de 0.01° en el ecuador mide ~123.9 ha', () => {
    const sq: [number, number][] = [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
    ];
    expect(polygonAreaHa(sq)).toBeCloseTo(123.9, 0);
  });

  it('acepta anillos cerrados y abiertos por igual', () => {
    const open: [number, number][] = [
      [10, 45],
      [10.01, 45],
      [10.01, 45.01],
      [10, 45.01],
    ];
    const closed = [...open, open[0]!];
    expect(polygonAreaHa(closed)).toBeCloseTo(polygonAreaHa(open), 6);
  });

  it('centroide y límites', () => {
    const r: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    expect(ringCentroid(r)).toEqual([1, 1]);
    expect(ringBounds(r)).toEqual([0, 0, 2, 2]);
  });
});

describe('geo', () => {
  it('distancia Bogotá–Medellín ≈ 240 km', () => {
    expect(haversineKm({ lng: -74.072, lat: 4.711 }, { lng: -75.564, lat: 6.244 })).toBeCloseTo(237, -1);
  });
  it('normaliza longitudes', () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-190)).toBe(170);
  });
  it('tile XYZ que contiene un punto', () => {
    expect(lngLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1, z: 1 });
  });
  it('formatea coordenadas con hemisferio', () => {
    expect(formatCoords({ lng: -75.68, lat: 4.53 }, 2)).toBe('4.53° N, 75.68° O');
  });
});
