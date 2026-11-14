'use client';

import clsx from 'clsx';
import {
  Check,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FlaskConical,
  LoaderCircle,
  Pencil,
  Repeat,
  Shovel,
  Sparkles,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import { IRRIGATION, usePrioritiesStore } from '@/features/priorities/store';
import type { CropSeason, DataNeed, DataRequest, Level, SoilInfo } from '@/lib/api/contract';
import { useReducedMotion } from '@/lib/hooks/useMediaQuery';
import { useFarmDataStore, useNeedState } from '../farmData';
import { answeredNeeds, DEFAULT_IMPACT, pendingNeeds, type FarmSoil, type PendingNeed } from '../needs';
import { CropIcon } from './RotationForm';

const NEED_ICON: Record<DataNeed, LucideIcon> = {
  'current-rotation': Repeat,
  'soil-type': Shovel,
  irrigation: Droplets,
  drainage: Waves,
  'soil-test': FlaskConical,
};

/** Clave de mensajes de cada dato (panel.needs.<key>). */
const KEY: Record<DataNeed, 'rotation' | 'soilType' | 'irrigation' | 'drainage' | 'soilTest'> = {
  'current-rotation': 'rotation',
  'soil-type': 'soilType',
  irrigation: 'irrigation',
  drainage: 'drainage',
  'soil-test': 'soilTest',
};

const TEXTURES: SoilInfo['texture'][] = ['sandy', 'loam', 'clay', 'silt', 'unknown'];
const DRAINAGES: NonNullable<SoilInfo['drainage']>[] = ['poor', 'moderate', 'good'];
const NO_SKIPS: DataNeed[] = [];

function Choice({ title, hint, selected, onClick }: { title: string; hint?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'flex min-h-14 w-full flex-col items-start justify-center rounded-2xl px-3 py-2 text-left ring-1',
        selected ? 'bg-field-500/20 ring-2 ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        {selected && <Check aria-hidden className="size-4 text-field-300" />}
        {title}
      </span>
      {hint && <span className="text-xs leading-snug text-ink-muted">{hint}</span>}
    </button>
  );
}

function ImpactBadge({ level }: { level: Level }) {
  const t = useTranslations('panel.needs');
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1',
        level === 'high' ? 'bg-sun/15 text-sun ring-sun/40' : 'bg-white/5 text-ink-muted ring-line',
      )}
    >
      <Sparkles aria-hidden className="size-3.5" />
      {t(`impact.${level}`)}
    </span>
  );
}

const parseNum = (s: string) => {
  const v = s.trim().replace(',', '.');
  return v === '' ? undefined : Number(v);
};

function SoilTestForm({ soil, onSave, onNone }: { soil?: FarmSoil; onSave: (ph?: number, om?: number) => void; onNone: () => void }) {
  const t = useTranslations('panel.needs.soilTest');
  const id = useId();
  const [ph, setPh] = useState(soil?.ph != null ? String(soil.ph) : '');
  const [om, setOm] = useState(soil?.organicMatterPct != null ? String(soil.organicMatterPct) : '');
  const [error, setError] = useState<'empty' | 'phError' | 'omError' | null>(null);

  const submit = () => {
    const p = parseNum(ph);
    const o = parseNum(om);
    if (p === undefined && o === undefined) return setError('empty');
    if (p !== undefined && (!Number.isFinite(p) || p < 3 || p > 10)) return setError('phError');
    if (o !== undefined && (!Number.isFinite(o) || o < 0 || o > 30)) return setError('omError');
    setError(null);
    onSave(p, o);
  };

  const input = 'mt-1 block h-12 w-full rounded-xl bg-white/5 px-3 text-base text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-field-400';
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-3"
    >
      <p className="text-xs text-ink-muted">{t('hint')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold" htmlFor={`${id}-ph`}>
          {t('ph')}
          <input
            id={`${id}-ph`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="5,8"
            value={ph}
            onChange={(e) => setPh(e.target.value)}
            aria-invalid={error === 'phError' || undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            className={input}
          />
        </label>
        <label className="text-sm font-semibold" htmlFor={`${id}-om`}>
          {t('om')}
          <input
            id={`${id}-om`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="3"
            value={om}
            onChange={(e) => setOm(e.target.value)}
            aria-invalid={error === 'omError' || undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            className={input}
          />
        </label>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-muted">
        <GlossaryLink term="ph" />
        <GlossaryLink term="organic-matter" />
      </p>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-semibold text-risk-medium">
          {t(error)}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" className="flex min-h-11 items-center gap-1.5 rounded-full bg-field-500 px-4 text-sm font-bold text-black hover:bg-field-400">
          <Check aria-hidden className="size-4" />
          {t('save')}
        </button>
        <button
          type="button"
          onClick={onNone}
          className="flex min-h-11 items-center rounded-full bg-white/5 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/10"
        >
          {t('none')}
        </button>
      </div>
    </form>
  );
}

/** Texto corto de un dato ya respondido ("Tierra: Franca", "Riego: No tengo riego"…). */
function useAnsweredLabel() {
  const t = useTranslations('panel.needs');
  const tp = useTranslations('priorities.irrigation');
  const format = useFormatter();
  const irrigation = usePrioritiesStore((s) => s.priorities.constraints.irrigation);
  return (need: DataNeed, soil: FarmSoil | undefined) => {
    switch (need) {
      case 'soil-type':
        return t('summary.soilType', { value: t(`soilType.${soil?.texture ?? 'unknown'}.title`) });
      case 'drainage':
        return t('summary.drainage', { value: t(`drainage.${soil?.drainage ?? 'moderate'}.short`) });
      case 'soil-test': {
        if (soil?.ph === undefined && soil?.organicMatterPct === undefined) return t('summary.noTest');
        const parts = [
          soil?.ph !== undefined && t('soilTest.phValue', { value: format.number(soil.ph, { maximumFractionDigits: 1 }) }),
          soil?.organicMatterPct !== undefined &&
            t('soilTest.omValue', { value: format.number(soil.organicMatterPct, { maximumFractionDigits: 1 }) }),
        ].filter(Boolean);
        return t('summary.soilTest', { value: parts.join(' · ') });
      }
      case 'current-rotation':
        return t('summary.rotation');
      case 'irrigation':
        return t('summary.irrigation', { value: tp(`${irrigation}.title`) });
    }
  };
}

/**
 * "Faltan datos para completar tu análisis": cuando a los satélites no les alcanza, la app le pregunta al
 * agricultor lo que solo él sabe (tipo de tierra, si se encharca, su análisis de suelo, su rotación, si tiene riego).
 * Una pregunta a la vez, con toques grandes; cada respuesta recalcula el análisis. "Ahora no" la deja como vacío
 * de información (visible) sin bloquear nada.
 */
export function DataRequestsCard({
  fieldId,
  requests,
  seasons,
  updating,
  onConfirmRotation,
  onEditRotation,
}: {
  fieldId: string;
  /** Lo que pidió el backend (undefined/null = lo deduce el cliente). */
  requests: DataRequest[] | null | undefined;
  /** Rotación que usa hoy el análisis (la típica de la zona si la persona no dio la suya). */
  seasons: CropSeason[];
  updating: boolean;
  onConfirmRotation: (r: CropSeason[]) => void;
  onEditRotation: () => void;
}) {
  const t = useTranslations('panel.needs');
  const tp = useTranslations('priorities.irrigation');
  const tc = useTranslations('crops');
  const id = useId();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const state = useNeedState(fieldId);
  const skipped = useFarmDataStore((s) => s.skipped[fieldId]) ?? NO_SKIPS;
  const focus = useFarmDataStore((s) => (s.focus?.fieldId === fieldId ? s.focus : null));
  const irrigation = usePrioritiesStore((s) => s.priorities.constraints.irrigation);
  const label = useAnsweredLabel();
  const [editing, setEditing] = useState<DataNeed | null>(null);
  const [notice, setNotice] = useState(false);

  const pending = useMemo(() => pendingNeeds(state, requests), [state, requests]);
  const answered = useMemo(() => answeredNeeds(state), [state]);
  const active = pending.filter((p) => !skipped.includes(p.need));
  const current: PendingNeed | null = editing
    ? (pending.find((p) => p.need === editing) ?? { need: editing, impact: DEFAULT_IMPACT[editing] })
    : (active.find((p) => p.need === focus?.need) ?? active[0] ?? null);

  // Pedido desde el chat o desde "Opciones": llevar la tarjeta a la vista.
  const scroll = Boolean(focus?.scroll);
  useEffect(() => {
    if (!scroll) return;
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      useFarmDataStore.getState().scrolled();
    });
    return () => cancelAnimationFrame(raf);
  }, [scroll, reduce]);

  // "Listo" se va solo unos segundos después de que termina de recalcular.
  useEffect(() => {
    if (!notice || updating) return;
    const timer = setTimeout(() => setNotice(false), 6000);
    return () => clearTimeout(timer);
  }, [notice, updating]);

  if (!current && !pending.length && !answered.length) return null;

  const fd = useFarmDataStore.getState();
  const answer = (fn: () => void) => {
    fn();
    setEditing(null);
    setNotice(true);
  };
  const setSoil = (patch: FarmSoil) => answer(() => fd.setSoil(fieldId, patch));

  let body: ReactNode = null;
  if (current) {
    const k = KEY[current.need];
    const Icon = NEED_ICON[current.need];
    const qId = `${id}-q`;
    body = (
      <div className="mt-3 rounded-2xl bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
          {!editing && <span>{t('left', { count: active.length })}</span>}
          <ImpactBadge level={current.impact} />
        </div>
        <div role="group" aria-labelledby={qId} className="mt-2">
          <p id={qId} className="flex items-start gap-2 text-base font-bold leading-snug">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-field-300" />
            {t(`${k}.q`)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            <span className="font-semibold text-ink">{t('why')}</span> {current.reason ?? t(`${k}.reason`)}
          </p>

          {current.need === 'soil-type' && (
            <>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                <CircleHelp aria-hidden className="mt-px size-3.5 shrink-0" />
                {t('soilType.tip')}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TEXTURES.map((v) => (
                  <div key={v} className={clsx(v === 'unknown' && 'col-span-2')}>
                    <Choice
                      title={t(`soilType.${v}.title`)}
                      hint={t(`soilType.${v}.hint`)}
                      selected={state.soil?.texture === v}
                      onClick={() => setSoil({ texture: v })}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {current.need === 'drainage' && (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {DRAINAGES.map((v) => (
                <Choice
                  key={v}
                  title={t(`drainage.${v}.title`)}
                  hint={t(`drainage.${v}.hint`)}
                  selected={state.soil?.drainage === v}
                  onClick={() => setSoil({ drainage: v })}
                />
              ))}
            </div>
          )}

          {current.need === 'irrigation' && (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {IRRIGATION.map((v) => (
                <Choice
                  key={v}
                  title={tp(`${v}.title`)}
                  hint={tp(`${v}.hint`)}
                  selected={state.irrigationKnown && irrigation === v}
                  onClick={() =>
                    answer(() => {
                      usePrioritiesStore.getState().setIrrigation(v);
                      fd.markIrrigation();
                    })
                  }
                />
              ))}
            </div>
          )}

          {current.need === 'soil-test' && (
            <SoilTestForm
              key={`${fieldId}-${editing ?? ''}`}
              soil={state.soil}
              onSave={(ph, organicMatterPct) => setSoil({ ph, organicMatterPct, noTest: undefined })}
              onNone={() => setSoil({ noTest: true, ph: undefined, organicMatterPct: undefined })}
            />
          )}

          {current.need === 'current-rotation' && (
            <>
              <ul className="mt-3 flex flex-wrap gap-2">
                {[...new Set(seasons.filter((s) => s.role !== 'fallow').map((s) => s.crop))].map((crop) => (
                  <li key={crop} className="flex min-h-9 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm ring-1 ring-line">
                    <CropIcon crop={crop} className="size-5" />
                    {tc(crop)}
                  </li>
                ))}
              </ul>
              {!state.rotation && <p className="mt-1 text-xs text-ink-muted">{t('rotation.hint')}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!seasons.length}
                  onClick={() => answer(() => onConfirmRotation(seasons))}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-field-500 px-4 text-sm font-bold text-black hover:bg-field-400 disabled:opacity-40"
                >
                  <Check aria-hidden className="size-4" />
                  {t('rotation.yes')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    onEditRotation();
                  }}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/10"
                >
                  <Pencil aria-hidden className="size-4" />
                  {t('rotation.change')}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => (editing ? setEditing(null) : fd.skip(fieldId, current.need))}
            className="min-h-11 rounded-full px-4 text-sm font-semibold text-ink-muted underline-offset-4 hover:bg-white/5 hover:underline"
          >
            {editing ? t('back') : t('later')}
          </button>
        </div>
      </div>
    );
  }

  const done = !current && !pending.length;
  const leftForLater = !current && pending.length > 0;
  return (
    <section ref={ref} aria-labelledby={`${id}-title`} className="scroll-mt-3 rounded-3xl bg-sky-glow/5 p-4 ring-1 ring-sky-glow/30">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky-glow/15 text-sky-glow">
          {done ? <ClipboardCheck aria-hidden className="size-5" /> : <ClipboardList aria-hidden className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-title`} className="text-lg leading-tight font-bold">
            {done ? t('doneTitle') : leftForLater ? t('skippedTitle', { count: pending.length }) : t('title')}
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">{done ? t('doneText') : leftForLater ? t('skippedText') : t('intro')}</p>
        </div>
      </div>

      {body}

      {leftForLater && (
        <button
          type="button"
          onClick={() => fd.unskip(fieldId)}
          className="mt-3 flex min-h-11 items-center gap-1.5 rounded-full bg-field-500 px-4 text-sm font-bold text-black hover:bg-field-400"
        >
          {t('answerNow')}
        </button>
      )}

      {!current && answered.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {answered.map((n) => {
            const Icon = NEED_ICON[n];
            const text = label(n, state.soil);
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setEditing(n)}
                  aria-label={t('edit', { item: text })}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-left text-sm ring-1 ring-line hover:bg-white/10"
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-field-300" />
                  {text}
                  <Pencil aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p aria-live="polite" className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
        {updating ? (
          <>
            <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
            {t('updating')}
          </>
        ) : notice ? (
          <>
            <Check aria-hidden className="size-4 text-field-300" />
            {t('updated')}
          </>
        ) : null}
      </p>
    </section>
  );
}

/** En "Opciones": aviso de que la comparación tiene vacíos que el agricultor puede llenar. */
export function DataNudge({ fieldId, requests, onComplete }: { fieldId: string; requests: DataRequest[] | null | undefined; onComplete: () => void }) {
  const t = useTranslations('panel.needs');
  const state = useNeedState(fieldId);
  const count = useMemo(() => pendingNeeds(state, requests).length, [state, requests]);
  if (!count) return null;
  return (
    <div role="note" className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-sky-glow/10 p-3 text-sm ring-1 ring-sky-glow/30">
      <ClipboardList aria-hidden className="size-5 shrink-0 text-sky-glow" />
      <p className="min-w-0 flex-1">{t('nudge', { count })}</p>
      <button
        type="button"
        onClick={onComplete}
        className="flex min-h-11 items-center rounded-full bg-field-500 px-4 text-sm font-bold text-black hover:bg-field-400"
      >
        {t('nudgeCta')}
      </button>
    </div>
  );
}
