'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Fuel, Landmark, MapPin, Store, Tractor } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import { ListingsResponse, listingsUrl } from '@/lib/api/listings';
import { MarketResponse, marketUrl, type ProductMarket } from '@/lib/api/market';
import { formatCop, formatMonth, formatPct } from './format';
import { OutlookBadge, OutlookSource } from './MarketSection';


async function fetchMarket(lat: number, lon: number, locale: string, signal: AbortSignal) {
  const res = await fetch(marketUrl(lat, lon, locale), { signal });
  if (!res.ok) throw new Error(String(res.status));
  return MarketResponse.parse(await res.json()).market;
}

async function fetchListings(mpio: string, signal: AbortSignal) {
  const res = await fetch(listingsUrl({ mpio, limit: 5 }), { signal });
  if (!res.ok) throw new Error(String(res.status));
  return ListingsResponse.parse(await res.json());
}

function ProductRow({ p }: { p: ProductMarket }) {
  const t = useTranslations('market');
  const tp = useTranslations('products');
  const locale = useLocale();
  const trend = p.change12mPct === null ? null : p.change12mPct >= 10 ? 'up' : p.change12mPct <= -10 ? 'down' : 'flat';
  return (
    <li className="rounded-xl bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-semibold">{tp(p.product as 'cafe')}</p>
        {p.outlook && <OutlookBadge label={p.outlook.label} />}
      </div>
      <p className="mt-1 text-sm">
        {p.priceCopKg !== null && p.market ? t('priceAt', { price: formatCop(p.priceCopKg, locale), market: p.market.name }) : <span className="text-ink-muted">{t('noPrice')}</span>}
        {trend && p.change12mPct !== null && (
          <span className="text-ink-muted">
            {' · '}
            {t(`trend.${trend}`)} ({t('trendPct', { pct: formatPct(p.change12mPct, locale) })})
          </span>
        )}
      </p>
      {p.outlook && <p className="mt-1 text-sm text-ink-muted">{p.outlook.why}</p>}
    </li>
  );
}

/**
 * En el drawer de región (Colombia): precios mayoristas de la central más cercana, tendencias, la conclusión del
 * departamento (IA o reglas) y las fincas que venden en el municipio.
 */
export function MarketNearby({ lat, lon }: { lat: number; lon: number }) {
  const t = useTranslations('market');
  const tl = useTranslations('listings');
  const tp = useTranslations('products');
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ['market', lat.toFixed(2), lon.toFixed(2), locale],
    queryFn: ({ signal }) => fetchMarket(lat, lon, locale, signal),
    staleTime: 30 * 60_000,
  });
  const m = q.data;
  const lq = useQuery({
    queryKey: ['listings', 'mpio', m?.mpioCode],
    queryFn: ({ signal }) => fetchListings(m!.mpioCode, signal),
    enabled: Boolean(m?.mpioCode),
    staleTime: 60_000,
  });
  const products = m ? (all ? m.products : m.products.slice(0, 3)) : [];

  return (
    <section aria-labelledby="market-nearby-title" className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
      <h3 id="market-nearby-title" className="flex items-center gap-2 font-bold">
        <Store aria-hidden className="size-5 text-field-300" />
        {t('nearbyTitle')}
      </h3>

      {q.isPending && <p className="shimmer mt-2 h-20 rounded-xl" aria-label={t('loading')} />}
      {q.isError && (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
          {t('error')}
          <button type="button" onClick={() => q.refetch()} className="min-h-11 rounded-full px-3 font-semibold underline">
            {t('retry')}
          </button>
        </p>
      )}
      {q.isSuccess && !m && <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>}

      {m && (
        <div className="mt-2 flex flex-col gap-3 text-sm">
          {m.nearestMarket && (
            <p className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-field-300" />
              <span>
                {t('nearestMarket', { name: m.nearestMarket.name, km: m.nearestMarket.distanceKm })} <GlossaryLink term="wholesale-price" />
              </span>
            </p>
          )}
          {m.headline && (
            <div className="rounded-xl bg-white/5 p-3">
              {m.outlookBy && <OutlookSource by={m.outlookBy} />}
              <p className="mt-1 font-semibold">{m.headline}</p>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {products.map((p) => (
              <ProductRow key={p.product} p={p} />
            ))}
          </ul>
          {m.products.length > 3 && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              aria-expanded={all}
              className="flex min-h-11 items-center justify-center gap-1.5 self-start rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line hover:bg-white/15"
            >
              {all ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
              {all ? t('less') : t('more')}
            </button>
          )}
          <div className="flex flex-col gap-1 text-xs text-ink-muted lite:hidden">
            {m.trm && m.trm.change12mPct !== null && (
              <p className="flex items-center gap-1.5">
                <Landmark aria-hidden className="size-3.5" />
                {t('trm', { value: formatCop(m.trm.value, locale), pct: formatPct(m.trm.change12mPct, locale) })}
              </p>
            )}
            {m.inputs && m.inputs.fertChange12mPct !== null && (
              <p className="flex items-center gap-1.5">
                <Fuel aria-hidden className="size-3.5" />
                {t('fertilizers', { pct: formatPct(m.inputs.fertChange12mPct, locale) })}
              </p>
            )}
            <p>
              {t('sources', { month: formatMonth(m.asOf.slice(0, 7), locale) })}
              {m.source === 'seed' && ` (${t('seedNote')})`}
            </p>
          </div>

          <div className="border-t border-line pt-3">
            <h4 className="flex items-center gap-2 font-bold">
              <Tractor aria-hidden className="size-4 text-field-300" />
              {tl('nearby.title')}
            </h4>
            {lq.isPending && <p className="shimmer mt-2 h-10 rounded-xl" />}
            {lq.data && lq.data.listings.length === 0 && <p className="mt-1 text-ink-muted">{tl('nearby.empty')}</p>}
            {lq.data && lq.data.listings.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {lq.data.listings.map((l) => (
                  <li key={l.id}>
                    <a
                      href={`/${locale}/fincas/${l.id}`}
                      className="flex min-h-11 items-center gap-2 rounded-xl bg-black/20 px-3 py-2 hover:bg-black/30"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{l.farmName}</span>
                        <span className="block truncate text-xs text-ink-muted">{l.products.map((p) => tp(p.product as 'cafe')).join(', ')}</span>
                      </span>
                      {l.sample && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{tl('card.sample')}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <a href={`/${locale}/fincas?dept=${m.deptCode}`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-field-300 underline underline-offset-4">
              {tl('nearby.seeAll', { place: m.deptName })}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
