'use client';

import clsx from 'clsx';
import { ArrowRight, CalendarRange, ChevronDown, ChevronRight, Info, Mountain, Repeat, Sparkles, Sprout } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, type ReactNode } from 'react';
import { ConfidenceChip } from '@/features/rotations/parts';
import { usePrioritiesStore } from '@/features/priorities/store';
import { useSurvey, useSurveyStore } from '@/features/survey/store';
import type { ClimateProfile, CropId, FieldInsights, SoilInfo } from '@/lib/api/contract';
import { useUnits } from '@/lib/units';
import { monthlyClimate } from './climate';
import { MixBuilder } from './MixBuilder';
import { MixDetail } from './MixDetail';
import {
  mainCrop,
  rankGuilds,
  recommend,
  surveyAnswered,
  twoYearPlan,
  type Candidate,
  type MixContext,
  type Recommendation,
  type TwoYearPlan,
} from './planner';
import { calendarRows, CropRow, NoteList, Score, SowCalendar, useMixCrops, useMixName, useMonths } from './parts';
import { useMixedStore } from './store';
import { StrataDiagram } from './StrataDiagram';

const SurveyCard = dynamic(() => import('@/features/survey/SurveyCard'), { ssr: false });

type Props = {
  fieldId: string;
  climate?: ClimateProfile;
  /** El clima viene de NASA POWER real (no del mock del análisis). */
  climateReal: boolean;
  /** Altura de la finca (m, del análisis/SRTM) para corregir la temperatura de la celda de NASA POWER. */
  farmElevationM?: number | null;
  insights?: FieldInsights;
  soil?: SoilInfo;
  /** Cultivos de la rotación actual (para armar mezclas desde lo que ya siembra). */
  currentCrops: CropId[];
  loading: boolean;
};

function Card({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={clsx('flex flex-col gap-3 rounded-3xl p-4 ring-1', className ?? 'bg-white/5 ring-line')}>
      {children}
    </section>
  );
}

/**
 * "Tu plan": cultivos que crecen bien juntos (asociaciones como las tres hermanas), según el clima de la finca
 * (NASA POWER), las alturas y raíces de cada planta, cómo se ayudan, la encuesta del terreno y las prioridades.
 * Termina en una recomendación concreta y un plan de 2 años que asocia en el espacio y rota en el tiempo.
 */
export default function PlanView({ fieldId, climate, climateReal, farmElevationM, insights, soil, currentCrops, loading }: Props) {
  const t = useTranslations('mixed');
  const priorities = usePrioritiesStore((s) => s.priorities);
  const survey = useSurvey(fieldId);
  const answering = useSurveyStore((s) => s.draft?.fieldId === fieldId);
  const detail = useMixedStore((s) => s.detail);
  const showAll = useMixedStore((s) => s.showAll);
  const { openDetail, setShowAll, syncField } = useMixedStore.getState();
  const name = useMixName();

  useEffect(() => syncField(fieldId), [fieldId, syncField]);

  const monthly = useMemo(() => (climate ? monthlyClimate(climate, farmElevationM) : null), [climate, farmElevationM]);
  const u = useUnits();
  const ctx = useMemo<MixContext>(
    () => ({
      climate: monthly,
      water: { irrigation: priorities.constraints.irrigation, drainage: soil?.drainage, texture: soil?.texture },
      soil,
      erosion: insights?.erosionRisk.level,
      waterlogging: insights?.waterloggingRisk?.level,
      survey,
      priorities,
      known: currentCrops,
    }),
    [monthly, priorities, soil, insights, survey, currentCrops],
  );
  const ranked = useMemo(() => (monthly ? rankGuilds(ctx) : []), [ctx, monthly]);
  const rec = useMemo(() => (monthly ? recommend(ctx, currentCrops, { climateReal, ranked }) : null), [ctx, currentCrops, climateReal, ranked, monthly]);
  const plan = useMemo(() => (rec ? twoYearPlan(rec, ctx, currentCrops) : null), [rec, ctx, currentCrops]);

  if (loading || !monthly) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <p className="text-sm text-ink-muted">{t('loading')}</p>
        <div aria-hidden className="shimmer h-56 rounded-3xl" />
        <div aria-hidden className="shimmer h-32 rounded-3xl" />
      </div>
    );
  }

  // Detalle de una mezcla (pantalla completa del sheet).
  const opened = resolveDetail(detail, rec, plan, ranked);
  if (opened) {
    return (
      <MotionConfig reducedMotion="user">
        <MixDetail
          candidate={opened.candidate}
          cover={opened.cover}
          kicker={t(`kickers.${opened.kind}`)}
          gaps={rec?.gaps ?? ['varieties']}
          onBack={() => openDetail(null)}
        />
      </MotionConfig>
    );
  }

  const viable = ranked.filter((r) => r.eval.viable);
  const notHere = ranked.filter((r) => !r.eval.viable);
  const shown = showAll ? viable : viable.slice(0, 4);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-bold">{t('title')}</h3>
          <p className="text-sm text-ink-muted">{t('hint')}</p>
        </div>

        {(answering || surveyAnswered(survey) < 2) && <SurveyCard fieldId={fieldId} suggested={currentCrops} />}

        {Boolean(monthly.shiftC) && monthly.sourceElevationM != null && farmElevationM != null && (
          <p className="flex items-start gap-2 rounded-2xl bg-sky-glow/10 p-3 text-xs ring-1 ring-sky-glow/30">
            <Mountain aria-hidden className="mt-0.5 size-4 shrink-0 text-sky-glow" />
            {t('elevationNote', {
              cell: u.length(monthly.sourceElevationM),
              farm: u.length(farmElevationM),
              shift: u.tempDelta(Math.abs(monthly.shiftC ?? 0)),
              dir: (monthly.shiftC ?? 0) > 0 ? 'warmer' : 'colder',
            })}
          </p>
        )}

        {rec ? <Hero rec={rec} onOpen={openDetail} /> : <p className="text-sm text-ink-muted">{t('noRec')}</p>}

        {plan && rec && <PlanCard plan={plan} onOpen={openDetail} />}

        <section aria-labelledby="guilds-title" className="flex flex-col gap-2">
          <div>
            <h4 id="guilds-title" className="flex items-center gap-2 font-bold">
              <Sprout aria-hidden className="size-5 text-field-300" />
              {t('guilds.title')}
            </h4>
            <p className="text-sm text-ink-muted">{t('guilds.hint')}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {shown.map((r, i) => (
              <li key={r.guild.id}>
                <GuildRow
                  c={{ members: r.guild.members, eval: r.eval, guild: r.guild }}
                  rank={i + 1}
                  onOpen={() => openDetail(`guild:${r.guild.id}`)}
                />
              </li>
            ))}
          </ul>
          {viable.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              aria-expanded={showAll}
              className="flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 text-sm font-semibold text-field-300 hover:bg-white/5"
            >
              <ChevronDown aria-hidden className={clsx('size-4 transition-transform', showAll && 'rotate-180')} />
              {showAll ? t('guilds.fewer') : t('guilds.more', { n: viable.length - 4 })}
            </button>
          )}
          {notHere.length > 0 && (
            <details className="rounded-2xl bg-white/5 ring-1 ring-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <Info aria-hidden className="size-4 text-ink-muted" />
                <span className="flex-1">{t('guilds.notHere', { n: notHere.length })}</span>
                <ChevronDown aria-hidden className="size-4" />
              </summary>
              <ul className="flex flex-col gap-2 px-3 pb-3">
                {notHere.map((r) => (
                  <li key={r.guild.id} className="text-sm">
                    <p className="font-semibold">{name({ members: r.guild.members, eval: r.eval, guild: r.guild })}</p>
                    <NoteList notes={r.eval.notes.filter((n) => n.id === 'cold' || n.id === 'dry').slice(0, 2)} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <MixBuilder ctx={ctx} initial={rec?.mix.eval.crops ?? []} />

        <Formula />
        <p className="flex items-start gap-2 rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-sky-glow" />
          {t('disclaimer')}
        </p>
      </div>
    </MotionConfig>
  );
}

type Opened = { candidate: Candidate; cover: TwoYearPlan['years'][number]['cover']; kind: 'rec' | 'year2' | 'guild' };

function resolveDetail(key: string | null, rec: Recommendation | null, plan: TwoYearPlan | null, ranked: ReturnType<typeof rankGuilds>): Opened | null {
  if (!key) return null;
  if (key === 'rec' && rec) return { candidate: rec.mix, cover: plan?.years[0]?.cover ?? null, kind: 'rec' };
  if (key === 'year2' && plan?.years[1]) return { candidate: plan.years[1].candidate, cover: plan.years[1].cover, kind: 'year2' };
  if (key.startsWith('guild:')) {
    const r = ranked.find((x) => x.guild.id === key.slice(6));
    if (r) return { candidate: { members: r.guild.members, eval: r.eval, guild: r.guild }, cover: null, kind: 'guild' };
  }
  if (key.startsWith('alt:') && rec) {
    const alt = rec.alternatives[Number(key.slice(4))];
    if (alt) return { candidate: alt, cover: null, kind: 'guild' };
  }
  return null;
}

// ---------------------------------------------------------------- recomendación

function Hero({ rec, onOpen }: { rec: Recommendation; onOpen: (key: string) => void }) {
  const t = useTranslations('mixed');
  const tr = useTranslations('rotations');
  const tc = useTranslations('crops');
  const name = useMixName();
  const cropsLine = useMixCrops();
  const months = useMonths('long');
  const e = rec.mix.eval;
  const main = e.members.find((m) => m.crop === rec.crop);
  const good = e.notes.filter((n) => n.tone === 'good');
  const warn = e.notes.filter((n) => n.tone === 'warn');
  const ordered = [rec.crop, ...rec.partners];

  return (
    <Card labelledBy="rec-title" className="bg-field-500/10 ring-field-500/60">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-field-300 uppercase">
            <Sparkles aria-hidden className="size-4" />
            {t('recommend.kicker')}
          </p>
          <h4 id="rec-title" className="mt-0.5 text-xl leading-snug font-bold">
            {name(rec.mix)}
          </h4>
          {rec.mix.guild && <p className="text-sm text-ink-muted">{cropsLine(rec.mix)}</p>}
        </div>
        <Score value={e.total} />
      </div>

      <CropRow crops={ordered} size="lg" />

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        {main?.window && !main.perennial ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-ink">
            {t('recommend.sow', { crop: tc(rec.crop), month: months[main.window.sow - 1]! })}
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-ink">{t('recommend.allYear')}</span>
        )}
        <ConfidenceChip confidence={rec.confidence} />
        <span>{tr(`confidenceWhy.${rec.confidence}`)}</span>
      </div>

      <StrataDiagram space={e.space} title={t('strata.diagramTitle', { name: name(rec.mix) })} />

      <div>
        <p className="mb-1 font-semibold">{t('recommend.why')}</p>
        <NoteList notes={[...good.slice(0, 3), ...warn.slice(0, 1)]} />
      </div>

      <p className="text-xs text-ink-muted">{t(`recommend.basedOn.${rec.basedOn}`)}</p>

      <button
        type="button"
        onClick={() => onOpen('rec')}
        className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
      >
        {t('recommend.seePlan')}
        <ArrowRight aria-hidden className="size-4" />
      </button>

      {rec.alternatives.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-muted">{t('recommend.alternatives')}</p>
          <ul className="flex flex-col gap-1.5">
            {rec.alternatives.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onOpen(a.guild ? `guild:${a.guild.id}` : `alt:${i}`)}
                  className="flex min-h-12 w-full items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-left text-sm ring-1 ring-line hover:bg-white/10"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{name(a)}</span>
                    <span className="block text-xs text-ink-muted">{t('recommend.altScore', { n: a.eval.total, crop: tc(mainCrop(a)) })}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- plan de 2 años

function PlanCard({ plan, onOpen }: { plan: TwoYearPlan; onOpen: (key: string) => void }) {
  const t = useTranslations('mixed.plan');
  const name = useMixName();
  return (
    <Card labelledBy="plan-title">
      <div>
        <h4 id="plan-title" className="flex items-center gap-2 font-bold">
          <CalendarRange aria-hidden className="size-5 text-field-300" />
          {plan.perennial ? t('titlePerennial') : t('title')}
        </h4>
        <p className="text-sm text-ink-muted">{plan.perennial ? t('perennial') : t('hint')}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {plan.years.map((y, i) => (
          <li key={i} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold">{t('year', { n: i + 1 })}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{name(y.candidate)}</span>
              {i > 0 && <Repeat aria-hidden className="size-4 text-ink-muted" />}
            </div>
            <SowCalendar rows={calendarRows(y.candidate.eval, y.cover)} label={t('year', { n: i + 1 })} />
            {y.cover && <p className="text-xs text-ink-muted">{t('coverNote')}</p>}
            {i === 1 && (
              <button
                type="button"
                onClick={() => onOpen('year2')}
                className="flex min-h-11 items-center gap-1.5 self-start rounded-full bg-white/10 px-3.5 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
              >
                {t('seeYear2')}
                <ChevronRight aria-hidden className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ol>
      {!plan.perennial && plan.years.length > 1 && <p className="text-xs text-ink-faint">{t('why')}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------- asociaciones

function GuildRow({ c, rank, onOpen }: { c: Candidate; rank: number; onOpen: () => void }) {
  const t = useTranslations('mixed');
  const name = useMixName();
  const top = c.eval.notes.find((n) => n.tone === 'good');
  return (
    <article aria-labelledby={`g-${c.guild?.id}`} className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold tabular-nums">
          <span className="sr-only">{t('rank', { rank })}</span>
          <span aria-hidden>{rank}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h5 id={`g-${c.guild?.id}`} className="leading-snug font-bold">
            {name(c)}
          </h5>
          <div className="mt-1">
            <CropRow crops={c.eval.crops} />
          </div>
        </div>
        <Score value={c.eval.total} />
      </div>
      {top && <NoteList notes={[top]} />}
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('seeFor', { name: name(c) })}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
      >
        {t('recommend.seePlan')}
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </article>
  );
}

function Formula() {
  const t = useTranslations('mixed.formula');
  return (
    <details className="rounded-2xl bg-white/5 ring-1 ring-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Info aria-hidden className="size-4 text-sky-glow" />
        <span className="flex-1">{t('title')}</span>
        <ChevronDown aria-hidden className="size-4" />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3 text-sm">
        <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
          {(['climate', 'synergy', 'space', 'soil', 'fit'] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        <p>{t('total')}</p>
        <p className="text-xs text-ink-muted">{t('limits')}</p>
      </div>
    </details>
  );
}
