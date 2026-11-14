import { describe, expect, it } from 'vitest';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';
import { toFieldInput } from '@/features/field/toFieldInput';
import { buildMockAnalysis } from '@/mocks/analysis';
import { archetypeFor } from '@/mocks/climateTemplates';
import { AnalysisRequest, AnalysisResponse, DEFAULT_PRIORITIES, FieldInput, Metric } from './contract';

describe('contrato', () => {
  it('acepta una finca con polígono y rechaza un polígono abierto de 2 puntos', () => {
    const field = toFieldInput(demoField(DEMO_FARMS[0]!, 'es'));
    expect(FieldInput.safeParse(field).success).toBe(true);
    const bad = { ...field, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } };
    expect(FieldInput.safeParse(bad).success).toBe(false);
  });

  it('una métrica siempre lleva fuente, resolución, periodo y confianza', () => {
    expect(Metric.safeParse({ value: 12, unit: 'mm' }).success).toBe(false);
    expect(
      Metric.safeParse({ value: 12, unit: 'mm', source: 'GPM', resolution: '0.1°', period: '2025', confidence: 'high' })
        .success,
    ).toBe(true);
  });

  it('rechaza prioridades fuera de 0–5', () => {
    const r = AnalysisRequest.safeParse({
      field: toFieldInput(demoField(DEMO_FARMS[0]!, 'es')),
      priorities: { ...DEFAULT_PRIORITIES, income: 9 },
      locale: 'es',
    });
    expect(r.success).toBe(false);
  });
});

describe('mocks de análisis', () => {
  it.each(DEMO_FARMS.map((d) => [d.id, d] as const))('%s cumple el contrato en es y en', (_, demo) => {
    for (const locale of ['es', 'en'] as const) {
      const res = buildMockAnalysis({
        field: toFieldInput(demoField(demo, locale)),
        priorities: DEFAULT_PRIORITIES,
        locale,
      });
      const parsed = AnalysisResponse.safeParse(res);
      if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3)));
      expect(res.strategies.length).toBeGreaterThanOrEqual(3);
      expect(res.strategies.filter((s) => s.isCurrent)).toHaveLength(1);
      expect(res.field.currentRotation.length).toBeGreaterThan(0);
      expect(res.climate.months).toHaveLength(12);
    }
  });

  it('cada estrategia trae evidencia, riesgos, vacíos y revisión local', () => {
    const res = buildMockAnalysis({
      field: toFieldInput(demoField(DEMO_FARMS[1]!, 'es')),
      priorities: DEFAULT_PRIORITIES,
      locale: 'es',
    });
    for (const s of res.strategies) {
      expect(s.evidence.length).toBeGreaterThan(0);
      expect(s.risks.length).toBeGreaterThan(0);
      expect(s.dataGaps.length).toBeGreaterThan(0);
      expect(s.needsLocalReview.length).toBeGreaterThan(0);
      expect(s.monthly).toHaveLength(12);
    }
  });

  it('pide los datos que faltan y deja de pedirlos cuando el agricultor los da', () => {
    const base = toFieldInput(demoField(DEMO_FARMS[1]!, 'es'));
    const empty = buildMockAnalysis({ field: base, priorities: DEFAULT_PRIORITIES, locale: 'es' });
    expect(empty.dataRequests?.map((r) => r.need)).toEqual(['current-rotation', 'soil-type', 'drainage', 'soil-test']);
    for (const r of empty.dataRequests ?? []) expect(r.reason.length).toBeGreaterThan(10);
    // Los ids de estrategias afectadas salen de la propia respuesta.
    const ids = new Set(empty.strategies.map((s) => s.id));
    for (const r of empty.dataRequests ?? []) for (const id of r.strategyIds ?? []) expect(ids.has(id)).toBe(true);

    const full = buildMockAnalysis({
      field: {
        ...base,
        currentRotation: empty.field.currentRotation,
        soil: { texture: 'clay', drainage: 'poor', ph: 5.2, organicMatterPct: 1.5 },
      },
      priorities: DEFAULT_PRIORITIES,
      locale: 'es',
    });
    expect(AnalysisResponse.safeParse(full).success).toBe(true);
    expect(full.dataRequests).toEqual([]);
    expect(full.insights.waterloggingRisk?.level).toBe('high');
    for (const s of full.strategies) {
      expect(s.dataGaps.some((g) => g.includes('análisis de suelo'))).toBe(false);
      expect(s.evidence.some((e) => e.source === 'Dato local' && e.statement.includes('tierra arcillosa'))).toBe(true);
    }
  });

  it('ignora peticiones de datos desconocidas sin romper el análisis', () => {
    const res = buildMockAnalysis({
      field: toFieldInput(demoField(DEMO_FARMS[0]!, 'es')),
      priorities: DEFAULT_PRIORITIES,
      locale: 'es',
    });
    const parsed = AnalysisResponse.safeParse({
      ...res,
      dataRequests: [{ need: 'well-depth', reason: 'Nuevo', impact: 'low' }, ...(res.dataRequests ?? [])],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.dataRequests?.map((r) => r.need)).toEqual(res.dataRequests?.map((r) => r.need));
  });

  it('elige un arquetipo climático razonable por ubicación', () => {
    expect(archetypeFor(7, 13.5)).toBe('sahel');
    expect(archetypeFor(75.8, 30.9)).toBe('monsoon');
    expect(archetypeFor(-75.7, 4.5)).toBe('tropical-highland');
    expect(archetypeFor(-60.6, -33.9)).toBe('pampa');
    expect(archetypeFor(-93.5, 42)).toBe('temperate');
  });
});
