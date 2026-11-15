// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET as getCatalog } from '@/app/api/terrain/route';
import { GET as getAt } from '@/app/api/terrain/at/route';
import { GET as getPlace } from '@/app/api/terrain/places/[code]/route';
import { GET as getPlaces } from '@/app/api/terrain/places/route';
import { GET as getSeries } from '@/app/api/terrain/series/route';
import { TerrainApiError, TerrainAtResponse, TerrainListResponse, TerrainPlaceResponse } from '@/lib/api/terrainApi';
import { FIELD_MAP } from './fields';
import { matches, parseFilter, parseQuery } from './query';

const BASE = 'http://localhost/api/terrain';
const req = (path: string) => new Request(`${BASE}${path}`);
const list = async (res: Response) => TerrainListResponse.parse(await res.json());
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

describe('lenguaje de consulta', () => {
  it('entiende op.valor, atajos y listas', () => {
    expect(parseFilter('pHeavy', 'gte.5', 'es')).toMatchObject({ op: 'gte', value: 5 });
    expect(parseFilter('smAnom', 'lt.-5', 'es')).toMatchObject({ op: 'lt', value: -5 });
    expect(parseFilter('riskLevel', 'high', 'es')).toMatchObject({ op: 'eq', value: 'high' });
    expect(parseFilter('code', '05001,11001', 'es')).toMatchObject({ op: 'in', value: ['05001', '11001'] });
    expect(parseFilter('riskLevel', 'in.(medium,high)', 'es')).toMatchObject({ op: 'in', value: ['medium', 'high'] });
    // Un nombre con coma no se parte en lista.
    expect(parseFilter('name', 'Bogotá, D.C.', 'es')).toMatchObject({ op: 'eq', value: 'Bogotá, D.C.' });
  });

  it('ilike ignora mayúsculas y tildes; null solo cumple is.null', () => {
    const f = parseFilter('name', 'ilike.*medellin*', 'es');
    expect(matches({ name: 'Medellín' }, f)).toBe(true);
    expect(matches({ gwTrend: null }, parseFilter('gwTrend', 'is.null', 'es'))).toBe(true);
    expect(matches({ gwTrend: null }, parseFilter('gwTrend', 'lt.0', 'es'))).toBe(false);
    expect(matches({ gwTrend: null }, parseFilter('gwTrend', 'neq.0', 'es'))).toBe(false);
  });

  it('rechaza campos, valores y combinaciones inválidas con un código estable', () => {
    const p = (s: string) => () => parseQuery(new URLSearchParams(s), { formats: ['json'] });
    expect(p('nope=1')).toThrow(expect.objectContaining({ code: 'unknown-field' }));
    expect(p('pHeavy=gte.mucho')).toThrow(expect.objectContaining({ code: 'invalid-number' }));
    expect(p('riskLevel=altísimo')).toThrow(expect.objectContaining({ code: 'invalid-value' }));
    expect(p('name=gt.x&name=like')).not.toThrow();
    expect(p('pHeavy=like.5')).toThrow(expect.objectContaining({ code: 'invalid-operator' }));
    expect(p('lat=4')).toThrow(expect.objectContaining({ code: 'invalid-location' }));
    expect(p('year=2020&from=2016')).toThrow(expect.objectContaining({ code: 'invalid-time' }));
    expect(p('format=xml')).toThrow(expect.objectContaining({ code: 'invalid-format' }));
    expect(p('_=123')).not.toThrow();
  });

  it('cada campo del catálogo tiene descripción en los dos idiomas', () => {
    for (const f of FIELD_MAP.values()) {
      expect(f.es.length, f.name).toBeGreaterThan(5);
      expect(f.en.length, f.name).toBeGreaterThan(5);
    }
  });
});

describe('GET /api/terrain', () => {
  it('se describe sola, con CORS abierto', async () => {
    const res = await getCatalog(req('?lang=en'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body.coverage).toMatchObject({ mpio: 1122, dpto: 33 });
    expect(body.endpoints.map((e: { path: string }) => e.path)).toContain('/api/terrain/series');
    expect(body.fields.find((f: { name: string }) => f.name === 'pHeavy')).toMatchObject({ unit: 'días/año', scope: 'place' });
    expect(body.years.observed).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(body.years.projected).toEqual([2031, 2038, 2045]);
  });
});

describe('GET /api/terrain/places', () => {
  it('filtra por cualquier campo y ordena con los null al final', async () => {
    const body = await list(await getPlaces(req('/places?level=mpio&riskLevel=in.(medium,high)&sort=-riskScore&limit=2000')));
    expect(body.meta.total).toBeGreaterThan(0);
    expect(body.data.every((r) => r.level === 'mpio' && (r.riskLevel === 'medium' || r.riskLevel === 'high'))).toBe(true);
    const scores = body.data.map((r) => r.riskScore as number);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(body.meta.caveats.length).toBeGreaterThan(3);
  });

  it('pagina con links.next y X-Total-Count', async () => {
    const res = await getPlaces(req('/places?level=mpio&limit=10&fields=code,name'));
    expect(res.headers.get('x-total-count')).toBe('1122');
    const body = await list(res);
    expect(body.data).toHaveLength(10);
    expect(Object.keys(body.data[0]!)).toEqual(['code', 'name']);
    expect(body.links.next).toContain('offset=10');
  });

  it('busca cerca de un punto y añade distanceKm', async () => {
    const body = await list(await getPlaces(req('/places?near=4.711,-74.072&radiusKm=40&level=mpio&fields=code,name,distanceKm')));
    expect(body.data[0]).toMatchObject({ code: '11001', distanceKm: 0 }); // el punto cae en Bogotá
    const d = body.data.map((r) => r.distanceKm as number);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(d.every((x) => x <= 40)).toBe(true);
  });

  it('con year filtra por el estado del terreno ese año', async () => {
    const body = await list(await getPlaces(req('/places?year=2024&level=mpio&bare=gte.0.05&fields=code,year,kind,bare')));
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((r) => r.year === 2024 && r.kind === 'observed' && (r.bare as number) >= 0.05)).toBe(true);
  });

  it('pide year para los campos por año y avisa de los años sin dato', async () => {
    const a = await getPlaces(req('/places?bare=gte.0.1'));
    expect(a.status).toBe(400);
    expect(TerrainApiError.parse(await a.json()).error).toBe('year-required');
    const b = await getPlaces(req('/places?year=2030'));
    expect(b.status).toBe(400);
    expect((await b.json()).hint).toMatchObject({ projected: [2031, 2038, 2045] });
  });

  it('sale en CSV y en GeoJSON', async () => {
    const c = await getPlaces(req('/places?dpto=05&level=dpto&fields=code,name,riskScore&format=csv'));
    expect(c.headers.get('content-type')).toContain('text/csv');
    const [header, row] = (await c.text()).trim().split('\n');
    expect(header).toBe('code,name,riskScore');
    expect(row).toMatch(/^05,Antioquia,\d+$/);
    const g = await getPlaces(req('/places?code=05001&format=geojson&fields=code,name'));
    const fc = await g.json();
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features[0]).toMatchObject({ id: '05001', geometry: { type: 'Point' }, properties: { code: '05001' } });
  });
});

describe('GET /api/terrain/series (ubicación × tiempo)', () => {
  it('un punto: el municipio que lo contiene, año por año, con la proyección', async () => {
    const body = await list(await getSeries(req('/series?lat=6.2442&lon=-75.5812&level=mpio&from=2016&to=2031')));
    expect(new Set(body.data.map((r) => r.code))).toEqual(new Set(['05001'])); // Medellín
    expect(body.data.map((r) => r.year)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2031]);
    expect(body.data.at(-1)?.kind).toBe('projected');
    for (const r of body.data) {
      const sum = (r.healthy as number) + (r.stressed as number) + (r.bare as number) + (r.water as number);
      expect(sum).toBeCloseTo(1, 1);
    }
  });

  it('varios códigos, campos a elección y filtros por año', async () => {
    const body = await list(await getSeries(req('/series?code=05001,05088&from=2020&to=2022&fields=code,year,healthy,riskLevel')));
    expect(body.data).toHaveLength(6);
    expect(Object.keys(body.data[0]!)).toEqual(['code', 'year', 'healthy', 'riskLevel']);
    const f = await list(await getSeries(req('/series?level=mpio&year=2025&bare=gte.0.1&sort=-bare&fields=code,bare')));
    const bare = f.data.map((r) => r.bare as number);
    expect(bare.every((b) => b >= 0.1)).toBe(true);
    expect(bare).toEqual([...bare].sort((a, b) => b - a));
  });

  it('aggregate=true promedia el departamento por año', async () => {
    const body = await list(await getSeries(req('/series?dpto=05&level=mpio&aggregate=true&to=2045')));
    expect(body.data.map((r) => r.year)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2031, 2038, 2045]);
    expect(body.data.every((r) => r.places === 125)).toBe(true);
  });

  it('CSV con las columnas por defecto', async () => {
    const res = await getSeries(req('/series?code=11001&format=csv'));
    const lines = (await res.text()).trim().split('\n');
    expect(lines[0]).toBe('code,name,level,year,kind,healthy,stressed,bare,water');
    expect(lines).toHaveLength(11);
  });
});

describe('GET /api/terrain/places/:code y /at', () => {
  it('detalle con riesgo, Markov y serie', async () => {
    const res = await getPlace(req('/places/05001?to=2038'), ctx('05001'));
    const { data } = TerrainPlaceResponse.parse(await res.json());
    expect(data.name).toBe('Medellín');
    for (const row of Object.values(data.markov!.matrix)) {
      expect(Object.values(row).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    }
    expect(data.series.map((s) => s.year).at(-1)).toBe(2038);
  });

  it('404 para un código sin datos y 400 para uno mal formado', async () => {
    expect((await getPlace(req('/places/99999'), ctx('99999'))).status).toBe(404);
    expect((await getPlace(req('/places/abc'), ctx('abc'))).status).toBe(400);
    expect((await getPlace(req('/places/05001?riskLevel=high'), ctx('05001'))).status).toBe(400);
  });

  it('un punto en Colombia da municipio y departamento; en el mar, 404', async () => {
    const res = await getAt(req('/at?lat=4.711&lon=-74.072'));
    const { data } = TerrainAtResponse.parse(await res.json());
    expect(data.mpio?.code).toBe('11001');
    expect(data.dpto?.code).toBe('11');
    const far = await getAt(req('/at?lat=0&lon=-100'));
    expect(far.status).toBe(404);
    expect(await far.json()).toMatchObject({ error: 'outside-coverage', hint: { nearest: null } });
    // En el mar frente a Cartagena: sugiere el municipio más cercano.
    const sea = await getAt(req('/at?lat=10.42&lon=-75.62'));
    expect(sea.status).toBe(404);
    const hint = (await sea.json()).hint.nearest;
    expect(hint.code.slice(0, 2)).toBe('13');
    expect(hint.distanceKm).toBeLessThan(50);
  });
});
