'use client';

import clsx from 'clsx';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Tenure } from '@/lib/api/outlook';
import { useHousehold, useOutlookStore } from './store';

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold ring-1',
        pressed ? 'bg-field-500 text-black ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

function Question({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

const WORKERS = [1, 2, 3, 4, 5] as const;
const TENURES: Tenure[] = ['own', 'rent', 'shared', 'unknown'];

/**
 * Tres preguntas que los satélites no responden y que cambian lo que conviene: quién trabaja, de quién es la
 * tierra y si hay una asociación. Se recuerdan en el teléfono para esta finca; tocar otra vez la misma respuesta
 * la borra.
 */
export function HouseholdQuestions({ fieldId }: { fieldId: string }) {
  const t = useTranslations('rotations.outlook.household');
  const hh = useHousehold(fieldId);
  const set = (patch: Parameters<ReturnType<typeof useOutlookStore.getState>['setHousehold']>[1]) =>
    useOutlookStore.getState().setHousehold(fieldId, patch);

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <p className="flex items-start gap-2 text-sm">
        <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-field-300" />
        <span>
          <span className="font-semibold">{t('title')}</span> <span className="text-ink-muted">{t('hint')}</span>
        </span>
      </p>
      <Question legend={t('workers')}>
        {WORKERS.map((n) => (
          <Chip key={n} pressed={hh.workers === n} onClick={() => set({ workers: hh.workers === n ? null : n })}>
            {n === 5 ? t('workersMore') : n}
          </Chip>
        ))}
      </Question>
      <Question legend={t('tenure')}>
        {TENURES.map((v) => (
          <Chip key={v} pressed={hh.tenure === v} onClick={() => set({ tenure: hh.tenure === v ? null : v })}>
            {t(`tenures.${v}`)}
          </Chip>
        ))}
      </Question>
      <Question legend={t('association')}>
        {([true, false] as const).map((v) => (
          <Chip key={String(v)} pressed={hh.association === v} onClick={() => set({ association: hh.association === v ? null : v })}>
            {v ? t('yes') : t('no')}
          </Chip>
        ))}
      </Question>
    </div>
  );
}
