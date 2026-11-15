/**
 * Almacén de fincas publicadas: PostgreSQL (`fieldshift.listings`) si hay `DATABASE_URL`; si no, memoria del
 * servidor (desarrollo sin base y e2e). Una escritura que falla en Postgres NUNCA cae a memoria en silencio.
 */
import { dbEnabled } from '@/server/db';
import { memoryRepo } from './memoryRepo';
import { pgRepo } from './pgRepo';
import type { ListingRecord } from './validate';

export type ListingQuery = {
  dept?: string;
  mpio?: string;
  product?: string;
  /** [oeste, sur, este, norte] */
  bbox?: [number, number, number, number];
  limit?: number;
  offset?: number;
  now?: Date;
};

export interface ListingsRepo {
  readonly kind: 'pg' | 'memory';
  create(rec: ListingRecord): Promise<void>;
  get(id: string): Promise<ListingRecord | null>;
  /** Solo publicaciones activas y vigentes. */
  list(q: ListingQuery): Promise<{ items: ListingRecord[]; total: number }>;
  update(
    id: string,
    patch: Partial<Pick<ListingRecord, 'status' | 'products' | 'description' | 'expiresAt' | 'updatedAt' | 'accountId'>>,
  ): Promise<ListingRecord | null>;
  /** Una denuncia por IP; a las 3 la publicación queda oculta hasta revisarla. */
  flag(id: string, ipHash: string): Promise<{ flags: number; hidden: boolean } | null>;
  /** Publicaciones recientes de una IP (límite anti-abuso que sobrevive a varias instancias). */
  countRecentByIp(ipHash: string, sinceIso: string): Promise<number>;
}

export function listingsRepo(): ListingsRepo {
  return dbEnabled() ? pgRepo : memoryRepo;
}
