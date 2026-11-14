/** Fincas publicadas en PostgreSQL (`fieldshift.listings`, migración 002). */
import type { ListingProduct } from '@/lib/api/listings';
import { db, ensureSchema } from '@/server/db';
import type { ListingsRepo } from './repo';
import { FLAG_LIMIT, type ListingRecord } from './validate';

type Row = {
  id: string;
  status: ListingRecord['status'];
  token_hash: string;
  farm_name: string;
  description: string | null;
  whatsapp: string;
  consent_at: Date;
  lat: number;
  lon: number;
  dept_code: string;
  mpio_code: string;
  place: string;
  area_ha: number | null;
  products: ListingProduct[];
  certifications: string[];
  ip_hash: string | null;
  flags: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
};

const iso = (d: Date | string) => (typeof d === 'string' ? new Date(d).toISOString() : d.toISOString());

function fromRow(r: Row): ListingRecord {
  return {
    id: r.id,
    status: r.status,
    tokenHash: r.token_hash,
    farmName: r.farm_name,
    description: r.description,
    whatsapp: r.whatsapp,
    consentAt: iso(r.consent_at),
    lat: Number(r.lat),
    lon: Number(r.lon),
    deptCode: r.dept_code.trim(),
    mpioCode: r.mpio_code.trim(),
    place: r.place,
    areaHa: r.area_ha === null ? null : Number(r.area_ha),
    products: r.products,
    certifications: r.certifications as ListingRecord['certifications'],
    ipHash: r.ip_hash,
    flags: r.flags,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    expiresAt: iso(r.expires_at),
  };
}

async function sql() {
  await ensureSchema();
  return db();
}

export const pgRepo: ListingsRepo = {
  kind: 'pg',
  async create(r) {
    const q = await sql();
    await q`
      insert into fieldshift.listings
        (id, status, token_hash, farm_name, description, whatsapp, consent_at, lat, lon, dept_code, mpio_code, place,
         area_ha, products, certifications, ip_hash, flags, created_at, updated_at, expires_at)
      values
        (${r.id}, ${r.status}, ${r.tokenHash}, ${r.farmName}, ${r.description}, ${r.whatsapp}, ${r.consentAt}, ${r.lat},
         ${r.lon}, ${r.deptCode}, ${r.mpioCode}, ${r.place}, ${r.areaHa}, ${q.json(r.products)},
         coalesce(string_to_array(nullif(${r.certifications.join(',')}, ''), ','), '{}'), ${r.ipHash}, 0,
         ${r.createdAt}, ${r.updatedAt}, ${r.expiresAt})`;
  },
  async get(id) {
    const q = await sql();
    const [row] = await q<Row[]>`select * from fieldshift.listings where id = ${id}`;
    return row ? fromRow(row) : null;
  },
  async list(f) {
    const q = await sql();
    const now = (f.now ?? new Date()).toISOString();
    const [w, s, e, n] = f.bbox ?? [null, null, null, null];
    const where = q`
      status = 'active' and expires_at > ${now}
      ${f.dept ? q`and dept_code = ${f.dept}` : q``}
      ${f.mpio ? q`and mpio_code = ${f.mpio}` : q``}
      ${f.product ? q`and products @> ${q.json([{ product: f.product }])}` : q``}
      ${f.bbox ? q`and lat between ${s} and ${n} and lon between ${w} and ${e}` : q``}`;
    const rows = await q<Row[]>`
      select * from fieldshift.listings where ${where}
      order by updated_at desc limit ${Math.min(f.limit ?? 100, 500)} offset ${f.offset ?? 0}`;
    const [c] = await q<{ count: string }[]>`select count(*)::text as count from fieldshift.listings where ${where}`;
    return { items: rows.map(fromRow), total: Number(c?.count ?? 0) };
  },
  async update(id, p) {
    const q = await sql();
    const [row] = await q<Row[]>`
      update fieldshift.listings set
        status = coalesce(${p.status ?? null}, status),
        products = coalesce(${p.products ? q.json(p.products) : null}::jsonb, products),
        description = case when ${p.description !== undefined} then ${p.description ?? null} else description end,
        expires_at = coalesce(${p.expiresAt ?? null}::timestamptz, expires_at),
        updated_at = coalesce(${p.updatedAt ?? null}::timestamptz, now())
      where id = ${id}
      returning *`;
    return row ? fromRow(row) : null;
  },
  async flag(id, ipHash) {
    const q = await sql();
    return q.begin(async (tx) => {
      const inserted = await tx`
        insert into fieldshift.listing_flags (listing_id, ip_hash) values (${id}, ${ipHash})
        on conflict do nothing returning listing_id`;
      const [row] = inserted.length
        ? await tx<{ flags: number; status: string }[]>`
            update fieldshift.listings
            set flags = flags + 1,
                status = case when flags + 1 >= ${FLAG_LIMIT} and status = 'active' then 'hidden' else status end
            where id = ${id} returning flags, status`
        : await tx<{ flags: number; status: string }[]>`select flags, status from fieldshift.listings where id = ${id}`;
      return row ? { flags: row.flags, hidden: row.status === 'hidden' } : null;
    });
  },
  async countRecentByIp(ipHash, sinceIso) {
    const q = await sql();
    const [c] = await q<{ count: string }[]>`
      select count(*)::text as count from fieldshift.listings where ip_hash = ${ipHash} and created_at >= ${sinceIso}`;
    return Number(c?.count ?? 0);
  },
};
