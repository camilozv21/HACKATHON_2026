import { ArrowLeft, Globe2, Info, MessageCircle, Store } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { formatCop, formatDate, formatMonth, formatPct } from '@/features/market/format';
import gibsMeta from '@/features/layers/gibs-meta.json';
import { ListingDetails } from '@/features/listings/ListingDetails';
import { ZoneChange } from '@/features/listings/ZoneChange';
import { NDVI_LAYER, ndviYears } from '@/features/listings/zoneImagery';
import { listingContactUrl } from '@/lib/api/listings';
import type { ProductId } from '@/lib/market/catalog';
import { getListing } from '@/server/listings';
import { marketForPoint, type MarketArea } from '@/server/market';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ ejemplo?: string }> };

/** Mes del último NDVI de NASA y los años que lo tienen (para comparar siempre el mismo mes). */
function ndviInfo() {
  const meta = (gibsMeta as { layers: Record<string, { defaultTime: string; ranges: string[] }> }).layers[NDVI_LAYER];
  if (!meta) return null;
  const month = Number(meta.defaultTime.slice(5, 7));
  return { month, years: ndviYears(meta.ranges, month) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const listing = await getListing(id).catch(() => null);
  const t = await getTranslations({ locale, namespace: 'listings.page' });
  const tp = await getTranslations({ locale, namespace: 'products' });
  if (!listing) return { title: t('notFound'), robots: { index: false } };
  return {
    title: `${listing.farmName} · ${listing.place}`,
    description: listing.products.map((p) => tp(p.product)).join(', '),
    robots: { index: false },
  };
}

async function MarketBlock({ m, products, locale }: { m: MarketArea; products: string[]; locale: string }) {
  const t = await getTranslations('listings.page');
  const tm = await getTranslations('market');
  const tp = await getTranslations('products');
  const rows = m.products.filter((p) => products.includes(p.product) && p.priceCopKg !== null).slice(0, 4);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="mk" className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
      <h2 id="mk" className="mb-2 flex items-center gap-2 font-bold">
        <Store aria-hidden className="size-5 text-field-300" />
        {t('marketTitle')}
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.map((p) => (
          <li key={p.product} className="rounded-xl bg-black/20 p-3">
            <p className="font-semibold">{tp(p.product as ProductId)}</p>
            <p>
              {tm('priceAt', { price: formatCop(p.priceCopKg!, locale), market: p.market?.name ?? '' })}
              {p.change12mPct !== null && <span className="text-ink-muted"> · {tm('trendPct', { pct: formatPct(p.change12mPct, locale) })}</span>}
            </p>
            {p.outlook && <p className="mt-1 text-ink-muted">{p.outlook.why}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-faint">{tm('sources', { month: formatMonth(m.asOf.slice(0, 7), locale) })}</p>
    </section>
  );
}

/** Página pública de una finca que vende: productos, comparador de la zona aproximada en el tiempo (foto satelital y
 * verdor NASA), precios de referencia y botón de WhatsApp (pasa por /contact: el teléfono no está en el HTML). */
export default async function FincaPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const listing = await getListing(id).catch(() => null);
  if (!listing) notFound();
  const t = await getTranslations('listings');
  const market = await marketForPoint({
    lat: listing.lat,
    lon: listing.lon,
    locale: locale === 'en' ? 'en' : 'es',
    products: listing.products.map((p) => p.product),
  }).catch(() => null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-12">
      <nav className="flex flex-wrap gap-2">
        <a href={`/${locale}/fincas`} className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/15">
          <ArrowLeft aria-hidden className="size-4" />
          {t('page.title')}
        </a>
        <a
          href={`/${locale}?lat=${listing.lat}&lon=${listing.lon}&z=9&shop=1&listing=${listing.id}`}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
        >
          <Globe2 aria-hidden className="size-4" />
          {t('page.seeOnGlobe')}
        </a>
      </nav>

      {(listing.sample || sp.ejemplo === '1') && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-sun/15 p-3 text-sm font-semibold ring-1 ring-sun/40">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('page.sampleBanner')}
        </p>
      )}

      <header>
        <p className="text-xs font-semibold tracking-wider text-field-300 uppercase">{t('page.title')}</p>
        <h1 className="text-3xl leading-tight font-bold">{listing.farmName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t('page.published', { date: formatDate(listing.createdAt, locale) })} · {t('page.expires', { date: formatDate(listing.expiresAt, locale) })}
        </p>
      </header>

      {listing.status === 'paused' && <p className="rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">{t('manage.paused')}</p>}

      <section aria-labelledby="pr" className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
        <h2 id="pr" className="mb-3 font-bold">
          {t('page.products')}
        </h2>
        <ListingDetails listing={listing} />
        {!listing.sample && listing.status === 'active' && (
          <a
            href={listingContactUrl(listing.id, locale)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-bold text-black"
          >
            <MessageCircle aria-hidden className="size-5" />
            {t('card.whatsapp')}
          </a>
        )}
      </section>

      <ZoneChange lat={listing.lat} lon={listing.lon} ndvi={ndviInfo()} />

      {market && <MarketBlock m={market} products={listing.products.map((p) => p.product)} locale={locale} />}

      <p className="text-xs text-ink-faint">{t('page.disclaimer')}</p>
    </main>
  );
}
