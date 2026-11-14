import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { AgentRequest, AgentResponse } from '@/lib/api/contract';
import { buildMockAgentResponse } from '@/mocks/agent';
import { claudeAgentEnabled, runClaudeAgent } from '@/server/claudeAgent';
import { clientIp, createRateLimiter } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent — agente de IA del campo. Orden: n8n (si hay N8N_WEBHOOK_URL) → Claude (si hay
 * ANTHROPIC_API_KEY, src/server/claudeAgent.ts) → agente mock local.
 *  - La URL y el secreto del webhook solo viven en variables de servidor (N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET);
 *    nunca llegan al navegador ni se registran en logs.
 *  - Timeout de 30 s, límite simple por IP, validación zod de entrada y salida.
 *  - Sin N8N_WEBHOOK_URL responde un agente mock local con el mismo contrato (desarrollo y demo sin n8n).
 *  - N8N_STREAMING=true queda reservado para pasar a streaming; por ahora se responde JSON (ver docs/agent-contract.md).
 */

const rateLimited = createRateLimiter({ windowMs: 60_000, max: 20 });

/** n8n puede devolver [obj], { output: obj }, { output: "json" } o texto suelto: se normaliza al contrato. */
function normalize(raw: unknown): unknown {
  let r = Array.isArray(raw) ? raw[0] : raw;
  if (r && typeof r === 'object' && 'output' in r) r = (r as { output: unknown }).output;
  if (typeof r === 'string') {
    try {
      return JSON.parse(r);
    } catch {
      return { reply: r };
    }
  }
  return r;
}

export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const parsed = AgentRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });

  const url = process.env.N8N_WEBHOOK_URL?.trim();
  if (!url) {
    // Sin n8n: Claude si hay ANTHROPIC_API_KEY; si falla o no hay clave, el agente mock local.
    if (claudeAgentEnabled()) {
      try {
        const answer = await runClaudeAgent(parsed.data);
        return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store', 'X-Agent': 'claude' } });
      } catch (err) {
        // Solo el tipo y el estado del error: nunca la clave ni el contenido de la conversación.
        const status = err instanceof Anthropic.APIError ? err.status : undefined;
        console.warn('[agent] Claude no respondió, uso el agente local', (err as Error).name, status ?? '');
      }
    } else {
      await new Promise((r) => setTimeout(r, 700));
    }
    return NextResponse.json(AgentResponse.parse(buildMockAgentResponse(parsed.data)), {
      headers: { 'Cache-Control': 'no-store', 'X-Agent': 'mock' },
    });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET ? { 'X-FieldShift-Secret': process.env.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ error: 'agent_http', status: res.status }, { status: 502 });
    const out = AgentResponse.safeParse(normalize(await res.json().catch(() => null)));
    if (!out.success) return NextResponse.json({ error: 'agent_out_of_contract', issues: out.error.issues }, { status: 502 });
    return NextResponse.json(out.data, { headers: { 'Cache-Control': 'no-store', 'X-Agent': 'n8n' } });
  } catch (err) {
    const timeout = (err as Error).name === 'TimeoutError';
    return NextResponse.json({ error: timeout ? 'agent_timeout' : 'agent_unreachable' }, { status: timeout ? 504 : 502 });
  }
}
