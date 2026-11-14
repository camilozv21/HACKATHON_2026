/**
 * Contrato de las fincas publicadas ("Publicar mi finca"): `/api/listings`, `/api/listings/[id]`.
 * zod completo: solo para chunks diferidos (formulario de publicación, capa del globo, páginas /fincas).
 *
 * Privacidad: el teléfono NUNCA sale en estas respuestas (el botón de WhatsApp pasa por
 * `/api/listings/[id]/contact`) y la ubicación pública es el centro de una celda de ~5 km, con el municipio.
 */
import { z } from 'zod';
import { LISTING_UNITS, PRODUCT_IDS } from '@/lib/market/catalog';

export const CERTIFICATIONS = ['organico', 'bpa', 'comercio-justo', 'rainforest', 'transicion'] as const;
export type Certification = (typeof CERTIFICATIONS)[number];

const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const ListingProduct = z.object({
  product: z.enum(PRODUCT_IDS),
  /** Variedad o presentación en palabras del agricultor: "pergamino seco", "hartón". */
  name: z.string().trim().max(40).optional(),
  /** Cantidad disponible en la unidad elegida (null = no la dice). */
  quantity: z.number().positive().max(1_000_000).nullable(),
  unit: z.enum(LISTING_UNITS),
  /** Precio por unidad en pesos (null = a convenir). */
  priceCop: z.number().int().positive().max(100_000_000).nullable(),
  /** Ventana de cosecha (YYYY-MM); null = disponible ya. */
  available: z.object({ from: YearMonth, to: YearMonth }).nullable(),
});
export type ListingProduct = z.infer<typeof ListingProduct>;

export const ListingInput = z.object({
  farmName: z.string().trim().min(2).max(60),
  description: z.string().trim().max(280).optional(),
  /** Celular colombiano para WhatsApp (3XX XXX XXXX, con o sin +57). */
  whatsapp: z.string().trim().min(10).max(20),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  areaHa: z.number().positive().max(100_000).nullable().optional(),
  products: z.array(ListingProduct).min(1).max(8),
  certifications: z.array(z.enum(CERTIFICATIONS)).max(CERTIFICATIONS.length).default([]),
  /** Consentimiento explícito (Ley 1581 de 2012): mostrar la publicación y contactar por WhatsApp. */
  consent: z.literal(true),
});
export type ListingInput = z.input<typeof ListingInput>;

export const ListingStatus = z.enum(['active', 'paused']);

/** Publicación tal como la ve cualquiera (sin teléfono ni ubicación exacta). */
export const Listing = z.object({
  id: z.string(),
  status: ListingStatus,
  farmName: z.string(),
  description: z.string().nullable(),
  /** Centro de la celda de ~5 km donde está la finca (no su ubicación exacta). */
  lat: z.number(),
  lon: z.number(),
  deptCode: z.string(),
  mpioCode: z.string(),
  /** "Calarcá, Quindío". */
  place: z.string(),
  areaHa: z.number().nullable(),
  products: z.array(ListingProduct),
  certifications: z.array(z.enum(CERTIFICATIONS)),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  /** Publicación de ejemplo de la demo: no tiene WhatsApp real. */
  sample: z.boolean().optional(),
});
export type Listing = z.infer<typeof Listing>;

export const ListingsResponse = z.object({ listings: z.array(Listing), total: z.number() });
export type ListingsResponse = z.infer<typeof ListingsResponse>;

/** Respuesta al publicar: el token de edición se muestra UNA vez y se guarda en el teléfono. */
export const CreateListingResponse = z.object({ listing: Listing, token: z.string() });

export const ListingPatch = z.object({
  status: ListingStatus.optional(),
  products: z.array(ListingProduct).min(1).max(8).optional(),
  description: z.string().trim().max(280).optional(),
  /** Renueva la vigencia 60 días más. */
  renew: z.literal(true).optional(),
});
export type ListingPatch = z.infer<typeof ListingPatch>;

export const LISTING_DAYS = 60;

export function listingsUrl(q: { dept?: string; mpio?: string; product?: string; bbox?: [number, number, number, number]; limit?: number } = {}) {
  const p = new URLSearchParams();
  if (q.dept) p.set('dept', q.dept);
  if (q.mpio) p.set('mpio', q.mpio);
  if (q.product) p.set('product', q.product);
  if (q.bbox) p.set('bbox', q.bbox.map((n) => n.toFixed(2)).join(','));
  if (q.limit) p.set('limit', String(q.limit));
  const s = p.toString();
  return `/api/listings${s ? `?${s}` : ''}`;
}

export const listingContactUrl = (id: string, locale: string, product?: string) =>
  `/api/listings/${encodeURIComponent(id)}/contact?locale=${locale}${product ? `&product=${encodeURIComponent(product)}` : ''}`;
