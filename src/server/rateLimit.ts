/**
 * Límite simple por IP en memoria (una ventana fija por clave). Suficiente para la demo y para frenar abusos
 * de las rutas que llaman a la IA; en varias instancias cada una cuenta por su lado.
 */
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { start: number; count: number }>();
  return function rateLimited(key: string) {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 5000) hits.clear();
      return false;
    }
    h.count++;
    return h.count > max;
  };
}

/** IP de quien llama (proxy de Vercel u otro), o 'local' en desarrollo. */
export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}
