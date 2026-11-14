import { beforeAll, describe, expect, it } from 'vitest';
import { Listing } from '@/lib/api/listings';
import { sha256 } from '@/server/text';
import { contactLink, createListing, flagListing, getListing, listListings, removeListing, updateListing } from './index';
import { normalizeWhatsapp, publicPoint, waLink } from './validate';

beforeAll(() => {
  process.env.DATABASE_URL = '';
});

const input = (over: Record<string, unknown> = {}) => ({
  farmName: 'Finca El Roble',
  description: 'Plátano y café. Llámame al 300 123 4567 o escribe a yo@correo.com',
  whatsapp: '300 123 4567',
  lat: 4.5312,
  lon: -75.6431,
  areaHa: 3.25,
  products: [{ product: 'platano', name: 'hartón', quantity: 50, unit: 'racimo', priceCop: 18000, available: null }],
  certifications: ['bpa'],
  consent: true,
  ...over,
});

describe('validación', () => {
  it('WhatsApp: solo celulares colombianos', () => {
    expect(normalizeWhatsapp('300 123 4567')).toBe('+573001234567');
    expect(normalizeWhatsapp('+57 (310) 555-1234')).toBe('+573105551234');
    expect(normalizeWhatsapp('573105551234')).toBe('+573105551234');
    expect(normalizeWhatsapp('601 555 1234')).toBeNull();
    expect(normalizeWhatsapp('12345')).toBeNull();
  });

  it('punto público: centro de la celda de ~5 km', () => {
    expect(publicPoint(4.5312, -75.6431)).toEqual({ lat: 4.525, lon: -75.625 });
    expect(publicPoint(4.5499, -75.6001)).toEqual({ lat: 4.525, lon: -75.625 });
  });

  it('enlace de WhatsApp con mensaje prellenado', () => {
    const link = waLink({ whatsapp: '+573001234567', farmName: 'El Roble', products: input().products as never }, 'es', 'platano');
    expect(link.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    expect(decodeURIComponent(link)).toContain('plátano (hartón)');
  });
});

describe('publicar (memoria)', () => {
  it('guarda sin teléfono público, con ubicación aproximada y texto limpio', async () => {
    const res = await createListing(input(), 'ip-a');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Listing.safeParse(res.listing).success).toBe(true);
    expect(JSON.stringify(res.listing)).not.toContain('300');
    expect(res.listing.description).not.toContain('correo');
    expect(res.listing.place).toContain('Quindío');
    expect(res.listing.lat).toBe(4.525);
    expect(res.listing.areaHa).toBe(3.3);
    expect(res.token.length).toBeGreaterThan(30);
    expect(res.token).not.toBe(sha256(res.token));
    const again = await getListing(res.listing.id);
    expect(again?.farmName).toBe('Finca El Roble');
    const link = await contactLink(res.listing.id, 'es');
    expect(link).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
  });

  it('rechaza fuera de Colombia, sin consentimiento o con teléfono inválido', async () => {
    expect(await createListing(input({ lat: 42, lon: -93 }), 'ip-b')).toEqual({ ok: false, reason: 'outside' });
    expect(await createListing(input({ consent: false }), 'ip-b')).toEqual({ ok: false, reason: 'invalid' });
    expect(await createListing(input({ whatsapp: '601 555 1234' }), 'ip-b')).toEqual({ ok: false, reason: 'phone' });
  });

  it('máximo 3 publicaciones por hora por IP', async () => {
    for (let i = 0; i < 3; i++) expect((await createListing(input(), 'ip-c')).ok).toBe(true);
    expect(await createListing(input(), 'ip-c')).toEqual({ ok: false, reason: 'rate' });
  });

  it('solo quien tiene el token edita o retira', async () => {
    const res = await createListing(input(), 'ip-d');
    if (!res.ok) throw new Error('no se creó');
    const id = res.listing.id;
    expect(await updateListing(id, 'otro-token', { status: 'paused' })).toEqual({ ok: false, reason: 'forbidden' });
    const paused = await updateListing(id, res.token, { status: 'paused' });
    expect(paused.ok && paused.listing?.status).toBe('paused');
    expect(await contactLink(id, 'es')).toBeNull();
    expect((await removeListing(id, res.token)).ok).toBe(true);
    expect(await getListing(id)).toBeNull();
  });

  it('3 denuncias de IPs distintas la ocultan; repetir IP no cuenta', async () => {
    const res = await createListing(input(), 'ip-e');
    if (!res.ok) throw new Error('no se creó');
    const id = res.listing.id;
    await flagListing(id, 'x');
    await flagListing(id, 'x');
    expect((await flagListing(id, 'y'))?.hidden).toBe(false);
    expect((await flagListing(id, 'z'))?.hidden).toBe(true);
    expect(await getListing(id)).toBeNull();
  });

  it('la lista incluye los ejemplos (sin WhatsApp) y filtra por producto y departamento', async () => {
    const { listings } = await listListings({ dept: '63', product: 'cafe' });
    expect(listings.some((l) => l.sample && l.id === 'ejemplo-cafe')).toBe(true);
    expect(listings.every((l) => l.deptCode === '63' && l.products.some((p) => p.product === 'cafe'))).toBe(true);
    expect(await contactLink('ejemplo-cafe', 'es')).toBe('sample');
  });
});
