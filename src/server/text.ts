import { createHash, timingSafeEqual } from 'node:crypto';

/** Quita lo que pueda identificar a alguien: correos, teléfonos y enlaces. */
export function redact(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\S+@\S+\.\S+/g, '[…]')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[…]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[…]')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resumen irreversible de la IP (o de cualquier clave) para límites anti-abuso. Nunca se guarda la IP. */
export function hashKey(value: string, salt = 'fieldshift'): string {
  return createHash('sha256').update(`${salt}:${value}`).digest('base64url').slice(0, 16);
}

/** sha256 en hex: para guardar tokens de edición sin poder recuperarlos. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Compara dos secretos en tiempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Valida el header `X-FieldShift-Secret` de los trabajos programados (n8n).
 * 503 si el servidor no tiene secreto configurado, 401 si no coincide, null si pasa.
 */
export function checkJobSecret(request: Request, envName = 'MARKET_JOB_SECRET'): { status: 401 | 503 } | null {
  const expected = process.env[envName];
  if (!expected) return { status: 503 };
  const got = request.headers.get('x-fieldshift-secret') ?? '';
  return safeEqual(got, expected) ? null : { status: 401 };
}

/** Quita tildes y pasa a minúsculas: para cruzar nombres de SIPSA, EVA y DIVIPOLA. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}
