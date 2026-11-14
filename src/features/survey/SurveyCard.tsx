'use client';

import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Bird,
  Bug,
  Check,
  ClipboardList,
  Droplets,
  Flame,
  FlaskConical,
  HandCoins,
  House,
  Layers,
  Leaf,
  PawPrint,
  Pencil,
  Plus,
  Recycle,
  Search,
  Sprout,
  Truck,
  Utensils,
  Worm,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useToastStore } from '@/components/ui/toast';
import { CropIcon } from '@/features/field/panel/RotationForm';
import {
  CROP_IDS,
  FERTILIZATION,
  HARVEST_PURPOSE,
  RESIDUES,
  SURVEY_PESTS,
  type CropId,
  type FieldSurvey,
} from '@/lib/api/contract';
import { SURVEY_STEPS, useSurvey, useSurveyStore, type SurveyStep } from './store';

/** Cultivos que se muestran primero (además de los de la rotación de la finca). */
const COMMON: CropId[] = ['maize', 'beans', 'cassava', 'coffee', 'plantain', 'potato', 'rice', 'sorghum', 'soybean', 'wheat', 'squash', 'vegetables'];
const ALL_CROPS = CROP_IDS.filter((c) => c !== 'fallow');

const FERT_ICON: Record<(typeof FERTILIZATION)[number], LucideIcon> = { none: Ban, organic: Recycle, synthetic: FlaskConical, both: Layers };
const RESIDUE_ICON: Record<(typeof RESIDUES)[number], LucideIcon> = { leave: Leaf, burn: Flame, graze: PawPrint, remove: Truck };
const PEST_ICON: Record<(typeof SURVEY_PESTS)[number], LucideIcon> = { armyworm: Bug, 'soil-pests': Worm, fungus: Droplets, weeds: Sprout, animals: Bird };
const PURPOSE_ICON: Record<(typeof HARVEST_PURPOSE)[number], LucideIcon> = { home: Utensils, sale: HandCoins, both: House };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * "Cuéntanos de tu terreno": 6 preguntas rápidas sobre historial y manejo (lo que los satélites no ven).
 * Sin respuestas: invitación corta. Respondiendo: una pregunta por pantalla, todo opcional.
 * Respondida: resumen con "Cambiar respuestas".
 */
export default function SurveyCard({ fieldId, suggested = [] }: { fieldId: string; suggested?: CropId[] }) {
  const draft = useSurveyStore((s) => (s.draft?.fieldId === fieldId ? s.draft : null));
  const saved = useSurvey(fieldId);
  if (draft) return <Wizard suggested={suggested} />;
  if (saved) return <Summary fieldId={fieldId} survey={saved} />;
  return <Invite fieldId={fieldId} />;
}

function Invite({ fieldId }: { fieldId: string }) {
  const t = useTranslations('survey');
  const start = useSurveyStore((s) => s.start);
  return (
    <section aria-labelledby={`survey-${fieldId}`} className="flex items-start gap-3 rounded-2xl bg-field-500/10 p-3 ring-1 ring-field-500/40">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-field-500/20 text-field-300">
        <ClipboardList aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={`survey-${fieldId}`} className="font-bold">
          {t('title')}
        </h3>
        <p className="text-sm text-ink-muted">{t('intro', { n: SURVEY_STEPS.length })}</p>
        <button
          type="button"
          onClick={() => start(fieldId)}
          className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full bg-field-500 px-4 text-sm font-bold text-black hover:bg-field-400"
        >
          {t('cta')}
          <ArrowRight aria-hidden className="size-4" />
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- resumen

function useAnswerText() {
  const t = useTranslations('survey');
  const tc = useTranslations('crops');
  return (step: SurveyStep, s: FieldSurvey): string | null => {
    switch (step) {
      case 'usualCrops':
        return s.usualCrops.length ? s.usualCrops.map((c) => tc(c)).join(', ') : null;
      case 'lastCrop':
        return s.lastCrop ? (s.lastCrop === 'fallow' ? t('q.lastCrop.fallow') : tc(s.lastCrop)) : null;
      case 'fertilization':
        return s.fertilization ? t(`q.fertilization.options.${s.fertilization}.title`) : null;
      case 'residues':
        return s.residues ? t(`q.residues.options.${s.residues}.title`) : null;
      case 'pests':
        return s.pests ? (s.pests.length ? s.pests.map((p) => t(`q.pests.options.${p}`)).join(', ') : t('q.pests.none')) : null;
      case 'purpose':
        return s.purpose ? t(`q.purpose.options.${s.purpose}.title`) : null;
    }
  };
}

function Summary({ fieldId, survey }: { fieldId: string; survey: FieldSurvey }) {
  const t = useTranslations('survey');
  const start = useSurveyStore((s) => s.start);
  const text = useAnswerText();
  const answered = SURVEY_STEPS.filter((k) => text(k, survey) != null).length;
  return (
    <section aria-labelledby={`survey-${fieldId}`} className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`survey-${fieldId}`} className="flex items-center gap-2 font-bold">
            <ClipboardList aria-hidden className="size-5 text-field-300" />
            {t('doneTitle')}
          </h3>
          <p className="text-xs text-ink-muted">{t('answered', { n: answered, total: SURVEY_STEPS.length })}</p>
        </div>
        <button
          type="button"
          onClick={() => start(fieldId)}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-field-300 hover:bg-white/5"
        >
          <Pencil aria-hidden className="size-4" />
          {t('edit')}
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {SURVEY_STEPS.map((k) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{t(`short.${k}`)}</dt>
            <dd className={clsx(text(k, survey) == null && 'text-ink-faint')}>{text(k, survey) ?? t('notAnswered')}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-faint">{t('privacy')}</p>
    </section>
  );
}

// ---------------------------------------------------------------- preguntas

function Wizard({ suggested }: { suggested: CropId[] }) {
  const t = useTranslations('survey');
  const draft = useSurveyStore((s) => s.draft)!;
  const { setStep, finish } = useSurveyStore.getState();
  const pushToast = useToastStore((s) => s.push);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = SURVEY_STEPS[draft.step]!;
  const last = draft.step === SURVEY_STEPS.length - 1;
  const uid = useId();

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    headingRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [draft.step]);

  const done = () => {
    finish();
    pushToast(t('saved'), 'success');
  };

  return (
    <section aria-labelledby={`${uid}-q`} className="flex flex-col gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-field-500/50">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
            {t('progress', { n: draft.step + 1, total: SURVEY_STEPS.length })}
          </p>
          <div aria-hidden className="flex flex-1 gap-1">
            {SURVEY_STEPS.map((s, i) => (
              <span key={s} className={clsx('h-1.5 flex-1 rounded-full', i <= draft.step ? 'bg-field-400' : 'bg-white/10')} />
            ))}
          </div>
          <button
            type="button"
            onClick={done}
            aria-label={t('saveClose')}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <h3 id={`${uid}-q`} ref={headingRef} tabIndex={-1} className="scroll-mt-4 text-lg leading-snug font-bold outline-none">
          {t(`q.${step}.title`)}
        </h3>
        <p className="text-sm text-ink-muted">{t(`q.${step}.hint`)}</p>
      </header>

      <div>
        {step === 'usualCrops' && <UsualCrops suggested={suggested} labelledBy={`${uid}-q`} />}
        {step === 'lastCrop' && <LastCrop suggested={suggested} labelledBy={`${uid}-q`} />}
        {step === 'fertilization' && (
          <Choice field="fertilization" options={FERTILIZATION} icons={FERT_ICON} labelledBy={`${uid}-q`} withHint />
        )}
        {step === 'residues' && <Choice field="residues" options={RESIDUES} icons={RESIDUE_ICON} labelledBy={`${uid}-q`} />}
        {step === 'pests' && <Pests labelledBy={`${uid}-q`} />}
        {step === 'purpose' && <Choice field="purpose" options={HARVEST_PURPOSE} icons={PURPOSE_ICON} labelledBy={`${uid}-q`} />}
      </div>

      {/* Navegación abajo, al alcance del pulgar. */}
      <div className="sticky bottom-0 -mx-3 -mb-3 flex gap-2 rounded-b-2xl bg-gradient-to-t from-surface-strong from-70% to-transparent px-3 pt-4 pb-3">
        {draft.step > 0 && (
          <button
            type="button"
            onClick={() => setStep(draft.step - 1)}
            aria-label={t('back')}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-line hover:bg-white/15"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
        )}
        {!last && (
          <button
            type="button"
            onClick={() => setStep(draft.step + 1)}
            className="flex min-h-12 items-center justify-center rounded-full px-4 text-sm font-semibold text-ink-muted hover:bg-white/5"
          >
            {t('skip')}
          </button>
        )}
        <button
          type="button"
          onClick={() => (last ? done() : setStep(draft.step + 1))}
          className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
        >
          {last ? t('finish') : t('next')}
          {last ? <Check aria-hidden className="size-4" /> : <ArrowRight aria-hidden className="size-4" />}
        </button>
      </div>
    </section>
  );
}

/** Tarjeta de opción única (radio nativo: flechas y lector de pantalla funcionan solos). */
function RadioCard({
  name,
  checked,
  onChange,
  icon,
  title,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <label
      className={clsx(
        'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ring-1',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
        checked ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={clsx('grid size-6 shrink-0 place-items-center rounded-full ring-2', checked ? 'bg-field-400 text-black ring-field-400' : 'ring-line-strong')}
      >
        {checked && <Check className="size-4" />}
      </span>
    </label>
  );
}

type ChoiceField = 'fertilization' | 'residues' | 'purpose';

/** Pregunta de opción única. Las claves de texto son `survey.q.<field>.options.<opción>.{title,hint}`. */
function Choice({
  field,
  options,
  icons,
  labelledBy,
  withHint = true,
}: {
  field: ChoiceField;
  options: readonly string[];
  icons: Record<string, LucideIcon>;
  labelledBy: string;
  withHint?: boolean;
}) {
  // Las combinaciones campo × opción no se pueden tipar sin una unión enorme: la clave se arma aquí.
  const t = useTranslations('survey') as unknown as (key: string) => string;
  const value = useSurveyStore((s) => s.draft?.answers[field] ?? null);
  const answer = useSurveyStore((s) => s.answer);
  const uid = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-col gap-1.5">
      {options.map((o) => {
        const Icon = icons[o]!;
        return (
          <RadioCard
            key={o}
            name={`${uid}-${field}`}
            checked={value === o}
            onChange={() => answer({ [field]: o } as Partial<FieldSurvey>)}
            icon={<Icon aria-hidden className="size-6 text-sky-glow" />}
            title={t(`q.${field}.options.${o}.title`)}
            hint={withHint ? t(`q.${field}.options.${o}.hint`) : undefined}
          />
        );
      })}
    </div>
  );
}

/** Botón de cultivo con ícono grande (selección múltiple). */
function CropToggle({ crop, pressed, onClick }: { crop: CropId; pressed: boolean; onClick: () => void }) {
  const tc = useTranslations('crops');
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'relative flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl p-1.5 text-center text-xs ring-1',
        pressed ? 'bg-field-500/20 font-semibold ring-2 ring-field-400' : 'ring-line hover:bg-white/5',
      )}
    >
      {pressed && <Check aria-hidden className="absolute top-1 right-1 size-3.5 text-field-300" />}
      <CropIcon crop={crop} className="size-6" />
      <span className="leading-tight">{tc(crop)}</span>
    </button>
  );
}

/** Todos los cultivos con buscador (para "ver todos" y "otro"). */
function useCropSearch() {
  const tc = useTranslations('crops');
  const [q, setQ] = useState('');
  const list = ALL_CROPS.filter((c) => !q || norm(tc(c)).includes(norm(q)));
  return { q, setQ, list };
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('survey');
  return (
    <label className="mb-2 flex h-11 items-center gap-2 rounded-xl bg-white/5 px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-field-400">
      <Search aria-hidden className="size-4 text-ink-muted" />
      <span className="sr-only">{t('q.usualCrops.search')}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('q.usualCrops.search')}
        className="min-w-0 flex-1 bg-transparent text-base outline-none"
      />
    </label>
  );
}

function UsualCrops({ suggested, labelledBy }: { suggested: CropId[]; labelledBy: string }) {
  const t = useTranslations('survey');
  const selected = useSurveyStore((s) => s.draft?.answers.usualCrops ?? []);
  const answer = useSurveyStore((s) => s.answer);
  const [all, setAll] = useState(false);
  const search = useCropSearch();
  const first = [...new Set([...selected, ...suggested.filter((c) => c !== 'fallow'), ...COMMON])].slice(0, Math.max(12, selected.length));
  const list = all ? search.list : first;
  const toggle = (c: CropId) =>
    answer({ usualCrops: selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c].slice(0, 12) });

  return (
    <div role="group" aria-labelledby={labelledBy}>
      {all && <SearchBox value={search.q} onChange={search.setQ} />}
      <ul className={clsx('grid grid-cols-3 gap-1.5 sm:grid-cols-4', all && 'max-h-72 overflow-y-auto')}>
        {list.map((c) => (
          <li key={c}>
            <CropToggle crop={c} pressed={selected.includes(c)} onClick={() => toggle(c)} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setAll((v) => !v)}
        aria-expanded={all}
        className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-field-300 hover:bg-white/5"
      >
        <Plus aria-hidden className="size-4" />
        {all ? t('q.usualCrops.fewer') : t('q.usualCrops.more')}
      </button>
    </div>
  );
}

function LastCrop({ suggested, labelledBy }: { suggested: CropId[]; labelledBy: string }) {
  const t = useTranslations('survey');
  const tc = useTranslations('crops');
  const usual = useSurveyStore((s) => s.draft?.answers.usualCrops ?? []);
  const value = useSurveyStore((s) => s.draft?.answers.lastCrop ?? null);
  const answer = useSurveyStore((s) => s.answer);
  const [other, setOther] = useState(false);
  const search = useCropSearch();
  const uid = useId();
  const base = [...new Set([...usual, ...suggested.filter((c) => c !== 'fallow')])];
  const options = (base.length ? base : COMMON.slice(0, 6)).slice(0, 8);
  if (value && value !== 'fallow' && !options.includes(value)) options.push(value);
  const list = other ? search.list : options;

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-labelledby={labelledBy}>
        {other && <SearchBox value={search.q} onChange={search.setQ} />}
        <ul className={clsx('grid grid-cols-3 gap-1.5 sm:grid-cols-4', other && 'max-h-72 overflow-y-auto')}>
          {list.map((c) => (
            <li key={c}>
              <label
                className={clsx(
                  'relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl p-1.5 text-center text-xs ring-1',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                  value === c ? 'bg-field-500/20 font-semibold ring-2 ring-field-400' : 'ring-line hover:bg-white/5',
                )}
              >
                <input type="radio" name={`${uid}-last`} checked={value === c} onChange={() => answer({ lastCrop: c })} className="sr-only" />
                {value === c && <Check aria-hidden className="absolute top-1 right-1 size-3.5 text-field-300" />}
                <CropIcon crop={c} className="size-6" />
                <span className="leading-tight">{tc(c)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <RadioCard
            name={`${uid}-last`}
            checked={value === 'fallow'}
            onChange={() => answer({ lastCrop: 'fallow' })}
            icon={<CropIcon crop="fallow" className="size-6" />}
            title={t('q.lastCrop.fallow')}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOther((v) => !v)}
        aria-expanded={other}
        className="flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 text-sm font-semibold text-field-300 hover:bg-white/5"
      >
        <Plus aria-hidden className="size-4" />
        {other ? t('q.usualCrops.fewer') : t('q.lastCrop.other')}
      </button>
    </div>
  );
}

function Pests({ labelledBy }: { labelledBy: string }) {
  const t = useTranslations('survey');
  const pests = useSurveyStore((s) => s.draft?.answers.pests ?? null);
  const answer = useSurveyStore((s) => s.answer);
  const toggle = (p: (typeof SURVEY_PESTS)[number]) => {
    const cur = pests ?? [];
    answer({ pests: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  };
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-col gap-1.5">
      {SURVEY_PESTS.map((p) => {
        const Icon = PEST_ICON[p];
        const on = Boolean(pests?.includes(p));
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(p)}
            className={clsx(
              'flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1',
              on ? 'bg-field-500/15 font-semibold ring-2 ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
            )}
          >
            <Icon aria-hidden className="size-5 shrink-0 text-sun" />
            <span className="flex-1">{t(`q.pests.options.${p}`)}</span>
            {on ? <Check aria-hidden className="size-5 text-field-300" /> : <Plus aria-hidden className="size-5 text-ink-muted" />}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={pests != null && pests.length === 0}
        onClick={() => answer({ pests: pests != null && pests.length === 0 ? null : [] })}
        className={clsx(
          'flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1',
          pests != null && pests.length === 0 ? 'bg-field-500/15 font-semibold ring-2 ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
        )}
      >
        <Check aria-hidden className="size-5 shrink-0 text-field-300" />
        <span className="flex-1">{t('q.pests.none')}</span>
      </button>
    </div>
  );
}
