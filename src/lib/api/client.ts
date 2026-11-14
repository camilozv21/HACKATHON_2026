import type { z } from 'zod';
import { env } from '@/lib/env';

export type ApiErrorKind = 'timeout' | 'network' | 'http' | 'invalid' | 'aborted';

/** Error con un tipo que la UI traduce a un mensaje amable (messages: errors.<kind>). */
export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Con mocks, la app usa los route handlers locales (/api/mock) con el mismo contrato que el backend. */
export const apiBase = () => (env.useMocks || !env.apiBaseUrl ? '/api/mock' : env.apiBaseUrl.replace(/\/$/, ''));

type Options<S extends z.ZodType> = {
  method?: 'GET' | 'POST';
  body?: unknown;
  schema: S;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** fetch tipado: timeout, errores clasificados y validación zod de la respuesta. */
export async function apiFetch<S extends z.ZodType>(path: string, opts: Options<S>): Promise<z.infer<S>> {
  const { method = 'GET', body, schema, timeoutMs = 25_000, signal } = opts;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw new ApiError('aborted', 'Cancelado');
    if (timeout.aborted) throw new ApiError('timeout', `Sin respuesta en ${timeoutMs / 1000} s`);
    throw new ApiError('network', (err as Error).message);
  }

  if (!res.ok) throw new ApiError('http', `HTTP ${res.status}`, res.status, await res.text().catch(() => ''));

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('invalid', 'La respuesta no es JSON');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'production') console.warn('[api] respuesta fuera de contrato', path, parsed.error.issues);
    throw new ApiError('invalid', 'La respuesta no cumple el contrato', res.status, parsed.error.issues);
  }
  return parsed.data;
}
