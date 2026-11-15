// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MotorZone } from '@/lib/api/motor';
import sample from '@/mocks/motor/sample.json';

type Ev = Record<string, unknown>;
const h = vi.hoisted(() => ({
  script: [] as Record<string, unknown>[],
  sent: [] as unknown[],
  created: 0,
}));

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    beta = {
      sessions: {
        create: async () => {
          h.created++;
          return { id: `sesn_${h.created}` };
        },
        events: {
          stream: async () =>
            (async function* () {
              for (const e of h.script) yield e;
            })(),
          send: async (_id: string, body: { events: unknown[] }) => {
            h.sent.push(...body.events);
            return {};
          },
        },
      },
    };
  }
  return { default: Anthropic };
});

const { advisorPayload, linkBareUrls, runAdvisor, tablesToLists, AdvisorError } = await import('./advisor');

const zone: MotorZone = {
  bbox: [-76.08, 6.64, -76.07, 6.65],
  center: [-76.075, 6.645],
  point: false,
  powerCells: 1,
  powerCellsOk: 1,
  period: { start: '2026-08-15', end: '2026-11-12' },
  days: [],
  summary: { temperature: 21, tmax7d: 26, relativeHumidity: 90, rain7d: 75, rain30d: 300, soilMoisture: 94, elevationM: 1256, slopePct: 21.5, flatPct: 0.3 },
  terrain: { places: ['Abriaquí'], synthetic: false },
};

const idle = (type: string): Ev => ({ type: 'session.status_idle', stop_reason: { type } });
const msg = (text: string): Ev => ({ type: 'agent.message', content: [{ type: 'text', text }] });

beforeEach(() => {
  h.script = [];
  h.sent = [];
  h.created = 0;
});

describe('AgroAstro revisa la salida del motor', () => {
  it('el JSON para el agente va recortado, con el municipio y los datos de la zona', () => {
    const payload = advisorPayload({ id: 1, resultado: sample }, zone, 'Abriaquí, Colombia');
    expect(payload.context).toMatchObject({ crop_key: 'frijol', municipio: 'Abriaquí' });
    expect(payload.agent_instructions).toBeTruthy();
    expect(payload.zona_finca).toMatchObject({ celdas_nasa_power: 1, resumen: { rain7d: 75 } });
    const inference = payload.inference as { findings: unknown[]; rules_skipped?: unknown; rules_skipped_summary: { missing_variables: string[] } };
    expect(inference.rules_skipped).toBeUndefined();
    expect(inference.rules_skipped_summary.missing_variables.length).toBeGreaterThan(0);
    expect(inference.findings).toHaveLength(2);
    const text = JSON.stringify(payload);
    expect(text).not.toContain('sha256');
    expect(text).not.toContain('general_guidance');
    expect(text.length).toBeLessThan(JSON.stringify(sample).length);
  });

  it('las tablas del informe se vuelven listas (se leen en 360 px y no necesitan remark-gfm)', () => {
    const md = ['## 4 Alternativas', '| Cultivo | Precio | Riesgo |', '|---|:---:|---|', '| Fríjol | $5.000/kg | Medio |', '| Maíz | | Alto |', '', 'Fin'].join('\n');
    expect(tablesToLists(md)).toBe(
      ['## 4 Alternativas', '- **Fríjol** — Precio: $5.000/kg · Riesgo: Medio', '- **Maíz** — Riesgo: Alto', '', 'Fin'].join('\n'),
    );
  });

  it('las URL sueltas de "Fuentes clave" se vuelven enlaces; los enlaces Markdown no se tocan', () => {
    const md = '- https://www.agronet.gov.co/precios.\n- [SIPSA](https://www.dane.gov.co/sipsa) y https://upra.gov.co, otra';
    expect(linkBareUrls(md)).toBe('- <https://www.agronet.gov.co/precios>.\n- [SIPSA](https://www.dane.gov.co/sipsa) y <https://upra.gov.co>, otra');
  });

  it('el informe es lo que escribe después de su última herramienta; una confirmación pendiente se niega', async () => {
    h.script = [
      msg('Voy a buscar precios en SIPSA.'),
      { type: 'agent.tool_use', id: 'sevt_1', name: 'web_search', evaluated_permission: 'allow' },
      msg('Ahora reviso Agronet.'),
      { type: 'agent.tool_use', id: 'sevt_2', name: 'web_fetch', evaluated_permission: 'ask' },
      idle('requires_action'),
      // Con citas web, un mensaje llega en varios bloques: van pegados, no en párrafos sueltos.
      { type: 'agent.message', content: [{ type: 'text', text: '**Decisión principal:** sembrar ' }, { type: 'text', text: 'fríjol' }, { type: 'text', text: '.' }] },
      msg('| A | B |\n|---|---|\n| x | y |'),
      idle('end_turn'),
    ];
    const tools: string[] = [];
    const r = await runAdvisor('caso-1', ({ tool }) => tools.push(tool));
    expect(r.markdown).toBe('**Decisión principal:** sembrar fríjol.\n\n- **x** — B: y');
    expect(r.toolCalls).toBe(2);
    expect(r.sessionId).toBe('sesn_1');
    expect(tools).toEqual(['web_search', 'web_fetch']);
    // Primero el mensaje del usuario; luego la negación de la herramienta que pidió permiso.
    expect(h.sent[0]).toMatchObject({ type: 'user.message' });
    expect(h.sent[1]).toMatchObject({ type: 'user.tool_confirmation', tool_use_id: 'sevt_2', result: 'deny' });
  });

  it('si el agente se niega o se queda sin informe, no hay plan (error claro)', async () => {
    h.script = [msg('x'), idle('refusal')];
    await expect(runAdvisor('caso-2')).rejects.toBeInstanceOf(AdvisorError);
    h.script = [idle('end_turn')];
    await expect(runAdvisor('caso-3')).rejects.toMatchObject({ kind: 'empty' });
  });

  it('dos pedidos iguales comparten una sola sesión', async () => {
    h.script = [msg('Informe'), idle('end_turn')];
    const [a, b] = await Promise.all([runAdvisor('caso-4'), runAdvisor('caso-4')]);
    expect(a.markdown).toBe('Informe');
    expect(b).toBe(a);
    expect(h.created).toBe(1);
  });
});
