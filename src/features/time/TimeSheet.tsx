'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, History, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DATA_START, daysInMonth, latestAvailable, periodLabel, presets, selMonth, type TimeSel } from './period';
import { useTimeStore } from './store';

const pad = (n: number) => String(n).padStart(2, '0');
const FIRST_YEAR = Number(DATA_START.slice(0, 4));

/**
 * "¿Qué fecha quieres revisar?": atajos (mes pasado, este mes, mismo mes del año pasado), año, mes y —si se
 * quiere— un día. Los meses/días sin datos (futuro o los últimos días) quedan deshabilitados.
 */
export default function TimeSheet() {
  const t = useTranslations('time');
  const locale = useLocale();
  const current = useTimeStore((s) => s.sel);
  const { set, setPickerOpen } = useTimeStore.getState();
  const latest = useMemo(() => latestAvailable(), []);
  const latestYear = Number(latest.slice(0, 4));
  const initYm = current ? selMonth(current) : presets().lastMonth;
  const [year, setYear] = useState(Number(initYm.slice(0, 4)));
  const [month, setMonth] = useState(Number(initYm.slice(5, 7)));
  const [mode, setMode] = useState<'month' | 'day'>(current?.kind === 'day' ? 'day' : 'month');
  const [day, setDay] = useState<number | null>(current?.kind === 'day' ? Number(current.date.slice(8, 10)) : null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => setPickerOpen(false);
  const closeRefFn = useRef(close);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRefFn.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  const ym = `${year}-${pad(month)}`;
  const monthDisabled = (m: number) => {
    const first = `${year}-${pad(m)}-01`;
    return first > latest || first < DATA_START;
  };
  const dayDisabled = (d: number) => `${ym}-${pad(d)}` > latest;
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, i, 15))).replace('.', ''),
  );
  // Semana empieza en lunes: desplazamiento del día 1.
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );

  const selection: TimeSel | null = mode === 'month' ? { kind: 'month', ym } : day ? { kind: 'day', date: `${ym}-${pad(day)}` } : null;
  const apply = (sel: TimeSel | null) => {
    set(sel);
    close();
  };
  const p = presets();

  const changeYear = (y: number) => {
    setYear(y);
    setDay(null);
    // Si el mes queda en el futuro, se baja al último mes con datos.
    if (`${y}-${pad(month)}-01` > latest) setMonth(Number(latest.slice(5, 7)));
  };

  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center">
      <button type="button" tabIndex={-1} aria-label={t('close')} onClick={close} className="absolute inset-0 bg-black/55" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-title"
        className="panel relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl sm:m-4 sm:rounded-3xl"
      >
        <header className="flex items-start gap-2 px-5 pt-4 pb-2">
          <History aria-hidden className="mt-1 size-5 shrink-0 text-sun" />
          <div className="min-w-0 flex-1">
            <h2 id="time-title" className="text-xl font-bold">
              {t('title')}
            </h2>
            <p className="text-sm text-ink-muted">{t('hint')}</p>
          </div>
          <button ref={closeRef} type="button" onClick={close} aria-label={t('close')} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10">
            <X aria-hidden className="size-5" />
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-[calc(var(--safe-bottom)+1.25rem)]">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('quick')}>
            {(
              [
                ['lastMonth', p.lastMonth],
                ['thisMonth', p.thisMonth],
                ['sameMonthLastYear', p.sameMonthLastYear],
              ] as const
            ).map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => apply({ kind: 'month', ym: value })}
                className="flex min-h-11 items-center rounded-full bg-white/5 px-3.5 text-sm ring-1 ring-line hover:bg-white/10"
              >
                {t(`presets.${key}`)}
                <span className="ml-1 text-ink-faint">· {periodLabel({ kind: 'month', ym: value }, locale)}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => changeYear(year - 1)}
              disabled={year <= FIRST_YEAR}
              aria-label={t('prevYear')}
              className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-line disabled:opacity-35"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <p className="text-2xl font-bold tabular-nums" aria-live="polite">
              {year}
            </p>
            <button
              type="button"
              onClick={() => changeYear(year + 1)}
              disabled={year >= latestYear}
              aria-label={t('nextYear')}
              className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-line disabled:opacity-35"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>

          <div role="radiogroup" aria-label={t('monthLabel', { year })} className="grid grid-cols-4 gap-1.5">
            {monthNames.map((name, i) => {
              const m = i + 1;
              const checked = m === month;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={monthDisabled(m)}
                  onClick={() => {
                    setMonth(m);
                    setDay(null);
                  }}
                  className={clsx(
                    'min-h-12 rounded-xl text-sm font-semibold capitalize ring-1 disabled:opacity-30',
                    checked ? 'bg-sun text-space ring-sun' : 'bg-white/5 ring-line hover:bg-white/10',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div role="radiogroup" aria-label={t('modeLabel')} className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1 ring-1 ring-line">
            {(['month', 'day'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={clsx('min-h-11 rounded-xl text-sm font-semibold', mode === m ? 'bg-white/15 text-ink' : 'text-ink-muted')}
              >
                {t(`mode.${m}`)}
              </button>
            ))}
          </div>

          {mode === 'day' && (
            <div>
              <div aria-hidden className="grid grid-cols-7 text-center text-xs text-ink-faint uppercase">
                {weekdays.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
              <div role="radiogroup" aria-label={t('dayLabel', { period: periodLabel({ kind: 'month', ym }, locale) })} className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`e${i}`} aria-hidden />
                ))}
                {Array.from({ length: daysInMonth(year, month) }, (_, i) => {
                  const d = i + 1;
                  const checked = d === day;
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-label={periodLabel({ kind: 'day', date: `${ym}-${pad(d)}` }, locale)}
                      disabled={dayDisabled(d)}
                      onClick={() => setDay(d)}
                      className={clsx(
                        'aspect-square min-h-10 rounded-lg text-sm tabular-nums disabled:opacity-25',
                        checked ? 'bg-sun font-bold text-space' : 'bg-white/5 hover:bg-white/10',
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-ink-faint">{t('dataNote')}</p>

          <div className="flex gap-2">
            {current && (
              <button type="button" onClick={() => apply(null)} className="min-h-12 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line hover:bg-white/15">
                {t('backToToday')}
              </button>
            )}
            <button
              type="button"
              disabled={!selection}
              onClick={() => selection && apply(selection)}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-sun px-4 font-semibold text-space disabled:opacity-40"
            >
              {selection ? t('apply', { period: periodLabel(selection, locale) }) : t('pickDay')}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
