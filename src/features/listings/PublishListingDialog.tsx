'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ExternalLink, Lock, Plus, Share2, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/components/ui/toast';
import { useFieldStore } from '@/features/field/store';
import { formatCop, formatDate, formatMonth } from '@/features/market/format';
import type { CropSeason } from '@/lib/api/contract';
import { CERTIFICATIONS, CreateListingResponse, type Certification, type ListingProduct } from '@/lib/api/listings';
import { MarketResponse, marketUrl } from '@/lib/api/market';
import { CROP_PRODUCT, PRODUCT_IDS, PRODUCT_META, pricePerUnit, type ListingUnit, type ProductId } from '@/lib/market/catalog';
import { ListingDetails } from './ListingDetails';
import { useListingsStore } from './store';

type Row = { key: number; product: ProductId; name: string; quantity: string; unit: ListingUnit; price: string; later: boolean; from: string; to: string };

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
/** Próxima vez que llega el mes `m` (1–12), como YYYY-MM. */
function nextMonth(m: number, plus = 0): string {
  const now = new Date();
  let y = now.getFullYear();
  if (m < now.getMonth() + 1) y++;
  return ym(new Date(y, m - 1 + plus, 1));
}

let seq = 0;
const newRow = (product: ProductId, season?: CropSeason): Row => {
  const later = Boolean(season && season.role !== 'perennial');
  return {
    key: ++seq,
    product,
    name: '',
    quantity: '',
    unit: PRODUCT_META[product].units[0]!,
    price: '',
    later,
    from: later ? nextMonth(season!.endMonth) : ym(new Date()),
    to: later ? nextMonth(season!.endMonth, 1) : ym(new Date()),
  };
};

/** Productos sugeridos con la rotación de la finca (cultivos que se venden, sin coberturas). */
function rowsFromRotation(rotation: CropSeason[] | null): Row[] {
  const seen = new Set<ProductId>();
  const rows: Row[] = [];
  for (const s of rotation ?? []) {
    if (s.role === 'cover' || s.role === 'fallow' || s.role === 'forage') continue;
    const p = CROP_PRODUCT[s.crop];
    if (!p || seen.has(p)) continue;
    seen.add(p);
    rows.push(newRow(p, s));
  }
  return rows.length ? rows.slice(0, 4) : [newRow('platano')];
}

const toNumber = (s: string) => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ERRORS = ['invalid', 'phone', 'outside', 'rate', 'storage', 'network'] as const;
type ErrorKey = (typeof ERRORS)[number];

/** "Publicar mi finca": formulario en 3 pasos encima del sheet de la finca (portal a <body>, Esc lo cierra). */
export function PublishListingDialog() {
  const t = useTranslations('listings.dialog');
  const tl = useTranslations('listings');
  const tp = useTranslations('products');
  const tu = useTranslations('units');
  const tus = useTranslations('unitsShort');
  const locale = useLocale();
  const ids = useId();
  const draft = useListingsStore((s) => s.publish)!;
  const close = useListingsStore((s) => s.closePublish);
  const rotation = useFieldStore((s) => s.rotation);
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Row[]>(() => rowsFromRotation(rotation));
  const [prefilled] = useState(() => Boolean(rotation?.length));
  const [farmName, setFarmName] = useState(draft.name ?? '');
  const [description, setDescription] = useState('');
  const [certs, setCerts] = useState<Certification[]>([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ErrorKey | 'consent' | null>(null);
  const [done, setDone] = useState<{ id: string; expiresAt: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Precios de referencia de la central más cercana para los productos elegidos.
  const products = useMemo(() => [...new Set(rows.map((r) => r.product))].sort(), [rows]);
  const market = useQuery({
    queryKey: ['market', draft.lat.toFixed(2), draft.lon.toFixed(2), locale, products.join(',')],
    queryFn: async ({ signal }) => {
      const res = await fetch(marketUrl(draft.lat, draft.lon, locale, products), { signal });
      if (!res.ok) throw new Error(String(res.status));
      return MarketResponse.parse(await res.json()).market;
    },
    staleTime: 30 * 60_000,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, done]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const toProducts = (): ListingProduct[] =>
    rows.map((r) => ({
      product: r.product,
      name: r.name.trim() || undefined,
      quantity: toNumber(r.quantity),
      unit: r.unit,
      priceCop: toNumber(r.price) === null ? null : Math.round(toNumber(r.price)!),
      available: r.later && r.from && r.to ? { from: r.from <= r.to ? r.from : r.to, to: r.from <= r.to ? r.to : r.from } : null,
    }));

  const next = () => {
    setProblem(null);
    if (step === 1) {
      if (farmName.trim().length < 2 || whatsapp.replace(/\D/g, '').length < 10) return setProblem('invalid');
      if (!consent) return setProblem('consent');
    }
    setStep((s) => Math.min(2, s + 1));
  };

  const publish = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmName: farmName.trim(),
          description: description.trim() || undefined,
          whatsapp,
          lat: draft.lat,
          lon: draft.lon,
          areaHa: draft.areaHa,
          products: toProducts(),
          certifications: certs,
          consent: true,
        }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setProblem(ERRORS.includes(code as ErrorKey) ? (code as ErrorKey) : 'storage');
        return;
      }
      const { listing, token } = CreateListingResponse.parse(await res.json());
      const s = useListingsStore.getState();
      s.addMine({ id: listing.id, token, fieldId: draft.fieldId, farmName: listing.farmName, expiresAt: listing.expiresAt });
      s.reload();
      setDone({ id: listing.id, expiresAt: listing.expiresAt });
      toast(t('done'), 'success');
    } catch {
      setProblem('network');
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    const s = useListingsStore.getState();
    close();
    if (done) {
      s.setVisible(true);
      s.select(done.id);
    }
  };

  const share = async () => {
    if (!done) return;
    const url = `${window.location.origin}/${locale}/fincas/${done.id}`;
    try {
      if (navigator.share) await navigator.share({ title: farmName, text: t('shareText', { name: farmName }), url });
      else {
        await navigator.clipboard.writeText(url);
        toast(t('copied'), 'success');
      }
    } catch {
      // la persona canceló
    }
  };

  const ref = market.data?.products ?? [];
  const steps = [t('steps.products'), t('steps.contact'), t('steps.review')];
  const field = 'mt-1 min-h-12 w-full rounded-xl bg-black/30 px-3 text-base ring-1 ring-line focus:ring-2 focus:ring-field-400 focus:outline-none';

  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" tabIndex={-1} aria-label={t('close')} onClick={done ? finish : close} className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="panel relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl sm:m-4 sm:rounded-3xl"
      >
        <header className="flex items-start gap-2 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            {!done && <p className="text-xs font-semibold tracking-wider text-field-300 uppercase">{t('step', { n: step + 1 })}</p>}
            <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
              {done ? t('done') : steps[step]}
            </h2>
          </div>
          <button type="button" onClick={done ? finish : close} aria-label={t('close')} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10">
            <X aria-hidden className="size-5" />
          </button>
        </header>

        {!done && (
          <ol aria-hidden className="flex gap-1.5 px-5 pb-3">
            {steps.map((s, i) => (
              <li key={s} className={clsx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-field-400' : 'bg-white/10')} />
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-4">
          {done ? (
            <>
              <p className="text-sm text-ink-muted">{t('doneHint', { date: formatDate(done.expiresAt, locale) })}</p>
              <a href={`/${locale}/fincas/${done.id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-bold text-black">
                <ExternalLink aria-hidden className="size-5" />
                {t('view')}
              </a>
              <button type="button" onClick={share} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line hover:bg-white/15">
                <Share2 aria-hidden className="size-4" />
                {t('share')}
              </button>
            </>
          ) : step === 0 ? (
            <>
              {prefilled && <p className="text-sm text-ink-muted">{t('prefilled')}</p>}
              <ul className="flex flex-col gap-3">
                {rows.map((r, i) => {
                  const m = ref.find((x) => x.product === r.product);
                  const perUnit = m?.priceCopKg ? pricePerUnit(m.priceCopKg, r.unit) : null;
                  return (
                    <li key={r.key} className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
                      <div className="flex items-end gap-2">
                        <label className="min-w-0 flex-1 text-sm font-semibold">
                          {t('product')}
                          <select
                            value={r.product}
                            onChange={(e) => {
                              const p = e.target.value as ProductId;
                              update(r.key, { product: p, unit: PRODUCT_META[p].units[0]! });
                            }}
                            className={field}
                          >
                            {[...PRODUCT_IDS]
                              .sort((a, b) => tp(a).localeCompare(tp(b), locale))
                              .map((p) => (
                                <option key={p} value={p}>
                                  {tp(p)}
                                </option>
                              ))}
                          </select>
                        </label>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                            aria-label={t('removeProduct', { product: tp(r.product) })}
                            className="grid size-12 shrink-0 place-items-center rounded-full hover:bg-white/10"
                          >
                            <Trash2 aria-hidden className="size-5" />
                          </button>
                        )}
                      </div>
                      <label className="mt-2 block text-sm font-semibold">
                        {t('productName')}
                        <input value={r.name} maxLength={40} onChange={(e) => update(r.key, { name: e.target.value })} placeholder={t('productNamePlaceholder')} className={field} />
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-sm font-semibold">
                          {t('quantity')}
                          <input inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} className={field} />
                        </label>
                        <label className="text-sm font-semibold">
                          {t('unit')}
                          <select value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value as ListingUnit })} className={field}>
                            {PRODUCT_META[r.product].units.map((u) => (
                              <option key={u} value={u}>
                                {tu(u)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="mt-2 block text-sm font-semibold">
                        {t('price', { unit: tus(r.unit) })}
                        <input inputMode="numeric" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} placeholder="$" className={field} />
                        <span className="mt-1 block text-xs font-normal text-ink-muted">{t('priceHint')}</span>
                      </label>
                      {m?.priceCopKg && m.market && m.lastMonth && (
                        <p className="mt-2 rounded-xl bg-sky-glow/10 p-2.5 text-xs text-sky-glow">
                          {perUnit
                            ? t('reference', { market: m.market.name, month: formatMonth(m.lastMonth, locale), price: formatCop(perUnit, locale), unit: tus(r.unit) })
                            : t('referenceKg', { market: m.market.name, month: formatMonth(m.lastMonth, locale), price: formatCop(m.priceCopKg, locale) })}
                        </p>
                      )}
                      <fieldset className="mt-2">
                        <legend className="text-sm font-semibold">{t('available')}</legend>
                        <div className="mt-1 flex gap-2">
                          {([false, true] as const).map((later) => (
                            <label
                              key={String(later)}
                              className={clsx(
                                'flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1',
                                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                                r.later === later ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
                              )}
                            >
                              <input type="radio" name={`${ids}-av-${i}`} checked={r.later === later} onChange={() => update(r.key, { later })} className="sr-only" />
                              {r.later === later && <Check aria-hidden className="size-4" />}
                              {later ? t('availableLater') : t('availableNow')}
                            </label>
                          ))}
                        </div>
                        {r.later && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="text-sm">
                              {t('from')}
                              <input type="month" value={r.from} onChange={(e) => update(r.key, { from: e.target.value })} className={field} />
                            </label>
                            <label className="text-sm">
                              {t('to')}
                              <input type="month" value={r.to} onChange={(e) => update(r.key, { to: e.target.value })} className={field} />
                            </label>
                          </div>
                        )}
                      </fieldset>
                    </li>
                  );
                })}
              </ul>
              {rows.length < 8 && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => [...rs, newRow('otro')])}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/5 px-4 font-semibold ring-1 ring-line hover:bg-white/10"
                >
                  <Plus aria-hidden className="size-4" />
                  {t('addProduct')}
                </button>
              )}
            </>
          ) : step === 1 ? (
            <>
              <label className="text-sm font-semibold">
                {t('farmName')}
                <input value={farmName} maxLength={60} required onChange={(e) => setFarmName(e.target.value)} className={field} />
              </label>
              <label className="text-sm font-semibold">
                {t('description')}
                <textarea value={description} maxLength={280} rows={3} onChange={(e) => setDescription(e.target.value)} className={clsx(field, 'py-2')} />
                <span className="mt-1 block text-xs font-normal text-ink-muted">{t('descriptionHint')}</span>
              </label>
              <fieldset>
                <legend className="text-sm font-semibold">{t('certifications')}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {CERTIFICATIONS.map((c) => {
                    const on = certs.includes(c);
                    return (
                      <label
                        key={c}
                        className={clsx(
                          'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm ring-1',
                          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                          on ? 'bg-field-500/15 font-semibold ring-2 ring-field-400' : 'bg-white/5 ring-line',
                        )}
                      >
                        <input type="checkbox" checked={on} onChange={() => setCerts((v) => (on ? v.filter((x) => x !== c) : [...v, c]))} className="sr-only" />
                        {on && <Check aria-hidden className="size-4" />}
                        {tl(`certs.${c}`)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="text-sm font-semibold">
                {t('whatsapp')}
                <input type="tel" inputMode="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="300 123 4567" className={field} />
                <span className="mt-1 block text-xs font-normal text-ink-muted">{t('whatsappHint')}</span>
              </label>
              <p className="flex items-start gap-2 rounded-xl bg-white/5 p-3 text-sm">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-field-300" />
                {t('privacy')}
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3 text-sm ring-1 ring-line">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-field-500" />
                <span>{t('consent')}</span>
              </label>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t('preview')}</p>
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
                <p className="mb-2 text-lg font-bold">{farmName}</p>
                <ListingDetails
                  listing={{
                    place: market.data?.place ?? '…',
                    areaHa: draft.areaHa ? Math.round(draft.areaHa * 10) / 10 : null,
                    products: toProducts(),
                    certifications: certs,
                    description: description.trim() || null,
                  }}
                />
              </div>
            </>
          )}

          {problem && (
            <p role="alert" className="rounded-xl bg-risk-high/15 p-3 text-sm font-semibold ring-1 ring-risk-high/40">
              {problem === 'consent' ? t('consentRequired') : t(`errors.${problem}`)}
            </p>
          )}
        </div>

        {!done && (
          <footer className="flex gap-2 border-t border-line px-5 py-3">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line hover:bg-white/15">
                {t('back')}
              </button>
            )}
            {step < 2 ? (
              <button type="button" onClick={next} className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-field-500 px-4 font-bold text-black">
                {t('next')}
              </button>
            ) : (
              <button
                type="button"
                onClick={publish}
                disabled={busy}
                className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-field-500 px-4 font-bold text-black disabled:opacity-60"
              >
                {busy ? t('publishing') : t('publish')}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
