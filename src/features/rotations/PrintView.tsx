'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useSyncExternalStore } from 'react';
import { CROPS, rotationRows } from '@/features/field/crops';
import { demoFieldsById } from '@/features/field/demoFarms';
import { parseFieldParam } from '@/features/field/geometry';
import { toFieldInput } from '@/features/field/toFieldInput';
import { levelOf, PRIORITY_KEYS, rankStrategies } from '@/features/priorities/ranking';
import { decodePriorities, EQUIPMENT } from '@/features/priorities/store';
import { DEFAULT_PRIORITIES, SCORE_KEYS, type RotationStrategy } from '@/lib/api/contract';
import { useAnalysis } from '@/lib/api/hooks';
import { formatCoords } from '@/lib/geo';
import { QueryProvider } from '@/lib/query/client';
import { useUnits } from '@/lib/units';
import { applyScenario, isNeutral, RAIN_RANGE, TEMP_RANGE, type Scenario } from './whatIf';

const noopSubscribe = () => () => {};
/** Valor que solo existe en el navegador (URL, fecha local) sin romper la hidratación. */
function useClientValue<T>(get: () => T, server: T): T {
  return useSyncExternalStore(noopSubscribe, get, () => server);
}

const clampNum = (v: string | null, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};

function PrintTimeline({ s }: { s: RotationStrategy }) {
  const t = useTranslations('rotations');
  const tc = useTranslations('crops');
  const years = Math.max(1, Math.round(s.durationMonths / 12));
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: years }, (_, y) => {
        const row = rotationRows(s.seasons, years)[y]!;
        const names = [...new Set(row.filter(Boolean).map((x) => tc(x!.crop)))];
        return (
          <div key={y} className="flex items-center gap-2 text-[11px]">
            <span className="w-12 shrink-0 text-neutral-600">{t('timeline.year', { n: y + 1 })}</span>
            <div className="grid h-4 w-48 shrink-0 grid-cols-12 gap-px overflow-hidden rounded border border-neutral-300">
              {row.map((c, m) => (
                <span key={m} style={{ background: c ? CROPS[c.crop].color : '#fff' }} className={c ? '' : 'pattern-hatch text-neutral-300'} />
              ))}
            </div>
            <span>{names.join(' · ') || t('timeline.bare')}</span>
          </div>
        );
      })}
    </div>
  );
}

function PrintBody() {
  const t = useTranslations('print');
  const tr = useTranslations('rotations');
  const tp = useTranslations('priorities');
  const tc = useTranslations('crops');
  const locale = useLocale();
  const format = useFormatter();
  const params = useSearchParams();
  const u = useUnits();
  const appUrl = useClientValue(() => window.location.href.replace('/print', ''), '');
  const today = useClientValue(() => format.dateTime(new Date(), { dateStyle: 'long' }), '');

  const field = useMemo(() => {
    const p = params.get('field');
    return p ? parseFieldParam(p, demoFieldsById(locale)) : null;
  }, [params, locale]);
  const priorities = useMemo(
    () => decodePriorities(params.get('pr'), params.get('eq')?.split(',') ?? null, params.get('mk')?.split(',') ?? null) ?? DEFAULT_PRIORITIES,
    [params],
  );
  const scenario: Scenario = useMemo(
    () => ({
      rainPct: clampNum(params.get('wr'), RAIN_RANGE.min, RAIN_RANGE.max),
      tempC: clampNum(params.get('wt'), TEMP_RANGE.min, TEMP_RANGE.max),
    }),
    [params],
  );
  const input = useMemo(() => (field ? toFieldInput(field) : null), [field]);
  const analysis = useAnalysis(input, priorities);

  const ranked = useMemo(
    () => (analysis.data ? rankStrategies(analysis.data.strategies.map((s) => applyScenario(s, scenario)), priorities) : []),
    [analysis.data, priorities, scenario],
  );
  const current = ranked.find((r) => r.strategy.isCurrent);

  if (!field) return <p className="p-6">{t('noField')}</p>;

  const marketName = (m: string) =>
    m === 'livestock' ? tp('markets.livestock') : (CROPS as Record<string, unknown>)[m] ? tc(m as keyof typeof CROPS) : m;
  const isEquipment = (e: string): e is (typeof EQUIPMENT)[number] => (EQUIPMENT as readonly string[]).includes(e);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5 p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-12 items-center gap-2 rounded-full bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800"
        >
          <Printer aria-hidden className="size-5" />
          {t('printBtn')}
        </button>
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}
          className="flex min-h-12 items-center gap-2 rounded-full border border-neutral-300 px-5 font-semibold hover:bg-neutral-100"
        >
          <ArrowLeft aria-hidden className="size-5" />
          {t('back')}
        </button>
      </div>

      <header className="border-b-2 border-neutral-900 pb-3">
        <p className="text-xs font-bold tracking-widest text-emerald-800 uppercase">Field Shift · NASA Space Apps</p>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-neutral-700">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-neutral-600">{today && t('generated', { date: today })}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
        <div className="break-inside-avoid rounded-lg border border-neutral-300 p-3">
          <h2 className="mb-1 font-bold">{t('farm')}</h2>
          <p className="font-semibold">{field.name ?? t('unnamed')}</p>
          <p className="text-sm text-neutral-700">{formatCoords({ lng: field.center[0], lat: field.center[1] }, 3)}</p>
          {field.areaHa != null && <p className="text-sm text-neutral-700">{t('area', { area: u.area(field.areaHa) })}</p>}
          {analysis.data?.mock && <p className="mt-1 text-xs text-neutral-600">{t('mock')}</p>}
        </div>
        <div className="break-inside-avoid rounded-lg border border-neutral-300 p-3">
          <h2 className="mb-1 font-bold">{t('priorities')}</h2>
          <ul className="text-sm">
            {[...PRIORITY_KEYS]
              .sort((a, b) => priorities[b] - priorities[a])
              .map((k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{tp(`keys.${k}.title`)}</span>
                  <span className="font-semibold">{tp(`levels.${levelOf(priorities[k])}`)}</span>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-700">
            {tp('summary.irrigation')}: {tp(`irrigation.${priorities.constraints.irrigation}.title`)} · {tp('summary.equipment')}:{' '}
            {priorities.constraints.equipment.filter(isEquipment).map((e) => tp(`equipment.${e}`)).join(', ') || tp('summary.none')} ·{' '}
            {tp('summary.markets')}: {priorities.constraints.markets.map(marketName).join(', ') || tp('summary.none')}
          </p>
        </div>
      </section>

      {!isNeutral(scenario) && (
        <p className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm">
          {t('scenario', { rain: scenario.rainPct, temp: u.tempDelta(scenario.tempC) })}
        </p>
      )}

      {analysis.isPending ? (
        <p>{t('loading')}</p>
      ) : analysis.isError ? (
        <p role="alert">{t('error')}</p>
      ) : (
        <>
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">{t('ranking')}</h2>
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b-2 border-neutral-900">
                  <th scope="col" className="py-1 pr-2">#</th>
                  <th scope="col" className="py-1 pr-2">{t('option')}</th>
                  <th scope="col" className="py-1 pr-2 text-right">{tr('table.total')}</th>
                  {SCORE_KEYS.map((k) => (
                    <th key={k} scope="col" className="py-1 pr-1 text-right font-medium">
                      {tr(`scores.${k}`)}
                    </th>
                  ))}
                  <th scope="col" className="py-1 text-right">{tr('table.confidence')}</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.strategy.id} className="border-b border-neutral-300 align-top">
                    <td className="py-1 pr-2 font-bold">{r.rank}</td>
                    <td className="py-1 pr-2">
                      {r.strategy.name}
                      {r.strategy.isCurrent && <span className="block text-[10px] font-semibold text-sky-800">{tr('current')}</span>}
                    </td>
                    <td className="py-1 pr-2 text-right font-bold">{r.total}</td>
                    {SCORE_KEYS.map((k) => (
                      <td key={k} className="py-1 pr-1 text-right tabular-nums">
                        {r.strategy.scores[k]}
                      </td>
                    ))}
                    <td className="py-1 text-right">{tr(`confidence.${r.strategy.confidence}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-neutral-600">{t('formula')}</p>
          </section>

          {ranked.map((r) => (
            <section key={r.strategy.id} className="break-inside-avoid rounded-lg border border-neutral-300 p-3">
              <h2 className="text-base font-bold">
                {r.rank}. {r.strategy.name} · {r.total}/100
                {current && !r.strategy.isCurrent && (
                  <span className="ml-2 text-sm font-normal text-neutral-700">
                    ({r.total - current.total >= 0 ? '+' : '−'}
                    {Math.abs(r.total - current.total)} {t('vsToday')})
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm">{r.strategy.rationale}</p>
              <div className="mt-2">
                <PrintTimeline s={r.strategy} />
              </div>
              <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2 print:grid-cols-2">
                {r.strategy.benefits.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{tr('sections.benefits')}</h3>
                    <ul className="list-disc pl-5">
                      {r.strategy.benefits.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.strategy.evidence.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{tr('sections.evidence')}</h3>
                    <ul className="list-disc pl-5">
                      {r.strategy.evidence.map((e) => (
                        <li key={e.id}>
                          {!e.statement.startsWith(e.source) && <b>{e.source}: </b>}
                          {e.statement}
                          {e.rule && <> → {e.rule}</>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(r.strategy.risks.length > 0 || r.strategy.needsLocalReview.length > 0) && (
                  <div>
                    <h3 className="font-semibold">{tr('sections.risks')}</h3>
                    <ul className="list-disc pl-5">
                      {r.strategy.risks.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                      {r.strategy.needsLocalReview.map((x, i) => (
                        <li key={`r${i}`}>
                          <b>{tr('localReview')}:</b> {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.strategy.dataGaps.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{tr('sections.gaps')}</h3>
                    <ul className="list-disc pl-5">
                      {r.strategy.dataGaps.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-neutral-600">
                {tr(`confidence.${r.strategy.confidence}`)} — {tr(`confidenceWhy.${r.strategy.confidence}`)}
              </p>
            </section>
          ))}
        </>
      )}

      <p className="break-inside-avoid rounded-lg border-2 border-neutral-900 p-3 text-sm font-semibold">{tr('disclaimer')}</p>
      <footer className="text-[11px] text-neutral-600">
        <p>{t('sources')}</p>
        <p className="mt-1 break-all">
          {t('link')}: {appUrl}
        </p>
      </footer>
    </article>
  );
}

/** Resumen imprimible para llevar al técnico agrícola (ruta /print, estilos de papel). */
export default function PrintView() {
  return (
    <QueryProvider>
      <div className="print-root min-h-dvh bg-white text-neutral-900 [print-color-adjust:exact]">
        <PrintBody />
      </div>
    </QueryProvider>
  );
}
