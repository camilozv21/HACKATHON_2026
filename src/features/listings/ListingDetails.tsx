'use client';

import { BadgeCheck, CalendarRange, MapPin, Package } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatCop, formatMonth, formatNumber } from '@/features/market/format';
import type { Listing, ListingProduct } from '@/lib/api/listings';

/** Línea de un producto publicado: nombre, cantidad, precio y ventana de cosecha. */
export function ProductLine({ p }: { p: ListingProduct }) {
  const t = useTranslations('listings.card');
  const tp = useTranslations('products');
  const tu = useTranslations('unitsShort');
  const locale = useLocale();
  const unit = tu(p.unit);
  return (
    <li className="rounded-xl bg-black/20 p-3">
      <p className="font-semibold">
        {tp(p.product)}
        {p.name && <span className="font-normal text-ink-muted"> · {p.name}</span>}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span>{p.priceCop !== null ? t('priceUnit', { price: formatCop(p.priceCop, locale), unit }) : t('priceAgree')}</span>
        {p.quantity !== null && (
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <Package aria-hidden className="size-3.5" />
            {t('quantity', { quantity: formatNumber(p.quantity, locale, 1), unit })}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-ink-muted">
          <CalendarRange aria-hidden className="size-3.5" />
          {p.available ? t('availableRange', { from: formatMonth(p.available.from, locale), to: formatMonth(p.available.to, locale) }) : t('availableNow')}
        </span>
      </p>
    </li>
  );
}

/** Cuerpo común de una publicación (tarjeta del globo, vista previa del formulario). */
export function ListingDetails({ listing }: { listing: Pick<Listing, 'place' | 'areaHa' | 'products' | 'certifications' | 'description'> }) {
  const t = useTranslations('listings');
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
        <MapPin aria-hidden className="size-4 text-field-300" />
        <span>{listing.place}</span>
        {listing.areaHa !== null && <span>· {t('card.area', { area: formatNumber(listing.areaHa, locale) })}</span>}
        <span className="text-xs">· {t('card.approx')}</span>
      </p>
      <ul className="flex flex-col gap-2">
        {listing.products.map((p, i) => (
          <ProductLine key={`${p.product}-${i}`} p={p} />
        ))}
      </ul>
      {listing.description && <p>{listing.description}</p>}
      {listing.certifications.length > 0 && (
        <div>
          <ul className="flex flex-wrap gap-1.5">
            {listing.certifications.map((c) => (
              <li key={c} className="inline-flex items-center gap-1 rounded-full bg-field-500/15 px-2.5 py-1 text-xs font-semibold text-field-300">
                <BadgeCheck aria-hidden className="size-3.5" />
                {t(`certs.${c}`)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-faint">{t('card.certNote')}</p>
        </div>
      )}
    </div>
  );
}
