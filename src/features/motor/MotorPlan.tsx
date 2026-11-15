'use client';

import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Database,
  FlaskConical,
  Gauge,
  Info,
  Loader2,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  ThumbsUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import type { SelectedField } from '@/features/field/types';
import { stripMarkdown } from '@/features/narrator/narrator';
import { SpeakButton } from '@/features/narrator/SpeakButton';
import { ApiError } from '@/lib/api/client';
import type { CropSeason, FieldSurvey, SoilInfo } from '@/lib/api/contract';
import type { MotorAdvisor, MotorCandidate, MotorFinding, MotorPlan as Plan, MotorValue, MotorZone } from '@/lib/api/motor';
import {
  MOTOR_CROPS,
  MOTOR_HISTORY_CROPS,
  MOTOR_RESIDUES,
  MOTOR_STAGES,
  symptomsFor,
  type MotorCrop,
  type MotorHistoryCrop,
  type MotorResidue,
  type MotorStage,
  type MotorSymptom,
} from '@/lib/motorCatalog';
import { useUnits } from '@/lib/units';
import { useMotorInputs, useMotorPlan, useMotorZone, type MotorInputs } from './hooks';
import { useMotorProgress, type MotorProgress } from './progress';
import { useMotorAnswers, useMotorStore, type MotorAnswers } from './store';

type Props = {
  field: SelectedField;
  seasons: readonly CropSeason[];
  soil: SoilInfo | undefined;
  survey: FieldSurvey | null;
  onOpenConditions: () => void;
  onOpenOptions: () => void;
};

const LEVEL_STYLE = {
  high: { icon: ShieldAlert, cls: 'bg-risk-high/15 text-risk-high ring-risk-high/40' },
  medium: { icon: AlertTriangle, cls: 'bg-risk-medium/15 text-risk-medium ring-risk-medium/40' },
  low: { icon: CheckCircle2, cls: 'bg-risk-low/15 text-risk-low ring-risk-low/40' },
  unknown: { icon: CircleHelp, cls: 'bg-white/5 text-ink-muted ring-line' },
} as const;

const STATUS_STYLE: Record<MotorCandidate['status'], { icon: LucideIcon; cls: string }> = {
  favorecido: { icon: CheckCircle2, cls: 'bg-field-500/20 text-field-300 ring-field-500/50' },
  aceptable: { icon: ThumbsUp, cls: 'bg-sky-glow/15 text-sky-glow ring-sky-glow/40' },
  con_reservas: { icon: AlertTriangle, cls: 'bg-risk-medium/15 text-risk-medium ring-risk-medium/40' },
  desaconsejado: { icon: XCircle, cls: 'bg-risk-high/15 text-risk-high ring-risk-high/40' },
  sin_evaluar: { icon: CircleHelp, cls: 'bg-white/5 text-ink-muted ring-line' },
};

/**
 * Pestaña "Recomendación": plan de rotación del motor agronómico del equipo. Arranca solo: 1) pide los datos de la
 * zona de la finca (NASA POWER + terreno), 2) se los pasa al motor con lo que contó la persona. Cada hallazgo
 * muestra su porqué, su certeza y lo que falta (principio de honestidad).
 */
export default function MotorPlan({ field, seasons, soil, survey, onOpenConditions, onOpenOptions }: Props) {
  const t = useTranslations('motor');
  const locale = useLocale();
  const answers = useMotorAnswers(field.id);
  const inputs = useMotorInputs(answers, seasons, survey, soil);
  const zone = useMotorZone(field);
  const plan = useMotorPlan(field, zone.data, inputs);
  const progress = useMotorProgress(field.id);
  const data = plan.data;
  const updating = plan.isFetching && plan.isPlaceholderData;
  const setAnswers = (patch: MotorAnswers) => useMotorStore.getState().set(field.id, patch);

  const failed = zone.isError ? 'zone' : plan.isError && !data ? 'plan' : null;

  return (
    <div className="flex flex-col gap-5" aria-busy={!data || updating}>
      {(!data || failed) && <Steps zone={zone} plan={plan} progress={progress} failed={failed} />}
      {failed && (
        <ErrorBox
          message={failed === 'zone' ? t('error.zone') : planError(plan.error, t)}
          onRetry={() => void (failed === 'zone' ? zone.refetch() : plan.refetch())}
        />
      )}

      {/* El lector de pantalla oye cuándo quedó listo (también tras regenerar). */}
      <p role="status" aria-live="polite" className="sr-only">
        {data && !updating ? t('ready', { risk: t(`risk.${data.risk.overall}`) }) : updating ? t('updating') : ''}
      </p>

      {data && zone.data && (
        <>
          <div className="flex flex-col gap-2">
            {data.source === 'mock' && <Notice icon={FlaskConical}>{t('mockNote')}</Notice>}
            {data.accepted === 'no-series' && <Notice icon={Info}>{t('acceptedNoSeries')}</Notice>}
            {data.accepted === 'minimal' && <Notice icon={Info}>{t('acceptedMinimal')}</Notice>}
            {locale === 'en' && <p className="text-xs text-ink-faint">{t('spanishOnly')}</p>}
          </div>

          <header className={clsx('flex flex-col gap-1 transition-opacity', updating && 'opacity-60')}>
            <h3 className="text-xl font-bold">{t('title')}</h3>
            <ContextLine plan={data} />
            {updating && (
              <p className="flex items-center gap-1.5 text-sm text-field-300">
                <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
                {progress?.stage === 'advisor' ? t('updatingAdvisor') : t('updating')}
              </p>
            )}
            {/* Una nueva revisión falló: se sigue viendo el plan anterior, ya revisado, con el aviso. */}
            {plan.isError && <p className="text-sm text-risk-medium">{planError(plan.error, t)}</p>}
          </header>

          <AdvisorCard advisor={data.advisor} />

          <RiskBanner plan={data} />
          <NextCrops plan={data} inputs={inputs} onLast={(last) => setAnswers({ last })} />
          <Findings findings={data.findings} />
          <Refine key={JSON.stringify(inputs)} inputs={inputs} onApply={setAnswers} onOpenConditions={onOpenConditions} />
          <Practices plan={data} />
          <Gaps plan={data} />
          <DataUsed plan={data} zone={zone.data} inputs={inputs} />
          <Cautions items={[...data.cautions, ...data.rotation.cautions]} />

          <p className="rounded-2xl bg-white/5 p-3 text-sm text-ink-muted ring-1 ring-line">{t('disclaimer')}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onOpenOptions}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
            >
              {t('actions.options')}
              <ArrowRight aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              onClick={onOpenConditions}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/5 px-5 font-semibold ring-1 ring-line hover:bg-white/10"
            >
              {t('actions.conditions')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslations<'motor'>>;

function planError(err: Error | null, t: T) {
  if (err instanceof ApiError) {
    if (err.status === 429) return t('error.busy');
    if (err.message.startsWith('advisor_')) return err.message === 'advisor_timeout' ? t('error.advisorTimeout') : t('error.advisor');
    if (err.status === 422 || err.status === 400) return t('error.invalid');
  }
  return t('error.motor');
}

const advisorFailed = (err: Error | null) => err instanceof ApiError && err.message.startsWith('advisor_');

const varLabel = (t: T, v: string) => (t.has(`vars.${v}`) ? t(`vars.${v}` as never) : v.replaceAll('_', ' '));

// ---------------------------------------------------------------- progreso

function Steps({
  zone,
  plan,
  progress,
  failed,
}: {
  zone: ReturnType<typeof useMotorZone>;
  plan: ReturnType<typeof useMotorPlan>;
  progress: MotorProgress | null;
  failed: 'zone' | 'plan' | null;
}) {
  const t = useTranslations('motor.steps');
  const z = zone.data;
  const zoneText = z
    ? z.powerCellsOk === 0
      ? t('zoneNoPower')
      : [t('zoneDone', { days: z.days.length }), z.summary.slopePct != null ? t('zoneSlope', { slope: `${z.summary.slopePct} %` }) : null]
          .filter(Boolean)
          .join(' · ')
    : t('zoneLoading');
  const advisorError = failed === 'plan' && advisorFailed(plan.error);
  const atAdvisor = progress?.stage === 'advisor' || advisorError;
  const planState = failed === 'plan' && !advisorError ? 'error' : plan.data || atAdvisor ? 'done' : z ? 'loading' : 'waiting';
  const advisorState = advisorError ? 'error' : plan.data ? 'done' : progress?.stage === 'advisor' ? 'loading' : 'waiting';
  const tools = progress?.tools ?? 0;
  return (
    <ol aria-label={t('label')} className="flex flex-col gap-2">
      <Step n={1} state={failed === 'zone' ? 'error' : z ? 'done' : 'loading'} title={t('zone')} text={zoneText} />
      <Step
        n={2}
        state={planState}
        title={t('motor')}
        text={
          plan.data?.gaps.rulesEvaluated != null && plan.data.gaps.rulesInCatalog != null
            ? t('motorDone', { evaluated: plan.data.gaps.rulesEvaluated, total: plan.data.gaps.rulesInCatalog })
            : planState === 'waiting'
              ? t('motorWaiting')
              : planState === 'done'
                ? t('motorReady')
                : t('motorLoading')
        }
      />
      <Step
        n={3}
        state={advisorState}
        title={t('advisor')}
        text={
          advisorState === 'loading'
            ? [t('advisorLoading'), tools > 0 ? t('advisorTools', { n: tools }) : null].filter(Boolean).join(' · ')
            : advisorState === 'done'
              ? t('advisorDone')
              : t('advisorWaiting')
        }
      />
    </ol>
  );
}

function Step({ n, state, title, text }: { n: number; state: 'waiting' | 'loading' | 'done' | 'error'; title: string; text: string }) {
  const Icon = state === 'done' ? Check : state === 'error' ? XCircle : state === 'loading' ? Loader2 : null;
  return (
    <li
      className={clsx(
        'flex items-start gap-3 rounded-2xl p-3 ring-1',
        state === 'loading' ? 'bg-field-500/10 ring-field-500/40' : state === 'error' ? 'bg-risk-high/10 ring-risk-high/40' : 'bg-white/5 ring-line',
      )}
    >
      <span
        className={clsx(
          'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold',
          state === 'done' ? 'bg-field-500 text-black' : state === 'error' ? 'bg-risk-high/20 text-risk-high' : 'bg-white/10',
        )}
      >
        {Icon ? <Icon aria-hidden className={clsx('size-4', state === 'loading' && 'motion-safe:animate-spin')} /> : n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-muted">{text}</span>
      </span>
    </li>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('motor.error');
  return (
    <div role="alert" className="rounded-2xl bg-risk-medium/10 p-4 text-sm ring-1 ring-risk-medium/40">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 font-semibold">
        <RotateCcw aria-hidden className="size-4" />
        {t('retry')}
      </button>
    </div>
  );
}

function Notice({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-2xl bg-sun/10 p-3 text-sm ring-1 ring-sun/40">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-sun" />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------- recomendación de AgroAstro

/** Informe de AgroAstro (agente de Claude) sobre la salida del motor. Los títulos del informe van como h5. */
function AdvisorCard({ advisor }: { advisor: MotorAdvisor }) {
  const t = useTranslations('motor.advisor');
  const heading = ({ children }: { children?: ReactNode }) => <h5 className="mt-4 mb-1 font-bold first:mt-0">{children}</h5>;
  return (
    <section aria-labelledby="motor-advisor" className="rounded-2xl bg-field-500/10 p-4 ring-1 ring-field-500/40">
      <div className="flex items-start gap-2">
        <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-field-300" />
        <div className="min-w-0 flex-1">
          <h4 id="motor-advisor" className="text-lg leading-tight font-bold">
            {t('title')}
          </h4>
          <p className="mt-0.5 text-xs text-ink-muted">
            {advisor.source === 'mock' ? t('mockNote') : t('hint', { n: advisor.toolCalls })}
          </p>
        </div>
        <SpeakButton
          id={`advisor:${advisor.sessionId ?? 'mock'}`}
          compact
          label={t('listen')}
          text={() => stripMarkdown(advisor.markdown)}
        />
      </div>
      <div className="chat-md mt-3 text-sm">
        <ReactMarkdown
          rehypePlugins={[rehypeSanitize]}
          components={{
            h1: heading,
            h2: heading,
            h3: heading,
            h4: heading,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-field-300 underline underline-offset-2">
                {children}
              </a>
            ),
          }}
        >
          {advisor.markdown}
        </ReactMarkdown>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t('verify')}</p>
    </section>
  );
}

// ---------------------------------------------------------------- cabecera y riesgo

function range(v: MotorValue | null, fmt: (n: number) => string) {
  if (!v) return null;
  if (v.min != null && v.max != null) return v.min === v.max ? fmt(v.min) : `${fmt(v.min)} – ${fmt(v.max)}`;
  return v.text;
}

function ContextLine({ plan }: { plan: Plan }) {
  const t = useTranslations('motor.ctx');
  const u = useUnits();
  const c = plan.context;
  const alt = range(c.altitude, u.length);
  const parts = [
    c.crop && c.cropKey !== 'otro' ? t('crop', { crop: c.crop }) : t('noCrop'),
    c.stage ? t('stage', { stage: c.stage }) : null,
    c.thermalFloor ? t('floor', { floor: c.thermalFloor }) : null,
    alt ? t('altitude', { alt }) : null,
  ].filter(Boolean);
  return <p className="text-sm text-ink-muted">{parts.join(' · ')}</p>;
}

function RiskBanner({ plan }: { plan: Plan }) {
  const t = useTranslations('motor.risk');
  const style = LEVEL_STYLE[plan.risk.overall];
  const active = plan.findings.filter((f) => !f.superseded).length;
  return (
    <div className={clsx('flex items-center gap-3 rounded-2xl p-4 ring-1', style.cls)}>
      <style.icon aria-hidden className="size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t('title')}</p>
        <p className="text-2xl leading-tight font-bold">{t(plan.risk.overall)}</p>
        <p className="text-sm text-ink-muted">
          {t('findings', { n: active })} · {t('hint')}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- qué sembrar después

function NextCrops({ plan, inputs, onLast }: { plan: Plan; inputs: MotorInputs; onLast: (c: MotorHistoryCrop) => void }) {
  const t = useTranslations('motor');
  const tn = useTranslations('motor.next');
  const { situation, candidates } = plan.rotation;
  const noHistory = situation === 'sin_historial' || inputs.history.length === 0;
  const evaluated = candidates.filter((c) => c.status !== 'sin_evaluar');
  const top = evaluated.slice(0, 3);
  const rest = evaluated.slice(3);
  const last = inputs.history[0];

  return (
    <section aria-labelledby="motor-next" className="flex flex-col gap-3">
      <h4 id="motor-next" className="flex flex-wrap items-center gap-x-2 text-lg font-bold">
        <Sprout aria-hidden className="size-5 text-field-300" />
        {tn('title')}
        <span className="text-sm font-normal">
          <GlossaryLink term="crop-rotation" />
        </span>
      </h4>

      {noHistory ? (
        <div className="rounded-2xl bg-field-500/10 p-4 ring-1 ring-field-500/40">
          <p className="font-semibold" id="motor-ask-last">
            {tn('askTitle')}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{tn('askText')}</p>
          <div role="group" aria-labelledby="motor-ask-last" className="mt-3 flex flex-wrap gap-2">
            {MOTOR_HISTORY_CROPS.map((c) => (
              <Chip key={c} pressed={false} onClick={() => onLast(c)}>
                {t(`crops.${c}`)}
              </Chip>
            ))}
          </div>
        </div>
      ) : situation === 'cana_establecida' ? (
        <p className="rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">{tn('established')}</p>
      ) : evaluated.length === 0 ? (
        <p className="rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">{tn('none')}</p>
      ) : (
        <>
          {last && <p className="text-sm text-ink-muted">{tn('after', { crop: last.map((c) => t(`crops.${c}`)).join(' + ') })}</p>}
          <ol className="flex flex-col gap-2">
            {top.map((c, i) => (
              <CandidateCard key={c.cropKey} c={c} rank={i + 1} />
            ))}
          </ol>
          {rest.length > 0 && (
            <Disclosure title={tn('more', { n: rest.length })}>
              <ol className="flex flex-col gap-2" start={4}>
                {rest.map((c, i) => (
                  <CandidateCard key={c.cropKey} c={c} rank={i + 4} />
                ))}
              </ol>
            </Disclosure>
          )}
        </>
      )}
    </section>
  );
}

function CandidateCard({ c, rank }: { c: MotorCandidate; rank: number }) {
  const t = useTranslations('motor');
  const style = STATUS_STYLE[c.status];
  const lead = c.reasons.find((r) => r.effect !== 'note') ?? c.reasons[0];
  return (
    <li className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold tabular-nums" aria-hidden>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{c.crop}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1', style.cls)}>
              <style.icon aria-hidden className="size-3.5" />
              {t(`status.${c.status}`)}
            </span>
            {c.family && <span className="text-ink-muted">{t('next.family', { family: c.family })}</span>}
          </p>
          {lead && <p className="mt-2 text-sm">{lead.message || lead.title}</p>}
        </div>
      </div>
      {(c.reasons.length > 1 || c.guidance.length > 0 || c.missing.length > 0) && (
        <details className="group mt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-field-300 [&::-webkit-details-marker]:hidden">
            {t('next.why')}
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="flex flex-col gap-2 text-sm">
            {c.reasons.map((r, i) => (
              <li key={`${r.id}-${i}`}>
                <span className="font-semibold">{t(`effect.${r.effect}`)}:</span> {r.title}
                {r.message && r.message !== r.title && <span className="block text-ink-muted">{r.message}</span>}
                {r.cautions.map((x) => (
                  <span key={x} className="block text-xs text-ink-faint">
                    {x}
                  </span>
                ))}
              </li>
            ))}
            {c.guidance.length > 0 && (
              <li>
                <span className="font-semibold">{t('next.guidance')}:</span>
                {c.guidance.map((g) => (
                  <span key={g.id + g.title} className="block text-ink-muted">
                    {g.message || g.title}
                  </span>
                ))}
              </li>
            )}
            {c.missing.length > 0 && (
              <li className="text-ink-muted">{t('next.missing', { what: c.missing.map((v) => varLabel(t, v)).join(', ') })}</li>
            )}
          </ul>
        </details>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- hallazgos

function Findings({ findings }: { findings: MotorFinding[] }) {
  const t = useTranslations('motor.findings');
  const active = findings.filter((f) => !f.superseded);
  const context = findings.filter((f) => f.superseded);
  return (
    <section aria-labelledby="motor-findings" className="flex flex-col gap-3">
      <h4 id="motor-findings" className="flex items-center gap-2 text-lg font-bold">
        <ShieldAlert aria-hidden className="size-5 text-field-300" />
        {t('title')}
      </h4>
      {active.length === 0 && <p className="rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">{t('none')}</p>}
      <ul className="flex flex-col gap-2">
        {active.map((f) => (
          <FindingCard key={f.id} f={f} />
        ))}
      </ul>
      {context.length > 0 && (
        <Disclosure title={t('context')}>
          <ul className="flex flex-col gap-2">
            {context.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  );
}

function FindingCard({ f }: { f: MotorFinding }) {
  const t = useTranslations('motor');
  const tf = useTranslations('motor.findings');
  const sev = LEVEL_STYLE[f.severity];
  return (
    <li className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1', sev.cls)}>
          <sev.icon aria-hidden className="size-3.5" />
          {tf(`severity.${f.severity}`)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-semibold">
          <Gauge aria-hidden className="size-3.5" />
          {t('certainty.label', { level: t(`certainty.${f.certainty}`) })}
        </span>
      </p>
      <h5 className="mt-2 font-bold">{f.title}</h5>
      {f.observation && <p className="mt-1 text-sm text-ink-muted">{f.observation}</p>}
      {f.recommendation && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">{tf('whatToDo')}:</span> {f.recommendation}
        </p>
      )}
      <details className="group mt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-field-300 [&::-webkit-details-marker]:hidden">
          {tf('why')}
          <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-2 text-sm">
          <ul className="flex flex-col gap-1.5">
            {f.why.map((w, i) => (
              <li key={i} className="rounded-xl bg-black/20 p-2">
                <span className="font-semibold">{w.label}:</span> {w.observed}
                {w.operator && w.threshold && <span className="text-ink-muted"> ({tf('threshold', { op: w.operator, threshold: w.threshold })})</span>}
                {w.source && <span className="block text-xs text-ink-muted">{tf('source', { source: w.source })}</span>}
                {w.period && <span className="block text-xs text-ink-muted">{tf('period', { period: w.period })}</span>}
                {w.quality && <span className="block text-xs text-ink-muted">{tf('quality', { quality: w.quality })}</span>}
              </li>
            ))}
          </ul>
          {f.limiting.length > 0 && <p className="text-ink-muted">{tf('limiting', { list: f.limiting.join(', ') })}</p>}
          {f.uncalibrated && <p className="text-ink-muted">{tf('uncalibrated')}</p>}
          <p>
            <GlossaryLink term="confidence" />
          </p>
          {f.cautions.length > 0 && (
            <div>
              <p className="font-semibold">{tf('cautions')}</p>
              <ul className="list-disc pl-5 text-ink-muted">
                {f.cautions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {f.sources.length > 0 && (
            <div>
              <p className="font-semibold">{tf('sources')}</p>
              <ul className="flex flex-col gap-1">
                {f.sources.map((s) => (
                  <li key={s.title}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-field-300 underline underline-offset-2">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                    {s.publisher && <span className="text-ink-muted"> · {s.publisher}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

// ---------------------------------------------------------------- afinar

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1',
        pressed ? 'bg-field-500 text-black ring-field-500' : 'bg-white/5 ring-line hover:bg-white/10',
      )}
    >
      {pressed && <Check aria-hidden className="size-4" />}
      {children}
    </button>
  );
}

function Question({ id, label, help, children }: { id: string; label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="flex flex-wrap items-center gap-x-2 font-semibold">
        {label}
        {help && <span className="text-sm font-normal">{help}</span>}
      </p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}

/** Respuestas rápidas que el motor usa. Se arman en un borrador y se aplican con un botón (cada plan se guarda). */
function Refine({
  inputs,
  onApply,
  onOpenConditions,
}: {
  inputs: MotorInputs;
  onApply: (a: MotorAnswers) => void;
  onOpenConditions: () => void;
}) {
  const t = useTranslations('motor');
  const tr = useTranslations('motor.refine');
  const [crop, setCrop] = useState<MotorCrop | null>(inputs.crop);
  const [stage, setStage] = useState<MotorStage | null>(inputs.stage);
  const [symptoms, setSymptoms] = useState<MotorSymptom[]>(inputs.symptoms);
  const [last, setLast] = useState<MotorHistoryCrop | null>((inputs.history[0]?.[0] as MotorHistoryCrop | undefined) ?? null);
  const [residue, setResidue] = useState<MotorResidue | null>(inputs.residue);
  const allowed = symptomsFor(crop);

  const changed =
    crop !== inputs.crop ||
    stage !== inputs.stage ||
    residue !== inputs.residue ||
    last !== ((inputs.history[0]?.[0] as MotorHistoryCrop | undefined) ?? null) ||
    symptoms.join() !== inputs.symptoms.join();

  return (
    <Disclosure title={tr('title')} icon={SlidersHorizontal}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{tr('hint')}</p>
        <Question id="motor-q-crop" label={tr('crop')}>
          {MOTOR_CROPS.map((c) => (
            <Chip key={c} pressed={crop === c} onClick={() => setCrop(c)}>
              {t(`crops.${c}`)}
            </Chip>
          ))}
          <Chip
            pressed={crop === null}
            onClick={() => {
              setCrop(null);
              setStage(null);
            }}
          >
            {tr('noCrop')}
          </Chip>
        </Question>
        {crop && (
          <Question id="motor-q-stage" label={tr('stage')} help={<GlossaryLink term="crop-stage" />}>
            {MOTOR_STAGES.map((s) => (
              <Chip key={s} pressed={stage === s} onClick={() => setStage(stage === s ? null : s)}>
                {t(`stages.${s}`)}
              </Chip>
            ))}
          </Question>
        )}
        <Question id="motor-q-symptoms" label={tr('symptoms')}>
          {allowed.map(({ id }) => (
            <Chip
              key={id}
              pressed={symptoms.includes(id)}
              onClick={() => setSymptoms((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
            >
              {t(`symptoms.${id}`)}
            </Chip>
          ))}
        </Question>
        <Question id="motor-q-last" label={tr('last')} help={<GlossaryLink term="crop-rotation" />}>
          {MOTOR_HISTORY_CROPS.map((c) => (
            <Chip key={c} pressed={last === c} onClick={() => setLast(last === c ? null : c)}>
              {t(`crops.${c}`)}
            </Chip>
          ))}
        </Question>
        <Question id="motor-q-residue" label={tr('residue')} help={<GlossaryLink term="crop-residue" />}>
          {MOTOR_RESIDUES.map((r) => (
            <Chip key={r} pressed={residue === r} onClick={() => setResidue(r)}>
              {t(`residue.${r}`)}
            </Chip>
          ))}
          <Chip pressed={residue === null} onClick={() => setResidue(null)}>
            {tr('dontKnow')}
          </Chip>
        </Question>
        <p className="text-sm text-ink-muted">
          {tr('soilNote')}{' '}
          <button type="button" onClick={onOpenConditions} className="min-h-11 font-semibold text-field-300 underline underline-offset-2">
            {tr('soilCta')}
          </button>
        </p>
        <button
          type="button"
          disabled={!changed}
          onClick={() =>
            onApply({ crop, stage: crop ? stage : null, symptoms: symptoms.filter((s) => allowed.some((a) => a.id === s)), last, residue })
          }
          className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400 disabled:opacity-40"
        >
          <RotateCcw aria-hidden className="size-4" />
          {tr('apply')}
        </button>
      </div>
    </Disclosure>
  );
}

// ---------------------------------------------------------------- prácticas, vacíos, datos y avisos

function Practices({ plan }: { plan: Plan }) {
  const t = useTranslations('motor.practices');
  if (!plan.practices.length) return null;
  return (
    <Disclosure title={t('title', { n: plan.practices.length })} icon={Sprout}>
      <ul className="flex flex-col gap-3 text-sm">
        {plan.practices.map((p) => (
          <li key={p.id || p.title}>
            <p className="font-semibold">{p.title}</p>
            {p.fromFinding && <p className="text-xs font-semibold text-field-300">{t('fromFinding')}</p>}
            <p className="mt-0.5 text-ink-muted">{p.text}</p>
            {p.cautions.map((c) => (
              <p key={c} className="mt-0.5 text-xs text-ink-faint">
                {c}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

function Gaps({ plan }: { plan: Plan }) {
  const t = useTranslations('motor');
  const tg = useTranslations('motor.gaps');
  const g = plan.gaps;
  const wanted = g.wanted.slice(0, 5);
  const age = plan.territory?.dataAgeDays;
  return (
    <section aria-labelledby="motor-gaps" className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4 ring-1 ring-line">
      <h4 id="motor-gaps" className="flex items-center gap-2 font-bold">
        <CircleHelp aria-hidden className="size-5 text-sun" />
        {tg('title')}
      </h4>
      <ul className="flex flex-col gap-1 text-sm">
        {g.rulesEvaluated != null && g.rulesInCatalog != null && <li>{tg('rules', { evaluated: g.rulesEvaluated, total: g.rulesInCatalog })}</li>}
        {g.skipped.missingInput > 0 && <li>{tg('missingInput', { n: g.skipped.missingInput })}</li>}
        {g.skipped.needsSeries > 0 && <li>{tg('needsSeries', { n: g.skipped.needsSeries })}</li>}
        {age != null && age > 30 && <li>{tg('dataAge', { days: Math.round(age) })}</li>}
      </ul>
      {wanted.length > 0 && (
        <div className="text-sm">
          <p className="font-semibold">{tg('wanted')}</p>
          <ul className="list-disc pl-5 text-ink-muted">
            {wanted.map((w) => (
              <li key={w.variable}>{tg('wantedItem', { label: varLabel(t, w.variable), n: w.rules })}</li>
            ))}
          </ul>
        </div>
      )}
      {plan.rotation.verify.length > 0 && (
        <div className="text-sm">
          <p className="font-semibold">{tg('verify')}</p>
          <ul className="list-disc pl-5 text-ink-muted">
            {plan.rotation.verify.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DataUsed({ plan, zone, inputs }: { plan: Plan; zone: MotorZone; inputs: MotorInputs }) {
  const t = useTranslations('motor');
  const td = useTranslations('motor.data');
  const format = useFormatter();
  const u = useUnits();
  const coord = (n: number) => format.number(n, { maximumFractionDigits: 4 });
  const day = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const s = zone.summary;
  const none = td('none');
  const rows: [string, string][] = [
    [td('temp'), s.temperature != null ? u.temp(s.temperature) : none],
    [td('rh'), s.relativeHumidity != null ? `${format.number(s.relativeHumidity, { maximumFractionDigits: 0 })} %` : none],
    [td('rain7'), s.rain7d != null ? u.rain(s.rain7d) : none],
    [td('rain30'), s.rain30d != null ? u.rain(s.rain30d) : none],
    [td('soil'), s.soilMoisture != null ? `${s.soilMoisture} %` : none],
    [td('slope'), s.slopePct != null ? `${s.slopePct} %${zone.terrain?.synthetic ? ` (${td('example')})` : ''}` : none],
  ];
  const [w, so, e, n] = zone.bbox;
  const told: [string, string][] = [
    [t('refine.crop'), inputs.crop ? t(`crops.${inputs.crop}`) : t('refine.noCrop')],
    ...(inputs.stage ? ([[t('refine.stage'), t(`stages.${inputs.stage}`)]] as [string, string][]) : []),
    [td('lastCrop'), inputs.history[0] ? inputs.history[0].map((c) => t(`crops.${c}`)).join(' + ') : none],
    [t('refine.residue'), inputs.residue ? t(`residue.${inputs.residue}`) : none],
    [
      td('soilFarmer'),
      [inputs.soil.texture, inputs.soil.ph != null ? `pH ${inputs.soil.ph}` : null, inputs.soil.organicMatterPct != null ? `MO ${inputs.soil.organicMatterPct} %` : null]
        .filter(Boolean)
        .join(' · ') || none,
    ],
  ];
  return (
    <Disclosure title={td('title')} icon={Database}>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p>{zone.point ? td('zonePoint') : td('zone')}</p>
          {!zone.point && <p className="text-ink-muted tabular-nums">{td('bounds', { s: coord(so), n: coord(n), w: coord(w), e: coord(e) })}</p>}
          {zone.days.length > 0 && (
            <p className="text-ink-muted">{td('period', { start: day(zone.period.start), end: day(zone.period.end), cells: zone.powerCellsOk })}</p>
          )}
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="font-semibold">{td('told')}</p>
          <dl className="mt-1 grid grid-cols-1 gap-y-1">
            {told.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-ink-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <ul className="flex flex-col gap-0.5 text-xs text-ink-faint">
          {plan.cell && (
            <li>
              {td('cell', {
                id: plan.cell.gridId,
                km2: plan.cell.areaKm2 != null ? format.number(plan.cell.areaKm2, { maximumFractionDigits: 1 }) : '?',
                km: plan.cell.distanceKm != null ? format.number(plan.cell.distanceKm, { maximumFractionDigits: 1 }) : '?',
              })}
            </li>
          )}
          {plan.engine.schemaVersion && <li>{td('engine', { schema: plan.engine.schemaVersion, notebook: plan.engine.notebookVersion ?? '?' })}</li>}
          {plan.evaluationId && <li>{td('evaluation', { id: plan.evaluationId })}</li>}
          {plan.territory?.notes.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </Disclosure>
  );
}

function Cautions({ items }: { items: string[] }) {
  const t = useTranslations('motor.cautions');
  const list = [...new Set(items)];
  if (!list.length) return null;
  return (
    <Disclosure title={t('title')} icon={AlertTriangle}>
      <ul className="list-disc pl-5 text-sm text-ink-muted">
        {list.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </Disclosure>
  );
}

function Disclosure({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <details className="group rounded-2xl bg-white/5 ring-1 ring-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
        {Icon && <Icon aria-hidden className="size-5 text-field-300" />}
        <span className="flex-1">{title}</span>
        <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
