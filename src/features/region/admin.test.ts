import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bboxSideKm, fitBBox, unionBBox } from '@/lib/bbox';
import {
  adminName,
  adminParam,
  adminTarget,
  buildAdminIndex,
  findAdminAt,
  parseAdminParam,
  type AdminLevel,
  type Topology,
} from './admin';
import { defaultCellBBox, useRegionStore } from './store';

const readTopo = (level: AdminLevel) =>
  JSON.parse(readFileSync(join(process.cwd(), `public/geo/co-${level}.json`), 'utf8')) as Topology;

/** Cuadrado 0–10 con un hueco 4–6 (cuantizado ×1, con codificación delta) y un cuadrado vecino 10–20. */
const tiny: Topology = {
  type: 'Topology',
  transform: { scale: [1, 1], translate: [0, 0] },
  arcs: [
    // 0: borde compartido x=10, de (10,0) a (10,10)
    [
      [10, 0],
      [0, 10],
    ],
    // 1: resto del cuadrado A: (10,10) → (0,10) → (0,0) → (10,0)
    [
      [10, 10],
      [-10, 0],
      [0, -10],
      [10, 0],
    ],
    // 2: resto del cuadrado B: (10,0) → (20,0) → (20,10) → (10,10)
    [
      [10, 0],
      [10, 0],
      [0, 10],
      [-10, 0],
    ],
    // 3: hueco de A
    [
      [4, 4],
      [2, 0],
      [0, 2],
      [-2, 0],
      [0, -2],
    ],
  ],
  objects: {
    mpio: {
      type: 'GeometryCollection',
      geometries: [
        {
          type: 'Polygon',
          arcs: [[0, 1], [3]],
          properties: { c: '00001', n: 'Uno', dn: 'Prueba', x: 2, y: 2 },
        },
        { type: 'Polygon', arcs: [[2, -1]], properties: { c: '00002', n: 'Dos', dn: 'Prueba', x: 15, y: 5 } },
      ],
    },
    lines: { type: 'GeometryCollection', geometries: [{ type: 'MultiLineString', arcs: [[0]] }] },
  },
};

describe('límites (TopoJSON)', () => {
  const index = buildAdminIndex('mpio', tiny);

  it('decodifica arcos delta y une anillos sin repetir el punto de unión', () => {
    const uno = index.byCode.get('00001')!;
    expect(uno.polygons[0]![0]).toEqual([
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
      [10, 0],
    ]);
    expect(uno.bbox).toEqual([0, 0, 10, 10]);
    // Arco compartido recorrido al revés por el vecino.
    expect(index.byCode.get('00002')!.polygons[0]![0]!.slice(-2)).toEqual([
      [10, 10],
      [10, 0],
    ]);
    expect(index.lines?.coordinates).toEqual([
      [
        [10, 0],
        [10, 10],
      ],
    ]);
  });

  it('encuentra el área del punto y respeta los huecos', () => {
    expect(findAdminAt(index, 2, 2)?.code).toBe('00001');
    expect(findAdminAt(index, 15, 5)?.code).toBe('00002');
    expect(findAdminAt(index, 5, 5)).toBeNull(); // dentro del hueco
    expect(findAdminAt(index, 30, 5)).toBeNull();
  });

  it('rechaza un archivo que no es la topología esperada', () => {
    expect(() => buildAdminIndex('dpto', tiny)).toThrow();
  });
});

describe('límites de Colombia (public/geo, DANE)', () => {
  const mpio = buildAdminIndex('mpio', readTopo('mpio'));
  const dpto = buildAdminIndex('dpto', readTopo('dpto'));

  it('trae los 1.122 municipios y los 33 departamentos', () => {
    expect(mpio.areas).toHaveLength(1122);
    expect(dpto.areas).toHaveLength(33);
    expect(mpio.lines?.coordinates.length).toBeGreaterThan(100);
  });

  it.each([
    [6.2442, -75.5812, '05001', 'Medellín, Antioquia'],
    [3.4516, -76.532, '76001', 'Cali, Valle del Cauca'],
    [4.711, -74.0721, '11001', 'Bogotá, D.C.'],
    [-4.2153, -69.9406, '91001', 'Leticia, Amazonas'],
    [5.0703, -75.5138, '17001', 'Manizales, Caldas'],
    [6.1576, -75.6431, '05380', 'La Estrella, Antioquia'],
  ])('(%f, %f) cae en %s', (lat, lon, code, name) => {
    const area = findAdminAt(mpio, lon, lat);
    expect(area?.code).toBe(code);
    expect(adminName(area!)).toBe(name);
  });

  it('Bogotá es su propio departamento (hueco dentro de Cundinamarca)', () => {
    expect(findAdminAt(dpto, -74.0721, 4.711)?.code).toBe('11');
    expect(findAdminAt(dpto, -74.2136, 4.5627)?.code).toBe('25'); // Soacha
  });

  it('el mar y los países vecinos no son de ningún municipio', () => {
    expect(findAdminAt(mpio, -79.5, 3)).toBeNull(); // Pacífico
    expect(findAdminAt(mpio, -66.9, 10.5)).toBeNull(); // Caracas
  });

  it('el punto interior de cada municipio cae dentro de él', () => {
    const outside = mpio.areas.filter((a) => findAdminAt(mpio, a.label[0], a.label[1])?.code !== a.code);
    expect(outside.map((a) => a.code)).toEqual([]);
  });
});

describe('región del drawer', () => {
  const area = buildAdminIndex('mpio', tiny).byCode.get('00001')!;

  it('usa el punto tocado si lo hay y si no el punto interior', () => {
    expect(adminTarget(area, { lat: 1, lon: 3 })).toEqual({
      lat: 1,
      lon: 3,
      name: 'Uno, Prueba',
      admin: { level: 'mpio', code: '00001' },
    });
    expect(adminTarget(area)).toMatchObject({ lat: 2, lon: 2 });
  });

  it('?region=co:<DIVIPOLA> ida y vuelta', () => {
    expect(adminParam('05001')).toBe('co:05001');
    expect(parseAdminParam('co:05001')).toEqual({ level: 'mpio', code: '05001' });
    expect(parseAdminParam('co:05')).toEqual({ level: 'dpto', code: '05' });
    expect(parseAdminParam('co:5001')).toBeNull();
    expect(parseAdminParam('4.6,-74.1')).toBeNull();
  });
});

describe('fitBBox', () => {
  it('centra la caja y elige el zoom que cabe en pantalla', () => {
    // 1° de ancho en el ecuador = 512·2^z/360 px → en 360 px útiles (pad 0) cabe a z ≈ log2(360·360/512) ≈ 7,98
    const fit = fitBBox([-75.5, -0.5, -74.5, 0.5], 360, 2000, 0);
    expect(fit.lng).toBeCloseTo(-75, 6);
    expect(fit.lat).toBeCloseTo(0, 6);
    expect(fit.zoom).toBeCloseTo(Math.log2((360 * 360) / 512), 3);
  });

  it('con más margen abajo, el centro baja para que la caja quede en medio de la zona libre', () => {
    const box: [number, number, number, number] = [-75.5, -0.5, -74.5, 0.5];
    const even = fitBBox(box, 360, 2000, 0);
    const chat = fitBBox(box, 360, 2000, { top: 0, bottom: 200, left: 0, right: 0 });
    expect(chat.zoom).toBeCloseTo(even.zoom, 6); // el ancho manda en ambos casos
    expect(chat.lng).toBeCloseTo(even.lng, 6);
    // 100 px (medio margen) a este zoom: 100 / (512·2^z) del mundo ≈ 100 · 360 / (512·2^z) grados cerca del ecuador.
    const degPerPx = 360 / (512 * 2 ** chat.zoom);
    expect(even.lat - chat.lat).toBeCloseTo(100 * degPerPx, 3);
  });
});

describe('recuadro de los datos', () => {
  it('une cajas y mide el lado en km', () => {
    expect(unionBBox([0, 0, 1, 1], [-1, 0.5, 0.5, 2])).toEqual([-1, 0, 1, 2]);
    // 0,25° cerca del ecuador ≈ 28 km (el recuadro por defecto del mock de /region).
    expect(Math.round(bboxSideKm(defaultCellBBox({ lat: 6.16, lon: -75.64 })))).toBe(28);
    expect(Math.round(bboxSideKm(defaultCellBBox({ lat: 30.9, lon: 75.85, demoId: 'x' })))).toBe(55);
  });

  it('el store solo acepta el bbox de la región que sigue abierta', () => {
    const a = { lat: 6.16, lon: -75.64, admin: { level: 'mpio' as const, code: '05380' } };
    const b = { lat: 4.6, lon: -74.1 };
    const store = useRegionStore.getState();
    store.openRegion(a);
    store.setCell(a, [-75.8, 6, -75.5, 6.3]);
    expect(useRegionStore.getState().cell).toEqual([-75.8, 6, -75.5, 6.3]);
    store.openRegion(b);
    expect(useRegionStore.getState().cell).toBeNull();
    store.setCell(a, [-75.8, 6, -75.5, 6.3]); // respuesta tardía de la región anterior
    expect(useRegionStore.getState().cell).toBeNull();
    store.closeRegion();
  });
});
