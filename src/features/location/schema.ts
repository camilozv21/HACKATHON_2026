// zod/mini: misma validación con una fracción del peso; este esquema está en el JS inicial.
import * as z from 'zod/mini';

export const CoarseLocationSchema = z.object({
  lat: z.number().check(z.gte(-90), z.lte(90)),
  lon: z.number().check(z.gte(-180), z.lte(180)),
  city: z.nullable(z.string()),
  region: z.nullable(z.string()),
  country: z.nullable(z.string()),
  accuracy: z.literal('ip'),
  source: z.enum(['vercel', 'ip-service', 'default']),
});
export type CoarseLocation = z.infer<typeof CoarseLocationSchema>;

export type PreciseLocation = {
  lat: number;
  lon: number;
  accuracyM: number;
  accuracy: 'precise';
  at: number;
  /** auto = permiso ya concedido al abrir; user = la persona lo pidió con un toque */
  origin: 'auto' | 'user';
};
