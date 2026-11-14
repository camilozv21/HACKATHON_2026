'use client';

import clsx from 'clsx';
import { Check, ExternalLink, LocateFixed, MapPinned, Phone, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/components/ui/toast';
import { getMap } from '@/features/globe/store';
import { useTimeStore } from '@/features/time/store';
import { CommunityReportResponse, REPORT_IMPACTS, type CommunityReportInput, type ReportImpact } from '@/lib/api/contract';
import { reverseGeocode } from '@/lib/geocoding';
import { KindIcon } from './KindIcon';
import { REPORTABLE } from './kinds';
import { useEventsStore } from './store';

const NOTE_MAX = 280;
const LANDSLIDE_REPORTER = 'https://gpm.nasa.gov/applications/landslides/reporter';

/** Fecha local (no UTC): "hoy" es el día de la persona. */
const localDay = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86_400_000).toLocaleDateString('sv');

async function placeName(lat: number, lon: number, locale: string) {
  try {
    return await reverseGeocode({ lng: lon, lat, zoom: 12 }, locale);
  } catch {
    return null;
  }
}

/**
 * Reportar un evento (deslizamiento, creciente, granizo…). Sin datos personales; el punto se redondea a ~100 m
 * y el reporte queda "sin verificar". Si hay personas en riesgo, primero el número de emergencias.
 */
export function ReportEventSheet() {
  const t = useTranslations('events');
  const tf = useTranslations('events.form');
  const locale = useLocale();
  const draft = useEventsStore((s) => s.report);
  const { updateReport, closeReport, setPicking } = useEventsStore.getState();
  const [date, setDate] = useState(localDay());
  const [dayChoice, setDayChoice] = useState<'today' | 'yesterday' | 'other'>('today');
  const [impacts, setImpacts] = useState<ReportImpact[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const ids = { what: useId(), when: useId(), where: useId(), affected: useId(), note: useId() };

  // Sin punto: el centro del mapa (y su nombre).
  useEffect(() => {
    const d = useEventsStore.getState().report;
    if (d && d.lat == null) {
      const c = getMap()?.getCenter();
      if (c) {
        updateReport({ lat: c.lat, lon: c.lng, place: null });
        void placeName(c.lat, c.lng, locale).then((place) => useEventsStore.getState().setReportPlace(c.lat, c.lng, place));
      }
    }
  }, [locale, updateReport]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useEventsStore.getState().closeReport();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  if (!draft) return null;

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) return setProblem(tf('locationDenied'));
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lon } = pos.coords;
        updateReport({ lat, lon, place: null });
        void placeName(lat, lon, locale).then((place) => useEventsStore.getState().setReportPlace(lat, lon, place));
      },
      () => {
        setLocating(false);
        setProblem(tf('locationDenied'));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const toggleImpact = (i: ReportImpact) => setImpacts((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.kind) return setProblem(tf('needKind'));
    if (draft.lat == null || draft.lon == null) return;
    setBusy(true);
    setProblem(null);
    const body: CommunityReportInput = {
      kind: draft.kind,
      date,
      lat: draft.lat,
      lon: draft.lon,
      place: draft.place ?? undefined,
      impacts,
      note: note.trim() || undefined,
    };
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 429) throw new Error('rate');
      if (!res.ok) throw new Error('failed');
      const { report } = CommunityReportResponse.parse(await res.json());
      const s = useEventsStore.getState();
      // Lo que se reporta pasó hace poco: si se estaba revisando un mes pasado, se vuelve al presente para verlo.
      if (useTimeStore.getState().sel) useTimeStore.getState().set(null);
      s.addMine(report);
      s.closeReport();
      s.setVisible(true);
      s.select([report]);
      toast(tf('sent'), 'success');
    } catch (err) {
      setProblem(err instanceof Error && err.message === 'rate' ? tf('rate') : tf('failed'));
    } finally {
      setBusy(false);
    }
  };

  const where = draft.place ?? (draft.lat != null && draft.lon != null ? `${draft.lat.toFixed(3)}, ${draft.lon.toFixed(3)}` : '…');

  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" tabIndex={-1} aria-label={tf('cancel')} onClick={closeReport} className="absolute inset-0 bg-black/50" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onSubmit={submit}
        className="panel relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl sm:m-4 sm:rounded-3xl"
      >
        <header className="flex items-start gap-2 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <h2 id="report-title" className="text-xl font-bold">
              {tf('title')}
            </h2>
            <p className="text-sm text-ink-muted">{tf('intro')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeReport}
            aria-label={tf('cancel')}
            className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-4">
          <a href="tel:123" className="flex items-center gap-2 rounded-2xl bg-risk-high/15 p-3 text-sm font-semibold ring-1 ring-risk-high/40">
            <Phone aria-hidden className="size-5 shrink-0 text-risk-high" />
            {t('emergency')}
          </a>

          <fieldset aria-labelledby={ids.what} className="flex flex-col gap-2">
            <legend id={ids.what} className="mb-2 font-bold">
              {tf('what')}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {REPORTABLE.map((k) => {
                const on = draft.kind === k;
                return (
                  <label
                    key={k}
                    className={clsx(
                      'flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ring-1',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                      on ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
                    )}
                  >
                    <input type="radio" name="kind" checked={on} onChange={() => updateReport({ kind: k })} className="sr-only" />
                    <KindIcon kind={k} className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1">{t(`kind.${k}`)}</span>
                    {on && <Check aria-hidden className="size-4 shrink-0" />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset aria-labelledby={ids.when} className="flex flex-col gap-2">
            <legend id={ids.when} className="mb-2 font-bold">
              {tf('when')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {(['today', 'yesterday', 'other'] as const).map((d) => (
                <label
                  key={d}
                  className={clsx(
                    'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                    dayChoice === d ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
                  )}
                >
                  <input
                    type="radio"
                    name="day"
                    checked={dayChoice === d}
                    onChange={() => {
                      setDayChoice(d);
                      if (d === 'today') setDate(localDay());
                      if (d === 'yesterday') setDate(localDay(1));
                    }}
                    className="sr-only"
                  />
                  {d === 'other' ? tf('otherDay') : tf(d)}
                </label>
              ))}
            </div>
            {dayChoice === 'other' && (
              <label className="flex flex-col gap-1 text-sm">
                {tf('date')}
                <input
                  type="date"
                  required
                  value={date}
                  min={localDay(60)}
                  max={localDay()}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-h-11 rounded-xl bg-white/10 px-3 text-base ring-1 ring-line"
                />
              </label>
            )}
          </fieldset>

          <fieldset aria-labelledby={ids.where} className="flex flex-col gap-2">
            <legend id={ids.where} className="mb-2 font-bold">
              {tf('where')}
            </legend>
            <p className="rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">{where}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10 disabled:opacity-60"
              >
                <LocateFixed aria-hidden className="size-4" />
                {locating ? tf('locating') : tf('useMyLocation')}
              </button>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
              >
                <MapPinned aria-hidden className="size-4" />
                {tf('pickOnMap')}
              </button>
            </div>
          </fieldset>

          <fieldset aria-labelledby={ids.affected} className="flex flex-col gap-2">
            <legend id={ids.affected} className="mb-2 font-bold">
              {tf('affected')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {REPORT_IMPACTS.map((i) => {
                const on = impacts.includes(i);
                return (
                  <label
                    key={i}
                    className={clsx(
                      'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                      on ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleImpact(i)} className="sr-only" />
                    {on && <Check aria-hidden className="size-4" />}
                    {t(`impacts.${i}`)}
                  </label>
                );
              })}
            </div>
            {impacts.includes('people') && (
              <a href="tel:123" className="flex items-center gap-2 rounded-2xl bg-risk-high/20 p-3 text-sm font-bold ring-2 ring-risk-high">
                <Phone aria-hidden className="size-5 shrink-0" />
                {t('call')}
              </a>
            )}
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span id={ids.note} className="font-bold">
              {tf('note')}
            </span>
            <textarea
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`${ids.note}-hint`}
              className="rounded-2xl bg-white/10 p-3 text-base ring-1 ring-line"
            />
            <span id={`${ids.note}-hint`} className="text-xs text-ink-muted">
              {tf('noteHint', { left: NOTE_MAX - note.length })}
            </span>
          </label>

          <p className="text-xs text-ink-muted">{tf('privacy')}</p>
          {draft.kind === 'landslide' && (
            <a
              href={LANDSLIDE_REPORTER}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-sky-glow underline-offset-2 hover:underline"
            >
              <ExternalLink aria-hidden className="size-4 shrink-0" />
              {tf('landslideReporter')}
            </a>
          )}
          <p className="text-xs text-ink-faint">{tf('mockNote')}</p>
        </div>

        <footer className="flex flex-col gap-2 border-t border-line px-5 pt-3 pb-[calc(var(--safe-bottom)+0.75rem)]">
          {problem && (
            <p role="alert" className="rounded-xl bg-risk-medium/15 px-3 py-2 text-sm font-medium">
              {problem}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || draft.lat == null}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-bold text-black hover:bg-field-400 disabled:opacity-60"
          >
            {busy ? tf('sending') : tf('send')}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
