'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pause, Play, RefreshCw, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/components/ui/toast';
import { formatDate } from '@/features/market/format';
import { Listing, type ListingPatch } from '@/lib/api/listings';
import { ListingDetails } from './ListingDetails';
import { useListingsStore } from './store';

/** "Mi publicación": la persona que publicó la pausa, la renueva o la borra con la llave guardada en su teléfono. */
export function MyListingPanel() {
  const t = useTranslations('listings');
  const locale = useLocale();
  const ids = useId();
  const qc = useQueryClient();
  const id = useListingsStore((s) => s.manageId)!;
  const mine = useListingsStore((s) => s.mine.find((m) => m.id === s.manageId));
  const close = () => useListingsStore.getState().openManage(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const q = useQuery({
    queryKey: ['listing', id],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(String(res.status));
      return Listing.parse(((await res.json()) as { listing: unknown }).listing);
    },
  });

  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useListingsStore.getState().openManage(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const auth = { Authorization: `Bearer ${mine?.token ?? ''}`, 'Content-Type': 'application/json' };
  const patch = async (body: ListingPatch) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      await qc.invalidateQueries({ queryKey: ['listing', id] });
      useListingsStore.getState().reload();
      toast(t('manage.updated'), 'success');
    } catch {
      toast(t('manage.error'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      const s = useListingsStore.getState();
      s.removeMine(id);
      s.reload();
      if (s.selectedId === id) s.select(null);
      close();
      toast(t('manage.removed'), 'success');
    } catch {
      toast(t('manage.error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const l = q.data;
  const btn = 'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 font-semibold ring-1 disabled:opacity-60';

  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" tabIndex={-1} aria-label={t('card.close')} onClick={close} className="absolute inset-0 bg-black/50" />
      <div role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="panel relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl sm:m-4 sm:rounded-3xl">
        <header className="flex items-start gap-2 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-field-300 uppercase">{t('myListing')}</p>
            <h2 id={`${ids}-t`} ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
              {l?.farmName ?? mine?.farmName}
            </h2>
          </div>
          <button type="button" onClick={close} aria-label={t('card.close')} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10">
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-5">
          {q.isPending && <p className="shimmer h-32 rounded-xl" />}
          {q.isSuccess && !l && <p className="text-sm text-ink-muted">{t('page.notFound')}</p>}
          {l && (
            <>
              {l.status === 'paused' && <p className="rounded-xl bg-risk-medium/15 p-3 text-sm font-semibold">{t('manage.paused')}</p>}
              <p className="text-sm text-ink-muted">{t('manage.expires', { date: formatDate(l.expiresAt, locale) })}</p>
              <ListingDetails listing={l} />
              <a href={`/${locale}/fincas/${l.id}`} className={`${btn} bg-white/10 ring-line hover:bg-white/15`}>
                <ExternalLink aria-hidden className="size-4" />
                {t('dialog.view')}
              </a>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => patch({ status: l.status === 'paused' ? 'active' : 'paused' })} className={`${btn} bg-white/5 ring-line`}>
                  {l.status === 'paused' ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
                  {l.status === 'paused' ? t('manage.resume') : t('manage.pause')}
                </button>
                <button type="button" disabled={busy} onClick={() => patch({ renew: true })} className={`${btn} bg-white/5 ring-line`}>
                  <RefreshCw aria-hidden className="size-4" />
                  {t('manage.renew')}
                </button>
              </div>
            </>
          )}
          {(l || q.isSuccess) &&
            (confirming ? (
              <div className="rounded-xl bg-risk-high/15 p-3 ring-1 ring-risk-high/40">
                <p className="mb-2 text-sm font-semibold">{t('manage.removeConfirm')}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} className={`${btn} bg-white/10 ring-line`}>
                    {t('dialog.back')}
                  </button>
                  <button type="button" disabled={busy} onClick={remove} className={`${btn} bg-risk-high text-black ring-risk-high`}>
                    <Trash2 aria-hidden className="size-4" />
                    {t('manage.remove')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={`${btn} bg-transparent text-risk-high ring-risk-high/50`}>
                <Trash2 aria-hidden className="size-4" />
                {t('manage.remove')}
              </button>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
