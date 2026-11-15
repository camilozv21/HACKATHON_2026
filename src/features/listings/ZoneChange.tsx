'use client';

import clsx from 'clsx';
import { ArrowRight, History, Leaf, Satellite } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { CompareSlider } from '@/components/ui/CompareSlider';
import { formatMonth } from '@/features/market/format';
import { monthDate, ndviUrl, PHOTO_IN_NDVI, PHOTO_YEARS, photoUrl, type PhotoYear } from './zoneImagery';

type View = 'photo' | 'ndvi';
type Pair = { base: number; compare: number };

type Props = {
  lat: number;
  lon: number;
  /** Mes del último NDVI de NASA (1-12) y años que tienen ese mes; null si no hay metadatos de GIBS. */
  ndvi: { month: number; years: number[] } | null;
};

/** Par por defecto: el año más antiguo que se pueda desde 2016 contra el más reciente. */
function defaultPair(years: readonly number[]): Pair {
  return { base: years.find((y) => y >= 2016) ?? years[0]!, compare: years.at(-1)! };
}

/**
 * "¿Cómo ha cambiado la zona?": comparador deslizante de dos años alrededor de una finca publicada. Vista de foto
 * (mosaicos Sentinel-2 sin nubes, ~6 km) o de verdor NASA MODIS (el mismo mes en dos años, ~33 km).
 */
export function ZoneChange({ lat, lon, ndvi }: Props) {
  const t = useTranslations('listings.zone');
  const tg = useTranslations('glossary');
  const locale = useLocale();
  const id = useId();
  const [view, setView] = useState<View>('photo');
  const [photo, setPhoto] = useState<Pair>(() => defaultPair(PHOTO_YEARS));
  const [green, setGreen] = useState<Pair | null>(() => (ndvi && ndvi.years.length > 1 ? defaultPair(ndvi.years) : null));

  const isNdvi = view === 'ndvi' && ndvi !== null && green !== null;
  const pair = isNdvi ? green : photo;
  const years: readonly number[] = isNdvi ? ndvi.years : PHOTO_YEARS;
  const setPair = (p: Pair) => (isNdvi ? setGreen(p) : setPhoto(p));
  const label = (y: number) => (isNdvi ? formatMonth(monthDate(y, ndvi.month).slice(0, 7), locale) : String(y));
  const side = (y: number) => ({
    src: isNdvi ? ndviUrl(lat, lon, monthDate(y, ndvi.month)) : photoUrl(lat, lon, y as PhotoYear),
    alt: isNdvi ? t('altNdvi', { date: label(y) }) : t('altPhoto', { year: y }),
    label: label(y),
  });
  const before = side(pair.base);
  const after = side(pair.compare);
  const select = 'mt-1 min-h-12 w-full rounded-xl bg-black/30 px-3 font-semibold ring-1 ring-line';

  const yearSelect = (key: keyof Pair, text: string) => {
    const other = key === 'base' ? pair.compare : pair.base;
    return (
      <label className="text-sm font-semibold">
        {text}
        <select value={pair[key]} onChange={(e) => setPair({ ...pair, [key]: Number(e.target.value) })} className={select}>
          {years.map((y) => (
            <option key={y} value={y} disabled={y === other}>
              {label(y)}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-field-300 uppercase">
        <History aria-hidden className="size-4" />
        {t('eyebrow')}
      </p>
      <h2 id={`${id}-title`} className="mt-1 text-xl leading-tight font-bold">
        {t('title')}
      </h2>

      {ndvi && green && (
        <div role="group" aria-label={t('viewLabel')} className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-black/30 p-1 ring-1 ring-line">
          {(
            [
              ['photo', Satellite, t('viewPhoto')],
              ['ndvi', Leaf, t('viewNdvi')],
            ] as const
          ).map(([v, Icon, text]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={clsx(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold',
                view === v ? 'bg-field-500 text-black' : 'text-ink-muted hover:bg-white/10',
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {text}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem] md:items-start">
        <CompareSlider
          before={before}
          after={after}
          pixelated={isNdvi}
          label={t('sliderLabel', { before: before.label, after: after.label })}
          valueText={(pct) => t('sliderValue', { pct: Math.round(pct), before: before.label, after: after.label })}
          errorText={(l) => t('loadError', { label: l })}
          overlay={
            isNdvi ? (
              <div
                className="absolute border-2 border-dashed border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
                style={{ inset: `${((1 - PHOTO_IN_NDVI) / 2) * 100}%` }}
              />
            ) : null
          }
        />

        <div className="flex flex-col gap-3">
          <p aria-hidden className="flex items-center gap-2 text-3xl font-bold tabular-nums">
            <span>{pair.base}</span>
            <ArrowRight className="size-6 text-ink-muted" />
            <span className="text-field-300">{pair.compare}</span>
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            {yearSelect('base', t('base'))}
            {yearSelect('compare', t('compare'))}
          </div>
          <p className="text-sm text-ink-muted">{t('hint')}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        {isNdvi ? (
          <>
            <p>{t('ndviNote')}</p>
            <p className="text-ink-muted">{t('ndviBox')}</p>
            <details className="rounded-xl bg-black/20 px-3">
              <summary className="cursor-pointer py-3 font-semibold">{tg('whatIs', { term: tg('terms.ndvi.title') })}</summary>
              <p className="pb-3 text-ink-muted">{tg('terms.ndvi.simple')}</p>
            </details>
          </>
        ) : (
          <p>{t('photoNote')}</p>
        )}
        <p className="text-ink-muted">{t('approx')}</p>
        <p className="text-xs text-ink-faint">{isNdvi ? t('creditNdvi') : t('creditPhoto')}</p>
      </div>
    </section>
  );
}
