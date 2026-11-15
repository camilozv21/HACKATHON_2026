import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { levelsFor } from '@/features/terrain/score';
import { TerrainDetail, TerrainIndex } from './terrain';

/** Los JSON que genera scripts/build-terrain-co.mjs cumplen el esquema que usa la app. */
const geo = join(process.cwd(), 'public/geo');
const index = TerrainIndex.parse(JSON.parse(readFileSync(join(geo, 'terrain-co.json'), 'utf8')));
const details = readdirSync(join(geo, 'terrain'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => TerrainDetail.parse(JSON.parse(readFileSync(join(geo, 'terrain', f), 'utf8'))));

describe('datos del terreno (public/geo)', () => {
  it('cubre los municipios y departamentos de Colombia', () => {
    const codes = Object.keys(index.items);
    expect(codes.filter((c) => c.length === 5).length).toBeGreaterThan(1000);
    expect(codes.filter((c) => c.length === 2).length).toBe(33);
    expect(details.length).toBe(33);
  });

  it('cada municipio del índice tiene su detalle, con una fila por año', () => {
    const detailCodes = new Set(details.flatMap((d) => Object.keys(d.items)));
    for (const c of Object.keys(index.items)) expect(detailCodes.has(c)).toBe(true);
    for (const d of details) for (const it of Object.values(d.items)) expect(it.y.length).toBe(index.periods.years.length);
  });

  it('el estado inicial del índice coincide con la matriz del detalle', () => {
    const d = details.find((x) => x.dpto === '05')!;
    const code = Object.keys(d.items).find((c) => c.length === 5)!;
    const t = d.items[code]!.t;
    const p0 = [0, 1, 2, 3].map((i) => t.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0));
    index.items[code]!.p0.forEach((v, i) => expect(Math.abs(v - p0[i]!)).toBeLessThanOrEqual(4));
  });

  it('el mapa no sale todo de un solo color', () => {
    const synthetic = index.source !== 'gee';
    const levels = Object.entries(index.items)
      .filter(([c]) => c.length === 5)
      .map(([, it]) => levelsFor(it, { synthetic }).all);
    const count = (l: string) => levels.filter((x) => x === l).length;
    // Con datos reales puede no haber ningún "alto" combinado; al menos dos niveles deben verse en el mapa.
    expect((['low', 'medium', 'high'] as const).filter((l) => count(l) > 20).length).toBeGreaterThanOrEqual(2);
  });
});
