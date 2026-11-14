'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Link2, Printer } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { RULES } from '@/features/time/events';
import { periodLabel } from '@/features/time/period';
import { EventHistory, EventsResponse, type HazardEvent } from '@/lib/api/contract';
import { useClimate, usePowerDaily } from '@/lib/api/hooks';
import { formatCoords, haversineKm } from '@/lib/geo';
import { QueryProvider } from '@/lib/query/client';
import { useUnits } from '@/lib/units';
import { RainChart, TempChart, TempLegend } from './charts';
import { buildReport, normalsFor, parseReportQuery, reportCsv, reportPeriod } from './report';

const noopSubscribe = () => () => {};
/** Valor que solo existe en el navegador (URL, fecha local) sin romper la hidratación. */
function useClientValue<T>(get: () => T, server: T): T {
  return useSyncExternalStore(noopSubscribe, get, () => server);
}

const NEAR_KM = 50;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="break-inside-avoid rounded-lg border border-neutral-300 p-3">
      <p className="text-xs font-semibold text-neutral-600">{label}</p>
      <p className="text-2xl leading-tight font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-neutral-600">{sub}</p>}
    </div>
  );
}

function ReportBody() {
  const t = useTranslations('report');
  const tp = useTranslations('time.past');
  const te = useTranslations('events');
  const locale = useLocale();
  const format = useFormatter();
  const u = useUnits();
  const params = useSearchParams();
  const q = useMemo(() => parseReportQuery(new URLSearchParams(params.toString())), [params]);
  const period = useMemo(() => reportPeriod(q?.when), [q?.when]);
  const today = useClientValue(() => format.dateTime(new Date(), { dateStyle: 'long' }), '');
  const href = useClientValue(() => window.location.href, '');
  const [copied, setCopied] = useState(false);

  const climate = useClimate(q?.lat, q?.lon);
  const daily = usePowerDaily(q?.lat, q?.lon, period.start, period.end);
  const events = useQuery({
    queryKey: ['report-events', period.start, period.end],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/events?from=${period.start}&to=${period.end}`, { signal });
      if (!r.ok) throw new Error(String(r.status));
      return EventsResponse.parse(await r.json());
    },
    enabled: Boolean(q),
    staleTime: 10 * 60_000,
  });
  const history = useQuery({
    queryKey: ['event-history', q?.lat.toFixed(3), q?.lon.toFixed(3), period.start, period.end],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/events/history?lat=${q!.lat.toFixed(3)}&lon=${q!.lon.toFixed(3)}&from=${period.start}&to=${period.end}`, { signal });
      if (!r.ok) throw new Error(String(r.status));
      return EventHistory.parse(await r.json());
    },
    enabled: Boolean(q),
    staleTime: 10 * 60_000,
  });

  const days = useMemo(() => daily.data ?? [], [daily.data]);
  const report = useMemo(() => (days.length ? buildReport(days, climate.data ?? null, period.days) : null), [days, climate.data, period.days]);
  const near: HazardEvent[] = useMemo(() => {
    if (!q || !events.data) return [];
    return events.data.events
      .filter((e) => haversineKm({ lat: q.lat, lng: q.lon }, { lat: e.lat, lng: e.lon }) <= NEAR_KM)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [q, events.data]);

  if (!q) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <p>{t('noPlace')}</p>
        <a href={`/${locale}`} className="mt-3 inline-block font-semibold text-emerald-800 underline">
          {t('backHome')}
        </a>
      </div>
    );
  }

  type DateOpts = Pick<Intl.DateTimeFormatOptions, 'day' | 'month' | 'year'>;
  const day = (d: string, opts: DateOpts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), { ...opts, timeZone: 'UTC' });
  const muni = history.data?.place;
  const placeName = q.name || (muni ? `${muni.name}, ${muni.dept}` : formatCoords({ lng: q.lon, lat: q.lat }, 3, locale));
  const periodText = period.sel ? periodLabel(period.sel, locale) : t('recent');
  const s = report?.summary;
  const pctText = (pct: number) => format.number(pct / 100, { style: 'percent', signDisplay: 'exceptZero' });
  const share = (v: number) => format.number(v / 100, { style: 'percent', maximumFractionDigits: 0 });
  const appHref = `/${locale}?lat=${q.lat.toFixed(4)}&lon=${q.lon.toFixed(4)}&z=9&region=${q.lat.toFixed(4)},${q.lon.toFixed(4)}${period.sel ? `&t=${period.start.slice(0, 7)}` : ''}&ev=1`;

  const downloadCsv = () => {
    if (!days.length) return;
    const csv = reportCsv(days, climate.data ?? null, { place: placeName, lat: q.lat, lon: q.lon, start: period.start, end: period.end, generated: new Date().toISOString().slice(0, 10) }, locale);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-agroclimatico_${q.lat.toFixed(2)}_${q.lon.toFixed(2)}_${period.start}_${period.end}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin permiso del portapapeles: el enlace sigue en la barra de direcciones */
    }
  };

  const btn = 'flex min-h-12 items-center gap-2 rounded-full px-5 font-semibold';
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 p-6 print:max-w-none print:gap-4 print:p-0">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>
          <Printer aria-hidden className="size-5" />
          {t('print')}
        </button>
        <button type="button" onClick={downloadCsv} disabled={!days.length} className={`${btn} border border-neutral-300 hover:bg-neutral-100 disabled:opacity-50`}>
          <Download aria-hidden className="size-5" />
          {t('csv')}
        </button>
        <button type="button" onClick={copyLink} className={`${btn} border border-neutral-300 hover:bg-neutral-100`}>
          <Link2 aria-hidden className="size-5" />
          <span aria-live="polite">{copied ? t('copied') : t('copy')}</span>
        </button>
        <a href={appHref} className={`${btn} border border-neutral-300 hover:bg-neutral-100`}>
          <ArrowLeft aria-hidden className="size-5" />
          {t('back')}
        </a>
      </div>

      <header className="border-b-2 border-neutral-900 pb-3">
        <p className="text-xs font-bold tracking-widest text-emerald-800 uppercase">{t('kicker')}</p>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="font-semibold">{t('place')}</dt>
          <dd>{placeName}</dd>
          <dt className="font-semibold">{t('coords')}</dt>
          <dd>{formatCoords({ lng: q.lon, lat: q.lat }, 4, locale)}</dd>
          {muni && q.name && q.name !== `${muni.name}, ${muni.dept}` && (
            <>
              <dt className="font-semibold">{t('municipality')}</dt>
              <dd>
                {muni.name}, {muni.dept}
              </dd>
            </>
          )}
          <dt className="font-semibold">{t('period')}</dt>
          <dd>
            <span className="first-letter:uppercase">{periodText}</span> ({t('range', { start: day(period.start), end: day(period.end) })})
          </dd>
        </dl>
        {period.partial && <p className="mt-1 text-sm text-amber-800">{t('partial', { end: day(period.end) })}</p>}
        <p className="mt-1 text-xs text-neutral-600">{today && t('generated', { date: today })}</p>
      </header>

      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{t('disclaimer')}</p>

      {daily.isPending && <p className="animate-pulse text-neutral-600">{t('loading')}</p>}
      {daily.isError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm">
          {t('error')}{' '}
          <button type="button" onClick={() => void daily.refetch()} className="font-semibold underline">
            {t('retry')}
          </button>
        </p>
      )}

      {report && s && (
        <>
          <Section title={t('summaryTitle')}>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>
                {t('sRain', { total: u.rain(s.totalMm), days: s.rainyDays })}{' '}
                {s.pct != null && s.normalMm != null
                  ? s.pct <= -10
                    ? t('sRainLess', { pct: Math.abs(s.pct), normal: u.rain(s.normalMm) })
                    : s.pct >= 10
                      ? t('sRainMore', { pct: s.pct, normal: u.rain(s.normalMm) })
                      : t('sRainNear', { normal: u.rain(s.normalMm) })
                  : null}
              </li>
              {report.tmeanAvg != null && report.tmaxAvg != null && report.tminAvg != null && (
                <li>
                  {report.tmeanNormal != null
                    ? t('sTemp', { tmean: u.temp(report.tmeanAvg), normal: u.temp(report.tmeanNormal), tmax: u.temp(report.tmaxAvg), tmin: u.temp(report.tminAvg) })
                    : t('sTempNoNormal', { tmean: u.temp(report.tmeanAvg), tmax: u.temp(report.tmaxAvg), tmin: u.temp(report.tminAvg) })}
                </li>
              )}
              {report.soilAvg != null && (
                <li>
                  {report.soilNormal != null
                    ? t('sSoil', { soil: share(report.soilAvg), normal: share(report.soilNormal) })
                    : t('sSoilNoNormal', { soil: share(report.soilAvg) })}
                </li>
              )}
              <li>{t('sEvents', { count: s.events.length })}</li>
              {events.data && <li>{t('sEmergencies', { count: near.length })}</li>}
            </ul>
          </Section>

          <Section title={t('indicatorsTitle')}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3">
              <Tile
                label={t('iRain')}
                value={u.rain(s.totalMm)}
                sub={
                  s.normalMm != null
                    ? s.pct != null
                      ? t('iNormalPct', { value: u.rain(s.normalMm), pct: pctText(s.pct) })
                      : t('iNormal', { value: u.rain(s.normalMm) })
                    : t('iNoNormal')
                }
              />
              <Tile label={t('iRainyDays')} value={tp('daysOf', { n: s.rainyDays, total: period.days })} />
              <Tile
                label={t('iTmean')}
                value={report.tmeanAvg != null ? u.temp(report.tmeanAvg) : '—'}
                sub={report.tmeanNormal != null ? t('iNormal', { value: u.temp(report.tmeanNormal) }) : undefined}
              />
              <Tile label={t('iTmax')} value={report.tmaxAvg != null ? u.temp(report.tmaxAvg) : '—'} />
              <Tile label={t('iTmin')} value={report.tminAvg != null ? u.temp(report.tminAvg) : '—'} />
              <Tile
                label={t('iSoil')}
                value={report.soilAvg != null ? share(report.soilAvg) : '—'}
                sub={report.soilNormal != null ? t('iNormal', { value: share(report.soilNormal) }) : undefined}
              />
            </div>
          </Section>

          <Section title={t('rainChartTitle')}>
            <RainChart days={days} normalPerDay={(d) => normalsFor(d, climate.data ?? null).precipPerDay} />
            <p className="text-xs text-neutral-600">{t('rainChartNote')}</p>
          </Section>

          <Section title={t('tempChartTitle')}>
            <TempLegend />
            <TempChart days={days} />
          </Section>

          <Section title={t('weatherEventsTitle')}>
            {s.events.length ? (
              <ul className="flex flex-col gap-1.5">
                {s.events.map((e) => (
                  <li key={`${e.kind}-${e.start}`} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold">{tp(`events.${e.kind}.title`)}</span>
                    <span className="text-neutral-600">{t('eventDates', { start: day(e.start, { day: 'numeric', month: 'short' }), end: day(e.end, { day: 'numeric', month: 'short' }) })}</span>
                    <span>
                      {e.kind === 'heavyRain'
                        ? tp('events.heavyRain.detail', { rain: u.rain(e.value), days: e.days })
                        : e.kind === 'drySpell'
                          ? tp('events.drySpell.detail', { days: e.days })
                          : tp(`events.${e.kind}.detail`, { temp: u.temp(e.value), days: e.days })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('noWeatherEvents')}</p>
            )}
          </Section>
        </>
      )}

      <Section title={t('emergenciesTitle')}>
        {events.isError && <p>{t('emergenciesError')}</p>}
        {events.data && !near.length && <p>{t('emergenciesNone')}</p>}
        {!!near.length && (
          <ul className="flex flex-col gap-1">
            {near.slice(0, 25).map((e) => (
              <li key={e.id}>
                <span className="font-semibold">{te(`kind.${e.kind}`)}</span> · {day(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                {e.place && ` · ${e.place}`} · {te(`source.${e.source}`)}
                {!e.verified && ` (${te('unverified').toLowerCase()})`}
                {e.impact?.people ? ` · ${te('impact.people', { n: e.impact.people })}` : ''}
              </li>
            ))}
          </ul>
        )}
        {history.data?.status === 'ok' && muni && (
          <p className="mt-2 text-sm">
            {t('historyLine', { place: `${muni.name}, ${muni.dept}`, count: history.data.total, from: history.data.years.from, to: history.data.years.to })}{' '}
            {history.data.byKind
              .slice(0, 5)
              .map((k) => `${te(`kind.${k.kind}`)}: ${k.count}`)
              .join(' · ')}
          </p>
        )}
        {history.data?.status === 'outside' && <p className="mt-2 text-sm text-neutral-600">{t('historyOutside')}</p>}
      </Section>

      {report && (
        <Section title={t('watchTitle')}>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {report.watch.map((w) => (
              <li key={w}>{t(`watch.${w}`)}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-semibold">{t('watchAdvice')}</p>
        </Section>
      )}

      {!!days.length && (
        <Section title={t('dailyTitle')}>
          <table className="w-full text-right text-xs tabular-nums">
            <thead>
              <tr className="border-b border-neutral-400">
                <th scope="col" className="py-1 text-left">
                  {t('colDate')}
                </th>
                <th scope="col">{t('colRain', { unit: u.rainUnit })}</th>
                <th scope="col">{t('colNormal', { unit: u.rainUnit })}</th>
                <th scope="col">{t('colTmax', { unit: u.tempUnit })}</th>
                <th scope="col">{t('colTmin', { unit: u.tempUnit })}</th>
                <th scope="col">{t('colSoil')}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const n = normalsFor(d.date, climate.data ?? null);
                const r = (v: number | null, digits = 1) =>
                  v == null ? '—' : format.number(v, { minimumFractionDigits: digits, maximumFractionDigits: digits });
                return (
                  <tr key={d.date} className="border-b border-neutral-200">
                    <th scope="row" className="py-0.5 text-left font-normal">
                      {day(d.date, { day: '2-digit', month: 'short' })}
                    </th>
                    <td>{r(d.precip == null ? null : u.rainValue(d.precip), u.units === 'imperial' ? 2 : 1)}</td>
                    <td>{r(n.precipPerDay == null ? null : u.rainValue(n.precipPerDay), u.units === 'imperial' ? 2 : 1)}</td>
                    <td>{r(d.tmax == null ? null : u.tempValue(d.tmax), 0)}</td>
                    <td>{r(d.tmin == null ? null : u.tempValue(d.tmin), 0)}</td>
                    <td>{r(d.soil, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={t('sourcesTitle')}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{t('srcPower')}</li>
          {climate.data && <li>{t('srcNormal', { period: climate.data.baselinePeriod })}</li>}
          <li>{t('srcEvents')}</li>
          {report && <li>{t('srcCoverage', { have: report.daysWithData, total: period.days })}</li>}
          <li>{t('srcLimits')}</li>
        </ul>
        <h3 className="mt-3 text-sm font-bold">{t('rulesTitle')}</h3>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-neutral-700">
          <li>{tp('rules.heavyRain', { mm: u.rain(RULES.heavyRainMm), factor: RULES.heavyRainFactor, min: u.rain(RULES.heavyRainMinMm) })}</li>
          <li>{tp('rules.drySpell', { days: RULES.drySpellDays, mm: u.rain(RULES.dryDayMm) })}</li>
          <li>{tp('rules.heat', { temp: u.temp(RULES.heatC) })}</li>
          <li>{tp('rules.frost', { temp: u.temp(RULES.frostC) })}</li>
        </ul>
      </Section>

      <footer className="border-t border-neutral-300 pt-3 text-xs text-neutral-600">
        <a href={appHref} className="font-semibold text-emerald-800 underline">
          {t('openApp')}
        </a>
        {href && <p className="mt-1 break-all">{href}</p>}
      </footer>
    </article>
  );
}

export default function ReportView() {
  return (
    <QueryProvider>
      <div className="print-root min-h-dvh bg-white text-neutral-900 [print-color-adjust:exact]">
        <ReportBody />
      </div>
    </QueryProvider>
  );
}
