'use client';

import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudOff,
  Droplet,
  Droplets,
  Pencil,
  Plus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CROP_IDS, type CropId, type RotationStrategy } from '@/lib/api/contract';
import { PriorityIcon } from './PriorityIcon';
import { FormulaExplainer, RankingAnnouncer, RankingList } from './RankingList';
import { LEVELS, levelOf, PRIORITY_KEYS, rankStrategies, type Level, type PriorityKey } from './ranking';
import { EQUIPMENT, IRRIGATION, usePrioritiesStore, type Irrigation, type WizardStep } from './store';

const LEVEL_ICON: Record<Level, LucideIcon> = { high: SignalHigh, mid: SignalMedium, low: SignalLow };
const IRRIGATION_ICON: Record<Irrigation, LucideIcon> = { none: CloudOff, limited: Droplet, full: Droplets };
const STEP_IDS = ['priorities', 'constraints', 'confirm'] as const;

/** Nombre visible de un mercado: cultivo conocido, ganado o texto libre tal cual. */
function useMarketLabel() {
  const tc = useTranslations('crops');
  const tm = useTranslations('priorities.markets');
  return (m: string) =>
    m === 'livestock' ? tm('livestock') : (CROP_IDS as readonly string[]).includes(m) ? tc(m as CropId) : m;
}

/**
 * "¿Qué es lo más importante para ti?": asistente de 3 pasos dentro del sheet.
 * 1) mucho/algo/poco por prioridad (radios nativos: flechas y lector de pantalla funcionan solos)
 * 2) riego, maquinaria y mercados  3) resumen + orden de las opciones en vivo + "Ver opciones de rotación".
 */
export default function PrioritiesWizard({
  strategies,
  marketOptions,
  onDone,
}: {
  strategies?: RotationStrategy[];
  marketOptions: string[];
  onDone: () => void;
}) {
  const t = useTranslations('priorities');
  const step = usePrioritiesStore((s) => s.step);
  const setStep = usePrioritiesStore((s) => s.setStep);
  const confirm = usePrioritiesStore((s) => s.confirm);
  const priorities = usePrioritiesStore((s) => s.priorities);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastStep = useRef(step);

  const ranked = useMemo(() => (strategies ? rankStrategies(strategies, priorities) : []), [strategies, priorities]);

  // Al cambiar de paso, el foco va al título del paso (lector de pantalla y teclado saben dónde están).
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    headingRef.current?.focus();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    headingRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [step]);

  const id = STEP_IDS[step];
  const go = (s: WizardStep) => setStep(s);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4">
        <header className="flex scroll-mt-4 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
              {t('stepOf', { n: step + 1, total: 3 })}
            </p>
            <div aria-hidden className="flex flex-1 gap-1">
              {STEP_IDS.map((s, i) => (
                <span key={s} className={clsx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-field-400' : 'bg-white/10')} />
              ))}
            </div>
          </div>
          <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
            {t(`steps.${id}.title`)}
          </h3>
          <p className="text-sm text-ink-muted">{t(`steps.${id}.hint`)}</p>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-3"
          >
            {step === 0 && <PrioritiesStep />}
            {step === 1 && <ConstraintsStep marketOptions={marketOptions} />}
            {step === 2 && (
              <ConfirmStep onEdit={go}>
                <section aria-labelledby="ranking-title" className="flex flex-col gap-2">
                  <h4 id="ranking-title" className="font-bold">
                    {t('ranking.title')}
                  </h4>
                  {ranked.length ? (
                    <>
                      <RankingList ranked={ranked} />
                      <RankingAnnouncer ranked={ranked} />
                    </>
                  ) : (
                    <p className="text-sm text-ink-muted">{t('ranking.loading')}</p>
                  )}
                  <FormulaExplainer top={ranked[0]} />
                </section>
              </ConfirmStep>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navegación abajo, al alcance del pulgar; queda pegada al borde inferior del sheet al hacer scroll. */}
        <div className="sticky bottom-0 -mx-1 flex gap-2 bg-gradient-to-t from-surface-strong from-70% to-transparent px-1 pt-4 pb-1">
          {step > 0 && (
            <button
              type="button"
              onClick={() => go((step - 1) as WizardStep)}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-white/10 px-5 font-semibold ring-1 ring-line hover:bg-white/15"
            >
              <ArrowLeft aria-hidden className="size-4" />
              {t('nav.back')}
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              onClick={() => go((step + 1) as WizardStep)}
              className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
            >
              {t('nav.next')}
              <ArrowRight aria-hidden className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                confirm();
                onDone();
              }}
              className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
            >
              {t('nav.done')}
              <ArrowRight aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------- paso 1

function PrioritiesStep() {
  return (
    <div className="flex flex-col gap-2">
      {PRIORITY_KEYS.map((k) => (
        <PriorityCard key={k} id={k} />
      ))}
    </div>
  );
}

function PriorityCard({ id }: { id: PriorityKey }) {
  const t = useTranslations('priorities');
  const weight = usePrioritiesStore((s) => s.priorities[id]);
  const setLevel = usePrioritiesStore((s) => s.setLevel);
  const level = levelOf(weight);
  const uid = useId();

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${uid}-t`}
      aria-describedby={`${uid}-h`}
      className="rounded-2xl bg-white/5 p-3 ring-1 ring-line"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-field-500/15 text-field-300">
          <PriorityIcon id={id} className="size-5" />
        </span>
        <div className="min-w-0">
          <p id={`${uid}-t`} className="leading-tight font-semibold">
            {t(`keys.${id}.title`)}
          </p>
          <p id={`${uid}-h`} className="text-xs text-ink-muted">
            {t(`keys.${id}.hint`)}
          </p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {LEVELS.map((l) => {
          const Icon = LEVEL_ICON[l];
          const checked = level === l;
          return (
            <label
              key={l}
              className={clsx(
                'relative flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-xl px-1 text-sm ring-1 select-none',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                checked ? 'bg-field-500 font-bold text-black ring-field-500' : 'ring-line hover:bg-white/5',
              )}
            >
              <input
                type="radio"
                name={`${uid}-level`}
                value={l}
                checked={checked}
                onChange={() => setLevel(id, l)}
                className="sr-only"
              />
              {checked ? <Check aria-hidden className="size-4" /> : <Icon aria-hidden className="size-4" />}
              {t(`levels.${l}`)}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- paso 2

function Chip({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        'flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm ring-1',
        pressed ? 'bg-field-500/20 font-semibold text-ink ring-field-400' : 'ring-line hover:bg-white/5',
      )}
    >
      {pressed ? <Check aria-hidden className="size-4 text-field-300" /> : <Plus aria-hidden className="size-4 text-ink-muted" />}
      {children}
    </button>
  );
}

function ConstraintsStep({ marketOptions }: { marketOptions: string[] }) {
  const t = useTranslations('priorities');
  const c = usePrioritiesStore((s) => s.priorities.constraints);
  const setIrrigation = usePrioritiesStore((s) => s.setIrrigation);
  const toggleEquipment = usePrioritiesStore((s) => s.toggleEquipment);
  const toggleMarket = usePrioritiesStore((s) => s.toggleMarket);
  const addMarket = usePrioritiesStore((s) => s.addMarket);
  const marketLabel = useMarketLabel();
  const [other, setOther] = useState('');
  const [status, setStatus] = useState('');
  const uid = useId();

  // Mercados escritos a mano (o de un enlace) que no están entre las sugerencias.
  const extra = c.markets.filter((m) => !marketOptions.includes(m));

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const name = other.trim();
    if (addMarket(name)) {
      setStatus(t('markets.added', { name }));
      setOther('');
    } else {
      setStatus(t('markets.rejected'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-labelledby={`${uid}-irr`} className="flex flex-col gap-1.5">
        <p id={`${uid}-irr`} className="font-semibold">
          {t('irrigation.label')}
        </p>
        {IRRIGATION.map((v) => {
          const Icon = IRRIGATION_ICON[v];
          const checked = c.irrigation === v;
          return (
            <label
              key={v}
              className={clsx(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ring-1',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                checked ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
              )}
            >
              <input type="radio" name={`${uid}-irrigation`} checked={checked} onChange={() => setIrrigation(v)} className="sr-only" />
              <Icon aria-hidden className="size-6 shrink-0 text-sky-glow" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t(`irrigation.${v}.title`)}</span>
                <span className="block text-xs text-ink-muted">{t(`irrigation.${v}.hint`)}</span>
              </span>
              <span
                aria-hidden
                className={clsx(
                  'grid size-6 shrink-0 place-items-center rounded-full ring-2',
                  checked ? 'bg-field-400 text-black ring-field-400' : 'ring-line-strong',
                )}
              >
                {checked && <Check className="size-4" />}
              </span>
            </label>
          );
        })}
      </div>

      <div role="group" aria-labelledby={`${uid}-eq`} aria-describedby={`${uid}-eqh`} className="flex flex-col gap-1.5">
        <p id={`${uid}-eq`} className="font-semibold">
          {t('equipment.label')}
        </p>
        <p id={`${uid}-eqh`} className="text-xs text-ink-muted">
          {t('equipment.hint')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EQUIPMENT.map((e) => (
            <Chip key={e} pressed={c.equipment.includes(e)} onClick={() => toggleEquipment(e)}>
              {t(`equipment.${e}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div role="group" aria-labelledby={`${uid}-mk`} aria-describedby={`${uid}-mkh`} className="flex flex-col gap-1.5">
        <p id={`${uid}-mk`} className="font-semibold">
          {t('markets.label')}
        </p>
        <p id={`${uid}-mkh`} className="text-xs text-ink-muted">
          {t('markets.hint')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {marketOptions.map((m) => (
            <Chip key={m} pressed={c.markets.includes(m)} onClick={() => toggleMarket(m)}>
              {marketLabel(m)}
            </Chip>
          ))}
          {extra.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMarket(m)}
              aria-label={t('markets.remove', { name: m })}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-field-500/20 px-3.5 text-sm font-semibold ring-1 ring-field-400"
            >
              {m}
              <X aria-hidden className="size-4" />
            </button>
          ))}
        </div>
        <form onSubmit={onAdd} className="mt-1 flex gap-2">
          <label htmlFor={`${uid}-other`} className="sr-only">
            {t('markets.otherLabel')}
          </label>
          <input
            id={`${uid}-other`}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            maxLength={30}
            enterKeyHint="done"
            autoComplete="off"
            placeholder={t('markets.otherPlaceholder')}
            className="min-h-12 min-w-0 flex-1 rounded-full bg-white/5 px-4 text-base ring-1 ring-line placeholder:text-ink-faint focus:ring-2 focus:ring-field-400 focus:outline-none"
          />
          <button
            type="submit"
            className="flex min-h-12 shrink-0 items-center gap-1 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line hover:bg-white/15"
          >
            <Plus aria-hidden className="size-4" />
            {t('markets.add')}
          </button>
        </form>
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- paso 3

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  const t = useTranslations('priorities.nav');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${t('edit')}: ${label}`}
      className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-field-300 hover:bg-white/5"
    >
      <Pencil aria-hidden className="size-4" />
      {t('edit')}
    </button>
  );
}

const isEquipment = (e: string): e is (typeof EQUIPMENT)[number] => (EQUIPMENT as readonly string[]).includes(e);

function ConfirmStep({ onEdit, children }: { onEdit: (s: WizardStep) => void; children: ReactNode }) {
  const t = useTranslations('priorities');
  const p = usePrioritiesStore((s) => s.priorities);
  const marketLabel = useMarketLabel();

  const sorted = [...PRIORITY_KEYS].sort((a, b) => p[b] - p[a]);
  const list = (items: string[]) => (items.length ? items.join(', ') : t('summary.none'));

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="sum-pri" className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
        <div className="flex items-center justify-between gap-2">
          <h4 id="sum-pri" className="font-bold">
            {t('summary.priorities')}
          </h4>
          <EditButton onClick={() => onEdit(0)} label={t('summary.priorities')} />
        </div>
        <ul className="mt-1 flex flex-col">
          {sorted.map((k) => {
            const l = levelOf(p[k]);
            const Icon = LEVEL_ICON[l];
            return (
              <li key={k} className="flex min-h-10 items-center gap-2 border-t border-line text-sm first:border-t-0">
                <PriorityIcon id={k} className="size-4 shrink-0 text-ink-muted" />
                <span className="flex-1">{t(`keys.${k}.title`)}</span>
                <span
                  className={clsx(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                    l === 'high' ? 'bg-field-500/20 text-field-300' : 'bg-white/10 text-ink-muted',
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {t(`levels.${l}`)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="sum-con" className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
        <div className="flex items-center justify-between gap-2">
          <h4 id="sum-con" className="font-bold">
            {t('summary.constraints')}
          </h4>
          <EditButton onClick={() => onEdit(1)} label={t('summary.constraints')} />
        </div>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-ink-muted">{t('summary.irrigation')}</dt>
          <dd>{t(`irrigation.${p.constraints.irrigation}.title`)}</dd>
          <dt className="text-ink-muted">{t('summary.equipment')}</dt>
          <dd>{list(p.constraints.equipment.filter(isEquipment).map((e) => t(`equipment.${e}`)))}</dd>
          <dt className="text-ink-muted">{t('summary.markets')}</dt>
          <dd>{list(p.constraints.markets.map(marketLabel))}</dd>
        </dl>
      </section>

      {children}
    </div>
  );
}
