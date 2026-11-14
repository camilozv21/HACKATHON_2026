import { describe, expect, it } from 'vitest';
import type { CropSeason } from '@/lib/api/contract';
import { rotationRows } from './crops';

const S = (crop: CropSeason['crop'], startMonth: number, endMonth: number, year: number, role: CropSeason['role'] = 'cash'): CropSeason => ({
  crop,
  startMonth,
  endMonth,
  year,
  role,
});

describe('rejilla de la rotación', () => {
  it('una temporada que cruza el año sigue en la fila del año siguiente', () => {
    // Maíz (año 1), soya (año 2), trigo de invierno oct del año 2 → jul del año 3, trébol de cobertura después.
    const rows = rotationRows(
      [S('maize', 5, 10, 1), S('soybean', 5, 9, 2), S('wheat', 10, 7, 2), S('clover', 8, 11, 3, 'cover')],
      3,
    );
    expect(rows[1]!.slice(9).map((x) => x?.crop)).toEqual(['wheat', 'wheat', 'wheat']);
    expect(rows[1]![0]).toBeNull(); // enero del año 2 no tiene trigo (ese es el del año 3)
    expect(rows[2]!.slice(0, 7).every((x) => x?.crop === 'wheat')).toBe(true);
    expect(rows[2]![7]?.crop).toBe('clover');
  });

  it('el último año que cruza vuelve al año 1 (la rotación se repite) y lo principal tapa la cobertura', () => {
    const rows = rotationRows([S('maize', 5, 10, 1), S('rye', 10, 4, 1, 'cover')], 1);
    expect(rows[0]![9]?.crop).toBe('maize');
    expect(rows[0]![10]?.crop).toBe('rye');
    expect(rows[0]![0]?.crop).toBe('rye');
  });
});
