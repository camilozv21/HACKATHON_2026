/**
 * "Publicar mi finca": reglas de negocio de las fincas publicadas (las usan las rutas /api/listings, las páginas
 * /fincas y las herramientas del agente).
 *
 * - Solo Colombia por ahora (el municipio sale de DIVIPOLA).
 * - Sin cuentas: quien publica recibe un token de edición (solo se guarda su sha256) y lo guarda su teléfono.
 * - Privacidad: no se guarda el polígono de la finca; el punto público es el centro de una celda de ~5 km;
 *   el WhatsApp nunca sale en la respuesta pública (el contacto redirige con límite de ritmo).
 * - Las publicaciones vencen a los 60 días (se renuevan) y se ocultan con 3 denuncias de IPs distintas.
 * - Los ejemplos de la demo (`sample: true`) no tienen WhatsApp real.
 */
import { LISTING_DAYS, ListingInput, type Listing, type ListingPatch } from '@/lib/api/listings';
import divipolaRaw from '@/server/events/divipola.json';
import { inColombia, nearestMunicipio } from '@/server/events/divipola';
import { pointsForAccounts } from '@/server/accounts/scores';
import { redact, sha256 } from '@/server/text';
import { matches } from './memoryRepo';
import { listingsRepo, type ListingQuery } from './repo';
import { newEditToken, newListingId, normalizeWhatsapp, publicPoint, toPublic, waLink, type ListingRecord } from './validate';

const DAY = 86_400_000;
export const CREATE_LIMIT_PER_HOUR = 3;

/** Ejemplos de la demo (Quindío y Valle). No se guardan: se suman a las consultas. */
export function sampleListings(now = new Date()): ListingRecord[] {
  const t = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const base = {
    status: 'active' as const,
    tokenHash: '',
    whatsapp: '',
    consentAt: t(3),
    ipHash: null,
    flags: 0,
    certifications: [] as ListingRecord['certifications'],
    expiresAt: new Date(now.getTime() + 30 * DAY).toISOString(),
    sample: true,
  };
  const month = (offset: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  return [
    {
      ...base,
      id: 'ejemplo-cafe',
      farmName: 'Finca La Esperanza',
      description: 'Café de ladera con sombrío de guamo y plátano. Beneficio en finca.',
      ...publicPoint(4.52, -75.65),
      deptCode: '63',
      mpioCode: '63130',
      place: 'Calarcá, Quindío',
      areaHa: 4.5,
      products: [
        { product: 'cafe', name: 'pergamino seco', quantity: 40, unit: 'arroba', priceCop: null, available: { from: month(0), to: month(2) } },
        { product: 'platano', name: 'hartón', quantity: 120, unit: 'racimo', priceCop: 18000, available: null },
      ],
      certifications: ['bpa'],
      createdAt: t(6),
      updatedAt: t(2),
    },
    {
      ...base,
      id: 'ejemplo-aguacate',
      farmName: 'Vereda El Placer',
      description: 'Aguacate Hass y mora de castilla. Entregamos en Armenia los sábados.',
      ...publicPoint(4.62, -75.6),
      deptCode: '63',
      mpioCode: '63690',
      place: 'Salento, Quindío',
      areaHa: 2,
      products: [
        { product: 'aguacate', name: 'Hass', quantity: 800, unit: 'kg', priceCop: 7500, available: null },
        { product: 'mora', name: 'de castilla', quantity: 60, unit: 'canastilla', priceCop: null, available: { from: month(1), to: month(3) } },
      ],
      createdAt: t(10),
      updatedAt: t(4),
    },
    {
      ...base,
      id: 'ejemplo-tomate',
      farmName: 'Huerta Los Guaduales',
      description: null,
      ...publicPoint(4.08, -76.2),
      deptCode: '76',
      mpioCode: '76834',
      place: 'Tuluá, Valle del Cauca',
      areaHa: 1.2,
      products: [
        { product: 'tomate', name: 'chonto', quantity: 150, unit: 'canastilla', priceCop: 65000, available: { from: month(0), to: month(1) } },
        { product: 'ahuyama', quantity: 2, unit: 't', priceCop: null, available: null },
      ],
      certifications: ['transicion'],
      createdAt: t(4),
      updatedAt: t(1),
    },
  ];
}

const withSamples = () => process.env.LISTINGS_SAMPLES !== 'false';

/** Puntaje fijo de los ejemplos de la demo (para que se vea cómo luce en el globo y en /fincas). */
const SAMPLE_POINTS: Record<string, number> = { 'ejemplo-cafe': 1240, 'ejemplo-aguacate': 520, 'ejemplo-tomate': 180 };

/** Versión pública de las fincas, con el puntaje de la cuenta dueña de cada una. */
async function withScores(records: ListingRecord[]): Promise<Listing[]> {
  const points = await pointsForAccounts(records.map((r) => r.accountId));
  return records.map((r) => toPublic(r, r.sample ? SAMPLE_POINTS[r.id] : r.accountId ? points.get(r.accountId) : null));
}

export async function listListings(q: ListingQuery): Promise<{ listings: Listing[]; total: number }> {
  const { items, total } = await listingsRepo().list(q);
  const now = (q.now ?? new Date()).toISOString();
  const samples = withSamples() && !q.offset ? sampleListings(q.now).filter((r) => matches(r, q, now)) : [];
  const listings = await withScores([...items, ...samples].slice(0, q.limit ?? 100));
  return { listings, total: total + samples.length };
}

export async function getListingRecord(id: string): Promise<ListingRecord | null> {
  const sample = sampleListings().find((s) => s.id === id);
  if (sample) return withSamples() ? sample : null;
  if (!/^[A-Za-z0-9]{10}$/.test(id)) return null;
  return listingsRepo().get(id);
}

/** Publicación visible (activa o pausada, no vencida ni oculta), o null. */
export async function getListing(id: string, now = new Date()): Promise<Listing | null> {
  const r = await getListingRecord(id);
  if (!r || r.status === 'removed' || r.status === 'hidden' || r.expiresAt <= now.toISOString()) return null;
  const [listing] = await withScores([r]);
  return listing!;
}

export type CreateResult =
  | { ok: true; listing: Listing; token: string }
  | { ok: false; reason: 'invalid' | 'phone' | 'outside' | 'rate' };

export async function createListing(body: unknown, ipHash: string, now = new Date()): Promise<CreateResult> {
  const parsed = ListingInput.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const input = parsed.data;
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) return { ok: false, reason: 'phone' };
  const m = inColombia(input.lat, input.lon) ? nearestMunicipio(input.lat, input.lon, 40) : null;
  if (!m) return { ok: false, reason: 'outside' };
  const repo = listingsRepo();
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  if ((await repo.countRecentByIp(ipHash, since)) >= CREATE_LIMIT_PER_HOUR) return { ok: false, reason: 'rate' };

  const token = newEditToken();
  const at = now.toISOString();
  const rec: ListingRecord = {
    id: newListingId(),
    status: 'active',
    tokenHash: sha256(token),
    farmName: redact(input.farmName).slice(0, 60) || 'Finca',
    description: input.description ? redact(input.description).slice(0, 280) || null : null,
    whatsapp,
    consentAt: at,
    ...publicPoint(input.lat, input.lon),
    deptCode: m.code.slice(0, 2),
    mpioCode: m.code,
    place: `${m.name}, ${m.dept}`,
    areaHa: input.areaHa ? Math.round(input.areaHa * 10) / 10 : null,
    products: input.products.map((p) => ({ ...p, name: p.name ? redact(p.name).slice(0, 40) || undefined : undefined })),
    certifications: [...new Set(input.certifications)],
    ipHash,
    flags: 0,
    createdAt: at,
    updatedAt: at,
    expiresAt: new Date(now.getTime() + LISTING_DAYS * DAY).toISOString(),
  };
  await repo.create(rec);
  return { ok: true, listing: toPublic(rec), token };
}

export type OwnerResult = { ok: true; listing: Listing | null } | { ok: false; reason: 'not-found' | 'forbidden' };

async function owned(id: string, token: string | null): Promise<{ ok: true; rec: ListingRecord } | { ok: false; reason: 'not-found' | 'forbidden' }> {
  const rec = await getListingRecord(id);
  if (!rec || rec.sample || rec.status === 'removed') return { ok: false, reason: 'not-found' };
  if (!token || sha256(token) !== rec.tokenHash) return { ok: false, reason: 'forbidden' };
  return { ok: true, rec };
}

export async function updateListing(id: string, token: string | null, patch: ListingPatch, now = new Date()): Promise<OwnerResult> {
  const o = await owned(id, token);
  if (!o.ok) return o;
  const next = await listingsRepo().update(id, {
    // Una publicación oculta por denuncias no se reactiva sola.
    ...(patch.status && o.rec.status !== 'hidden' ? { status: patch.status } : {}),
    ...(patch.products ? { products: patch.products.map((p) => ({ ...p, name: p.name ? redact(p.name).slice(0, 40) || undefined : undefined })) } : {}),
    ...(patch.description !== undefined ? { description: redact(patch.description).slice(0, 280) || null } : {}),
    ...(patch.renew ? { expiresAt: new Date(now.getTime() + LISTING_DAYS * DAY).toISOString() } : {}),
    updatedAt: now.toISOString(),
  });
  return { ok: true, listing: next ? toPublic(next) : null };
}

/**
 * Enlaza una publicación a una cuenta (quien tiene el token de edición es el dueño). No se cambia de cuenta: si ya
 * es de otra, no se enlaza. true = queda enlazada a esta cuenta.
 */
export async function claimListing(id: string, token: string, accountId: string): Promise<boolean> {
  const o = await owned(id, token);
  if (!o.ok) return false;
  if (o.rec.accountId && o.rec.accountId !== accountId) return false;
  if (!o.rec.accountId) await listingsRepo().update(id, { accountId, updatedAt: o.rec.updatedAt });
  return true;
}

export async function removeListing(id: string, token: string | null): Promise<OwnerResult> {
  const o = await owned(id, token);
  if (!o.ok) return o;
  await listingsRepo().update(id, { status: 'removed', updatedAt: new Date().toISOString() });
  return { ok: true, listing: null };
}

export async function flagListing(id: string, ipHash: string) {
  const rec = await getListingRecord(id);
  if (!rec || rec.sample) return null;
  return listingsRepo().flag(id, ipHash);
}

/** Enlace de WhatsApp para contactar (null si no existe, no está activa o es un ejemplo). */
export async function contactLink(id: string, locale: 'es' | 'en', product?: string): Promise<string | null | 'sample'> {
  const rec = await getListingRecord(id);
  if (!rec) return null;
  if (rec.sample) return 'sample';
  if (rec.status !== 'active' || rec.expiresAt <= new Date().toISOString() || !rec.whatsapp) return null;
  return waLink(rec, locale, product);
}

/** Departamentos de Colombia (código DANE y nombre) para los filtros del directorio. */
export function departments(): { code: string; name: string }[] {
  const out = new Map<string, string>();
  for (const [code, r] of Object.entries(divipolaRaw as unknown as Record<string, [number, number, string, string]>)) {
    if (!out.has(code.slice(0, 2))) out.set(code.slice(0, 2), r[3]);
  }
  return [...out.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
