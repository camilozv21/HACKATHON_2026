import { ArrowLeft, MapPin, Store } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FarmScore } from '@/features/points/FarmScore';
import { isProductId, PRODUCT_IDS } from '@/lib/market/catalog';
import { departments, listListings } from '@/server/listings';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ dept?: string; product?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'listings.page' });
  return { title: t('title'), description: t('subtitle'), robots: { index: false } };
}

/** Directorio de fincas que venden (Colombia), con filtros por departamento y producto (formulario sin JS). */
export default async function FincasPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('listings.page');
  const tl = await getTranslations('listings');
  const tp = await getTranslations('products');
  const tpts = await getTranslations('points');
  const dept = sp.dept && /^\d{2}$/.test(sp.dept) ? sp.dept : undefined;
  const product = isProductId(sp.product) ? sp.product : undefined;
  let data: Awaited<ReturnType<typeof listListings>> | null = null;
  try {
    data = await listListings({ dept, product, limit: 100 });
  } catch {
    data = null;
  }
  const depts = departments();
  const products = [...PRODUCT_IDS].sort((a, b) => tp(a).localeCompare(tp(b), locale));
  const select = 'mt-1 min-h-12 w-full rounded-xl bg-black/30 px-3 ring-1 ring-line';

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-12">
      <a href={`/${locale}?shop=1`} className="flex min-h-11 items-center gap-1.5 self-start rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/15">
        <ArrowLeft aria-hidden className="size-4" />
        {t('backToGlobe')}
      </a>
      <header>
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-field-300 uppercase">
          <Store aria-hidden className="size-4" />
          Field Shift
        </p>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-ink-muted">{t('subtitle')}</p>
      </header>

      <form method="get" className="grid gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-line sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-semibold">
          {t('dept')}
          <select name="dept" defaultValue={dept ?? ''} className={select}>
            <option value="">{t('all')}</option>
            {depts.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t('product')}
          <select name="product" defaultValue={product ?? ''} className={select}>
            <option value="">{t('all')}</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {tp(p)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-12 rounded-full bg-field-500 px-6 font-bold text-black">
          {t('filter')}
        </button>
      </form>

      {data === null ? (
        <p className="text-ink-muted">{tl('dialog.errors.storage')}</p>
      ) : (
        <section aria-live="polite">
          <p className="mb-2 text-sm text-ink-muted">{t('count', { count: data.total })}</p>
          {data.listings.length === 0 ? (
            <p className="rounded-2xl bg-white/5 p-4 text-ink-muted ring-1 ring-line">{t('empty')}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.listings.map((l) => (
                <li key={l.id}>
                  <a href={`/${locale}/fincas/${l.id}`} className="flex h-full flex-col gap-2 rounded-2xl bg-white/5 p-4 ring-1 ring-line hover:bg-white/10">
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-lg leading-tight font-bold">{l.farmName}</span>
                      {l.sample && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">{tl('card.sample')}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                      <MapPin aria-hidden className="size-4 text-field-300" />
                      {l.place}
                    </span>
                    {l.score && (
                      <span>
                        <FarmScore points={l.score.points} level={l.score.level} size="sm" />
                      </span>
                    )}
                    <span className="flex flex-wrap gap-1.5">
                      {l.products.map((p, i) => (
                        <span key={i} className="rounded-full bg-field-500/15 px-2.5 py-1 text-xs font-semibold text-field-300">
                          {tp(p.product)}
                        </span>
                      ))}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p className="text-xs text-ink-faint">{t('disclaimer')}</p>
      <p className="text-xs text-ink-faint">{tpts('farm.what')}</p>
    </main>
  );
}
