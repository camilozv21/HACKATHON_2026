import { describe, expect, it } from 'vitest';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';
import { toFieldInput } from '@/features/field/toFieldInput';
import { DEFAULT_PRIORITIES } from '@/lib/api/contract';
import { OutlookResponse } from '@/lib/api/outlook';
import { buildMockAnalysis } from '@/mocks/analysis';
import { POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('http://test/api/mock/rotations/outlook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );

function bodyFor(demoId: string) {
  const demo = DEMO_FARMS.find((d) => d.id === demoId)!;
  const analysis = buildMockAnalysis({
    field: toFieldInput(demoField(demo, 'es')),
    priorities: DEFAULT_PRIORITIES,
    locale: 'es',
  });
  return {
    field: analysis.field,
    priorities: DEFAULT_PRIORITIES,
    locale: 'es',
    strategies: analysis.strategies.map(
      ({ id, name, isCurrent, durationMonths, seasons, scores, confidence }) => ({
        id,
        name,
        isCurrent,
        durationMonths,
        seasons,
        scores,
        confidence,
      }),
    ),
    household: { workers: 2, tenure: 'rent', association: null },
    pace: 'gradual',
  };
}

describe('POST /api/mock/rotations/outlook', () => {
  it('rechaza una petición fuera de contrato con 400', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_request');
  });

  it('rechaza dos estrategias "actuales"', async () => {
    const body = bodyFor('cornbelt-iowa');
    body.strategies = body.strategies.map((s) => ({ ...s, isCurrent: true }));
    expect((await post(body)).status).toBe(400);
  });

  it('finca en Quindío: responde el contrato con el contexto de Colombia', async () => {
    const res = await post(bodyFor('cafe-quindio'));
    expect(res.status).toBe(200);
    const data = OutlookResponse.parse(await res.json());
    expect(data.context.region).toBe('co');
    expect(data.context.placeName).toMatch(/Quindío|QUINDIO/i);
    expect(data.pace).toBe('gradual');
  });

  it('finca fuera de Colombia: solo el contexto mundial', async () => {
    const res = await post(bodyFor('sahel-maradi'));
    const data = OutlookResponse.parse(await res.json());
    expect(data.context.region).toBe('global');
    expect(data.context.placeName).toBeNull();
  });
});
