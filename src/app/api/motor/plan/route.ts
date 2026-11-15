import { NextResponse } from 'next/server';
import { MotorPlanRequest, type MotorStreamEvent } from '@/lib/api/motor';
import { AdvisorError, advisorEnabled, advisorMessage, advisorPayload, mockAdvisor, runAdvisor } from '@/server/motor/advisor';
import { evaluate, motorConfig, MotorError } from '@/server/motor/client';
import { mockEvaluation } from '@/server/motor/mock';
import { normalizeMotor } from '@/server/motor/normalize';
import { clientIp, createRateLimiter } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
// El asesor investiga en la web: puede tardar varios minutos.
export const maxDuration = 300;

// Cada plan es una evaluación guardada en la base del motor y una sesión de AgroAstro: límite por IP.
const rateLimited = createRateLimiter({ windowMs: 60_000, max: 12 });

/**
 * POST /api/motor/plan — paso 2: plan de rotación.
 *  1. Motor agronómico del equipo (`POST /api/v1/evaluaciones`; sin MOTOR_API_URL, una evaluación de ejemplo).
 *  2. AgroAstro (agente de Claude, Managed Agents) revisa la salida del motor ANTES de servirla.
 * Responde NDJSON (`MotorStreamEvent`): etapas sin datos mientras trabajan, y al final `plan` o `error`.
 * Si el asesor falla, no se sirve el plan sin revisar: se responde `error` y la persona puede reintentar.
 */
export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const parsed = MotorPlanRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  const req = parsed.data;

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: MotorStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // El teléfono cerró la conexión: el trabajo sigue (la revisión queda en caché 30 min) pero ya no se escribe.
          open = false;
        }
      };
      // Mientras el asesor investiga no hay eventos por minutos: un ping cada 15 s mantiene viva la conexión.
      const ping = setInterval(() => send({ t: 'ping' }), 15_000);
      try {
        send({ t: 'stage', stage: 'motor' });
        const real = Boolean(motorConfig().url);
        const { record, accepted } = real ? await evaluate(req) : { record: mockEvaluation(req), accepted: 'full' as const };
        const base = normalizeMotor(record, { source: real ? 'motor' : 'mock', accepted });

        send({ t: 'stage', stage: 'advisor' });
        let count = 0;
        const advisor = advisorEnabled()
          ? {
              source: 'agent' as const,
              ...(await runAdvisor(advisorMessage(advisorPayload(record, req.zone, req.place)), ({ tool }) =>
                send({ t: 'activity', tool: tool.slice(0, 80), count: ++count }),
              )),
            }
          : { source: 'mock' as const, ...mockAdvisor(base, req.place) };

        send({ t: 'plan', plan: { ...base, advisor } });
      } catch (err) {
        if (err instanceof MotorError) {
          console.warn('[motor] sin plan:', err.kind, err.status ?? '', err.message);
          send({ t: 'error', error: `motor_${err.kind}`, status: err.kind === 'timeout' ? 504 : err.status === 422 ? 422 : 502 });
        } else if (err instanceof AdvisorError) {
          console.warn('[advisor] sin revisión:', err.kind, err.message);
          send({ t: 'error', error: `advisor_${err.kind}`, status: err.kind === 'timeout' ? 504 : 502 });
        } else {
          // Respuesta del motor fuera de contrato u otro error inesperado.
          console.warn('[motor] error inesperado:', (err as Error).name, (err as Error).message.slice(0, 300));
          send({ t: 'error', error: 'motor_invalid', status: 502 });
        }
      } finally {
        clearInterval(ping);
        if (open) controller.close();
        open = false;
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Sin buffer en proxies: las etapas tienen que llegar a medida que pasan.
      'X-Accel-Buffering': 'no',
    },
  });
}
