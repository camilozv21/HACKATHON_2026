import { randomBytes } from 'node:crypto';
import type { Listing, ListingProduct } from '@/lib/api/listings';
import type { ProductId } from '@/lib/market/catalog';
import { levelOf } from '@/lib/points';
import { productName, type Loc } from '@/server/market/rules';

/** Registro completo (solo servidor): incluye el teléfono y el hash del token de edición. */
export type ListingRecord = Omit<Listing, 'status' | 'score'> & {
  status: 'active' | 'paused' | 'removed' | 'hidden';
  tokenHash: string;
  /** +573XXXXXXXXX */
  whatsapp: string;
  consentAt: string;
  ipHash: string | null;
  flags: number;
  /** Cuenta dueña (al publicar con sesión o al enlazarla con el token de edición). */
  accountId?: string | null;
};

/** Denuncias de IPs distintas que ocultan una publicación hasta revisarla. */
export const FLAG_LIMIT = 3;

/** Celular colombiano → "+573001234567" (null si no es un celular válido para WhatsApp). */
export function normalizeWhatsapp(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? `+57${d}` : null;
}

const CELL = 0.05;
/** Centro de la celda de 0,05° (~5,5 km) donde cae el punto: la ubicación pública de la finca. */
export function publicPoint(lat: number, lon: number): { lat: number; lon: number } {
  const c = (v: number) => Math.round((Math.floor(v / CELL) * CELL + CELL / 2) * 1000) / 1000;
  return { lat: c(lat), lon: c(lon) };
}

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Id corto y no adivinable (10 caracteres base62). */
export function newListingId(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => B62[b % 62]).join('');
}

/** Token de edición (32 bytes). Solo se guarda su sha256. */
export const newEditToken = () => randomBytes(32).toString('base64url');

export function toPublic(r: ListingRecord, points?: number | null): Listing {
  return {
    id: r.id,
    status: r.status === 'paused' ? 'paused' : 'active',
    farmName: r.farmName,
    description: r.description,
    lat: r.lat,
    lon: r.lon,
    deptCode: r.deptCode,
    mpioCode: r.mpioCode,
    place: r.place,
    areaHa: r.areaHa,
    products: r.products,
    certifications: r.certifications,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    expiresAt: r.expiresAt,
    ...(r.sample ? { sample: true } : {}),
    ...(points != null ? { score: { points, level: levelOf(points).id } } : {}),
  };
}

const label = (p: ListingProduct, l: Loc) => (p.name ? `${productName(p.product as ProductId, l)} (${p.name})` : productName(p.product as ProductId, l));

/** Enlace de WhatsApp con un mensaje prellenado y respetuoso. */
export function waLink(r: Pick<ListingRecord, 'whatsapp' | 'farmName' | 'products'>, l: Loc, product?: string): string {
  const chosen = r.products.find((p) => p.product === product) ?? null;
  const what = chosen ? label(chosen, l) : r.products.slice(0, 3).map((p) => label(p, l)).join(', ');
  const text =
    l === 'en'
      ? `Hello! I saw your farm "${r.farmName}" on Field Shift and I'm interested in: ${what}. Is it still available?`
      : `¡Hola! Vi tu finca "${r.farmName}" en Field Shift y me interesa: ${what}. ¿Todavía está disponible?`;
  return `https://wa.me/${r.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
