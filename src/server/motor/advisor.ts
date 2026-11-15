/**
 * AgroAstro: agente de Claude (Managed Agents) que revisa la salida del motor agronómico ANTES de que llegue al
 * teléfono. Recibe el JSON del motor (recortado) más los datos de la zona de la finca, investiga en la web precios
 * y mercados, y devuelve un informe en Markdown. Solo servidor: usa ANTHROPIC_API_KEY. Ver docs/motor-api.md.
 *
 * Una sesión por revisión: se abre el stream, se manda el mensaje y se lee hasta que el agente termina su turno.
 * Si una herramienta pide confirmación, se niega (nadie supervisa la sesión en este flujo).
 */
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { MotorPlanBase, MotorZone } from '@/lib/api/motor';
import { memo } from '@/server/memo';
import { engineOutputOf } from './normalize';

export const agroAstroConfig = () => ({
  agent: process.env.AGROASTRO_AGENT_ID?.trim() || 'agent_01TLP7dJ64Hy5JgVEH4DdwHL',
  environment: process.env.AGROASTRO_ENVIRONMENT_ID?.trim() || 'env_015T37KfLibazqNiZMNJqPuF',
});

/** Igual que el chat: sin clave o con AGENT_FORCE_MOCK=true (e2e) se usa el asesor de ejemplo. */
export const advisorEnabled = () =>
  process.env.AGENT_FORCE_MOCK?.trim() !== 'true' && Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const TIMEOUT_MS = 240_000;

export class AdvisorError extends Error {
  constructor(
    public kind: 'timeout' | 'stopped' | 'refusal' | 'empty' | 'api',
    message: string,
  ) {
    super(message);
    this.name = 'AdvisorError';
  }
}

export type AdvisorResult = { markdown: string; sessionId: string | null; toolCalls: number };
export type AdvisorActivity = { tool: string };

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pick = (o: J, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

const reasonSlim = (r: unknown) => pick(obj(r), ['rule_id', 'title', 'message', 'effect', 'cautions']);

/**
 * JSON para el agente: la salida del motor sin lo que es contabilidad interna (hashes del bundle, la lista de
 * reglas omitidas, ids de afirmaciones, orientaciones genéricas repetidas por cultivo). Se agregan el municipio y
 * los datos de NASA POWER de la zona de la finca (los del motor pueden tener meses).
 */
export function advisorPayload(record: unknown, zone: MotorZone, place: string | null): J {
  const out = engineOutputOf(record);
  const inference = obj(out.inference);
  const rotation = obj(out.rotation);
  const skipped = arr(inference.rules_skipped).map(obj);
  const missing = [...new Set(skipped.flatMap((s) => arr(s.missing).filter((m): m is string => typeof m === 'string')))];
  const municipio = zone.terrain?.places[0] ?? place;

  return {
    context: { ...obj(out.context), ...(municipio && { municipio }) },
    data_mode: out.data_mode,
    data_source: pick(obj(out.data_source), ['source', 'layers', 'field_values']),
    territory: out.territory,
    input_provenance: out.input_provenance,
    input_state: out.input_state,
    risk_overview: out.risk_overview,
    inference: {
      ...pick(inference, ['status', 'rules_in_catalog', 'rules_evaluated', 'findings_count', 'global_cautions']),
      rules_skipped_summary: {
        missing_input: skipped.filter((s) => s.reason === 'missing_input').length,
        needs_series: skipped.filter((s) => s.reason === 'needs_series').length,
        not_applicable: skipped.filter((s) => s.reason === 'not_applicable_to_context').length,
        missing_variables: missing,
      },
      findings: arr(inference.findings).map((f) =>
        pick(obj(f), [
          'rule_id', 'module', 'title', 'severity', 'confidence', 'why', 'applies_to', 'threshold_status', 'observation',
          'recommendation', 'cautions', 'evidence_basis', 'evidence_status', 'validation_status', 'superseded_by',
          'integrated_in', 'certainty', 'external_sources',
        ]),
      ),
    },
    practices: arr(out.practices).map((p) => pick(obj(p), ['practice_id', 'title', 'text', 'cautions', 'why', 'relevance'])),
    rotation: {
      ...pick(rotation, ['situation', 'lot_findings', 'missing_inputs', 'verify_before_acting', 'global_cautions', 'profile']),
      candidates: arr(rotation.candidates).map((raw) => {
        const c = obj(raw);
        return {
          ...pick(c, ['crop_key', 'crop', 'family', 'status', 'unevaluated']),
          blocking: arr(c.blocking).map(reasonSlim),
          against: arr(c.against).map(reasonSlim),
          in_favor: arr(c.in_favor).map(reasonSlim),
          notes: arr(c.notes).map(reasonSlim),
        };
      }),
    },
    validation_summary: out.validation_summary,
    agent_instructions: out.agent_instructions,
    zona_finca: {
      descripcion: 'Rectángulo de los extremos de la finca; NASA POWER diario (si toca varias celdas, el máximo de cada día).',
      periodo: zone.period,
      celdas_nasa_power: zone.powerCellsOk,
      resumen: zone.summary,
      fuente_pendiente: zone.terrain ? `SRTM por municipio (${zone.terrain.places.join(', ')})` : null,
    },
  };
}

export const advisorMessage = (payload: J) => `Genera una recomendación para este JSON: ${JSON.stringify(payload)}`;

/**
 * Las tablas Markdown (el informe trae "Alternativas" en tabla) se vuelven listas: el teléfono no las dibuja sin
 * remark-gfm, y en 360 px una lista se lee mejor que cuatro columnas.
 */
export function tablesToLists(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const isRow = (l: string | undefined) => l != null && /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l: string | undefined) => l != null && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (isRow(lines[i]) && isSep(lines[i + 1])) {
      const head = cells(lines[i]!);
      i += 2;
      while (i < lines.length && isRow(lines[i])) {
        const row = cells(lines[i]!);
        const rest = row
          .slice(1)
          .map((v, k) => (v ? `${head[k + 1] ? `${head[k + 1]}: ` : ''}${v}` : ''))
          .filter(Boolean);
        out.push(`- **${row[0] ?? ''}**${rest.length ? ` — ${rest.join(' · ')}` : ''}`);
        i++;
      }
      i--;
      continue;
    }
    out.push(lines[i]!);
  }
  return out.join('\n');
}

/** URLs sueltas (las "Fuentes clave" del informe) → autoenlaces `<https://…>` de CommonMark, para que se puedan tocar. */
export function linkBareUrls(md: string): string {
  return md.replace(/(^|[\s])(https?:\/\/[^\s<>()[\]]+?)([.,;:!?]*)(?=\s|$)/gm, (_m, pre: string, url: string, punct: string) => `${pre}<${url}>${punct}`);
}

/** Informe listo para el teléfono: listas en vez de tablas y enlaces que se pueden tocar. */
export const tidyReport = (md: string) => linkBareUrls(tablesToLists(md.trim()));

async function runSession(text: string, onActivity?: (a: AdvisorActivity) => void): Promise<AdvisorResult> {
  const client = new Anthropic();
  const { agent, environment } = agroAstroConfig();
  const session = await client.beta.sessions.create({ agent, environment_id: environment, title: 'Field Shift · plan de rotación' });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  // Primero el stream y después el mensaje: así no se pierde ningún evento.
  const stream = await client.beta.sessions.events.stream(session.id, undefined, { signal: abort.signal });
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: 'user.message', content: [{ type: 'text', text }] }],
  });

  // El informe es el texto que el agente escribe después de su última herramienta.
  let chunks: string[] = [];
  let toolCalls = 0;
  try {
    for await (const event of stream) {
      switch (event.type) {
        case 'agent.message': {
          // Un mensaje con citas web llega partido en varios bloques de texto seguidos: se pegan sin separador.
          const text = event.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
          if (text.trim()) chunks.push(text);
          break;
        }
        case 'agent.tool_use':
        case 'agent.mcp_tool_use':
          toolCalls++;
          chunks = [];
          onActivity?.({ tool: event.name });
          if (event.evaluated_permission === 'ask') {
            await client.beta.sessions.events.send(session.id, {
              events: [
                {
                  type: 'user.tool_confirmation',
                  tool_use_id: event.id,
                  result: 'deny',
                  deny_message: 'Nadie supervisa esta sesión: sigue sin esa acción y termina el informe.',
                },
              ],
            });
          }
          break;
        case 'session.error':
          console.warn('[advisor] error en la sesión:', event.error.type);
          break;
        case 'session.status_idle': {
          const reason = event.stop_reason.type;
          if (reason === 'requires_action') break;
          if (reason === 'refusal') throw new AdvisorError('refusal', 'El agente no quiso responder');
          if (reason !== 'end_turn') throw new AdvisorError('stopped', `El agente se detuvo: ${reason}`);
          const markdown = chunks.join('\n\n').trim();
          if (!markdown) throw new AdvisorError('empty', 'El agente terminó sin informe');
          return { markdown: tidyReport(markdown), sessionId: session.id, toolCalls };
        }
        case 'session.status_terminated':
          throw new AdvisorError('stopped', 'La sesión terminó antes del informe');
      }
    }
    throw new AdvisorError('stopped', 'El stream se cerró antes del informe');
  } catch (err) {
    if (abort.signal.aborted) {
      // Que la sesión deje de gastar: se interrumpe y se informa el tiempo agotado.
      await client.beta.sessions.events.send(session.id, { events: [{ type: 'user.interrupt' }] }).catch(() => undefined);
      throw new AdvisorError('timeout', `AgroAstro no terminó en ${TIMEOUT_MS / 1000} s`);
    }
    if (err instanceof AdvisorError) throw err;
    if (err instanceof Anthropic.APIError) throw new AdvisorError('api', `API ${err.status ?? ''} ${err.name}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Revisión del plan por AgroAstro. Mismo contenido = misma revisión durante 30 min (una sesión compartida: dos
 * pedidos iguales no abren dos sesiones). El progreso (herramientas usadas) solo lo ve el primero que pidió.
 */
export function runAdvisor(text: string, onActivity?: (a: AdvisorActivity) => void): Promise<AdvisorResult> {
  const key = `advisor:${createHash('sha256').update(text).digest('hex')}`;
  return memo(key, 30 * 60_000, () => runSession(text, onActivity));
}

/** Asesor de ejemplo (sin clave o en e2e): arma el informe solo con lo que dijo el motor, sin precios ni compradores. */
export function mockAdvisor(plan: MotorPlanBase, place: string | null): AdvisorResult {
  const top = plan.rotation.candidates.filter((c) => c.status === 'favorecido' || c.status === 'aceptable');
  const last = plan.rotation.history[0]?.join(' + ');
  const findings = plan.findings.filter((f) => !f.superseded);
  const where = place ? ` en ${place}` : '';
  const lines = [
    `**Decisión principal:** ${
      top[0] && last
        ? `después de ${last}, sembrar ${top[0].crop}${where}.`
        : 'antes de decidir, cuéntanos qué sembraste la última vez para que el motor evalúe la rotación.'
    }`,
    '',
    '### 1. Qué recomiendo',
    top.length ? top.slice(0, 2).map((c) => `- ${c.crop}: ${c.reasons[0]?.message || c.reasons[0]?.title || 'opción aceptable'}`).join('\n') : '- Sin opciones evaluadas todavía.',
    '',
    '### 2. Por qué conviene',
    findings.length ? findings.slice(0, 2).map((f) => `- ${f.title} (certeza ${f.certainty}).`).join('\n') : '- El motor no encontró alertas con los datos que hay.',
    '',
    '### 3. Dónde comercializar',
    '- Este es un ejemplo sin conexión a AgroAstro: no consultamos precios ni compradores.',
    '',
    '### 5. Qué hacer ahora',
    plan.rotation.verify.slice(0, 3).map((v) => `- ${v}`).join('\n') || '- Revisa el plan con un técnico de tu zona.',
    '',
    '### 6. Riesgos',
    findings.length ? findings.slice(0, 3).map((f) => `- ${f.title}`).join('\n') : '- Ausencia de alertas no es ausencia de riesgo: faltan datos del lote.',
  ];
  return { markdown: lines.join('\n'), sessionId: null, toolCalls: 0 };
}
