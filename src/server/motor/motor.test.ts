// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotorPlanRequest } from '@/lib/api/motor';
import sample from '@/mocks/motor/sample.json';
import { buildPayload, clientRef, evaluate, toPowerSeries } from './client';
import { mockEvaluation } from './mock';
import { normalizeMotor } from './normalize';

const zone: MotorPlanRequest['zone'] = {
  bbox: [-76.08, 6.64, -76.07, 6.65],
  center: [-76.075, 6.645],
  point: false,
  powerCells: 1,
  powerCellsOk: 1,
  period: { start: '2026-08-15', end: '2026-08-21' },
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-08-${15 + i}`,
    t2m: 16,
    tmax: 22,
    tmin: 10,
    rh: 88,
    precip: i === 3 ? null : 5,
    soilRoot: 72,
    soilTop: 80,
    wind: 1.2,
    solar: 15,
  })),
  summary: { temperature: 16, tmax7d: 22, relativeHumidity: 88, rain7d: 30, rain30d: 120, soilMoisture: 72, elevationM: 2300, slopePct: 38, flatPct: 2 },
  terrain: { places: ['Abriaquí'], synthetic: true },
};

const req: MotorPlanRequest = {
  fieldId: 'p:abc',
  zone,
  crop: 'frijol',
  stage: 'floracion',
  symptoms: ['clorosis_hojas_viejas'],
  history: [['maiz']],
  residue: 'removed',
  soil: { ph: 5.2, organicMatterPct: null, texture: 'Arcillosa' },
  place: 'Abriaquí, Colombia',
  locale: 'es',
};

describe('salida del motor → plan', () => {
  it('lee la salida real 4.1.0: riesgo, hallazgos con su porqué y certeza, rotación ordenada y vacíos', () => {
    const plan = normalizeMotor({ id: 42, created_at: '2026-11-15T12:00:00Z', resultado: sample }, { source: 'motor', accepted: 'full' });
    expect(plan.evaluationId).toBe('42');
    expect(plan.risk.overall).toBe('high');
    expect(plan.cell?.gridId).toBe('18727');
    expect(plan.context.altitude?.text).toBe('2000 a 3000');
    expect(plan.findings.map((f) => f.id)).toEqual(['SOIL_001', 'SOIL_007']);
    const acid = plan.findings[0]!;
    expect(acid.certainty).toBe('media');
    expect(acid.why[0]).toMatchObject({ label: 'pH del suelo', observed: '5 a 5.5', operator: '<', threshold: '5.5' });
    expect(plan.findings[1]!.uncalibrated).toBe(true);
    // Favorecidas primero; la caña después de maíz queda al final (bloqueada).
    const statuses = plan.rotation.candidates.map((c) => c.status);
    expect(statuses[0]).toBe('favorecido');
    expect(plan.rotation.candidates.at(-1)).toMatchObject({ cropKey: 'cana_panelera', status: 'desaconsejado' });
    expect(plan.rotation.candidates.at(-1)!.reasons[0]!.effect).toBe('block');
    expect(plan.rotation.history[0]).toEqual(['maiz']);
    expect(plan.gaps.notInBundle).toContain('temperature');
    expect(plan.practices[0]!.fromFinding).toBe(true);
    expect(plan.cautions.length).toBeGreaterThan(0);
  });

  it('tolera un registro sin envoltura y campos que faltan', () => {
    const plan = normalizeMotor({ schema_version: '4.2.0', inference: { findings: [{ rule_id: 'X', title: 'Algo' }] } }, { source: 'motor', accepted: 'minimal' });
    expect(plan.findings[0]).toMatchObject({ id: 'X', severity: 'unknown', certainty: 'baja' });
    expect(plan.rotation.candidates).toEqual([]);
    expect(plan.territory).toBeNull();
  });

  it('el ejemplo sin historial deja la rotación sin evaluar y quita hallazgos de otro cultivo', () => {
    const plan = normalizeMotor(mockEvaluation({ ...req, crop: 'maiz', history: [] }), { source: 'mock', accepted: 'full' });
    expect(plan.source).toBe('mock');
    expect(plan.rotation.situation).toBe('sin_historial');
    expect(plan.rotation.candidates.every((c) => c.status === 'sin_evaluar')).toBe(true);
    expect(plan.findings.map((f) => f.id)).not.toContain('SOIL_007');
    expect(plan.context.crop).toBe('Maíz');
  });
});

describe('pedido al motor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('manda en campo solo lo del lote; NASA POWER va como serie con fechas y huecos −999', () => {
    const body = buildPayload(req, 'full');
    expect(body).toMatchObject({ lat: 6.645, lon: -76.075, cultivo: 'frijol', etapa: 'floracion', historial: [['maiz']], rastrojo: 'removed' });
    expect(body.campo).toEqual({ soil_ph: 5.2, soil_texture: 'Arcillosa', symptoms: ['clorosis_hojas_viejas'] });
    expect(body.referencia_cliente).toBe(clientRef('p:abc'));
    expect(String(body.referencia_cliente)).not.toContain('abc');
    const series = toPowerSeries(zone);
    expect(series.properties.parameter.PRECTOTCORR).toMatchObject({ '20260815': 5, '20260818': -999 });
    expect(series.properties.parameter.GWETROOT!['20260815']).toBeCloseTo(0.72);
    expect(buildPayload(req, 'no-series').serie_nasa_power).toBeUndefined();
    expect(Object.keys(buildPayload(req, 'minimal')).sort()).toEqual(['cultivo', 'etapa', 'lat', 'lon', 'referencia_cliente']);
  });

  it('con 422 baja de escalón (sin serie) y dice cuál aceptó; manda la clave en X-API-Key', async () => {
    vi.stubEnv('MOTOR_API_URL', 'https://motor.example/');
    vi.stubEnv('MOTOR_API_KEY', 'k-123');
    const seen: { body: Record<string, unknown>; key: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(url).toBe('https://motor.example/api/v1/evaluaciones');
      const body = JSON.parse(String(init.body));
      seen.push({ body, key: new Headers(init.headers).get('X-API-Key') });
      if (body.serie_nasa_power) return new Response(JSON.stringify({ detail: [{ loc: ['body', 'serie_nasa_power'], msg: 'bad', input: {} }] }), { status: 422 });
      return new Response(JSON.stringify({ id: 7, resultado: sample }), { status: 201 });
    });
    const { record, accepted } = await evaluate(req);
    expect(accepted).toBe('no-series');
    expect(seen).toHaveLength(2);
    expect(seen[0]!.key).toBe('k-123');
    expect((record as { id: number }).id).toBe(7);
  });

  it('un 500 no se reintenta', async () => {
    vi.stubEnv('MOTOR_API_URL', 'https://motor.example');
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n++;
      return new Response('boom', { status: 500 });
    });
    await expect(evaluate(req)).rejects.toMatchObject({ kind: 'http', status: 500 });
    expect(n).toBe(1);
  });
});
