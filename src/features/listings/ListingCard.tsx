'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ExternalLink, Flag, MessageCircle, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Listing, listingContactUrl } from '@/lib/api/listings';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { ListingDetails } from './ListingDetails';
import { useListingsStore } from './store';

async function fetchListing(id: string, signal: AbortSignal) {
  const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return Listing.parse(((await res.json()) as { listing: unknown }).listing);
}

/** Tarjeta de una finca que vende (al tocarla en el globo): productos, municipio, WhatsApp y "Ver finca". */
export function ListingCard() {
  const t = useTranslations('listings');
  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const id = useListingsStore((s) => s.selectedId);
  const select = useListingsStore((s) => s.select);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reported, setReported] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['listing', id], queryFn: ({ signal }) => fetchListing(id!, signal), enabled: Boolean(id), staleTime: 30_000 });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useListingsStore.getState().select(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!id) return null;
  const l = q.data;
  const report = async () => {
    setReported(id);
    await fetch(`/api/listings/${encodeURIComponent(id)}/flag`, { method: 'POST' }).catch(() => null);
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="listing-card-title"
      className={clsx(
        'panel pointer-events-auto fixed z-40 flex flex-col overflow-hidden shadow-2xl',
        isDesktop
          ? 'bottom-[calc(var(--safe-bottom)+1rem)] left-4 max-h-[70dvh] w-[24rem] rounded-3xl'
          : 'inset-x-0 bottom-0 max-h-[70dvh] rounded-t-[var(--radius-sheet)] pb-[var(--safe-bottom)]',
      )}
    >
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <h2 id="listing-card-title" className="truncate text-lg leading-tight font-bold">
            {l?.farmName ?? '…'}
          </h2>
          {l?.sample && <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">{t('card.sample')}</span>}
        </div>
        <button ref={closeRef} type="button" onClick={() => select(null)} aria-label={t('card.close')} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10">
          <X aria-hidden className="size-5" />
        </button>
      </header>
      <div className="overflow-y-auto overscroll-contain px-4 pb-4">
        {q.isPending && <p className="shimmer h-32 rounded-xl" />}
        {q.isError && <p className="text-sm text-ink-muted">{t('page.notFound')}</p>}
        {l && (
          <div className="flex flex-col gap-3">
            <ListingDetails listing={l} />
            {l.sample ? (
              <p className="rounded-xl bg-white/5 p-3 text-sm text-ink-muted">{t('card.sampleNote')}</p>
            ) : (
              <a
                href={listingContactUrl(l.id, locale)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-bold text-black"
              >
                <MessageCircle aria-hidden className="size-5" />
                {t('card.whatsapp')}
              </a>
            )}
            <a
              href={`/${locale}/fincas/${l.id}`}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line hover:bg-white/15"
            >
              <ExternalLink aria-hidden className="size-4" />
              {t('card.viewFarm')}
            </a>
            {!l.sample && (
              <button
                type="button"
                onClick={report}
                disabled={reported === l.id}
                className="flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-3 text-xs text-ink-muted underline-offset-4 hover:underline disabled:no-underline"
              >
                <Flag aria-hidden className="size-3.5" />
                {reported === l.id ? t('card.reported') : t('card.report')}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
