'use client';

import { Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SelectedField } from '@/features/field/types';
import type { FieldSurvey } from '@/lib/api/contract';
import { inColombiaBox } from '@/lib/market/colombia';
import { myListingFor, useListingsStore } from './store';

/**
 * "¿Vendes tu cosecha?": si en la encuesta dijo que vende (sale o both), la finca está en Colombia, no es demo y
 * todavía no la publicó desde este teléfono, se le sugiere publicarla.
 */
export function SellSuggestion({ field, survey }: { field: SelectedField; survey: FieldSurvey | null }) {
  const t = useTranslations('listings.suggest');
  const published = useListingsStore((s) => Boolean(myListingFor(s.mine, field.id)));
  const [lon, lat] = field.center;
  if (published || field.demoId || !inColombiaBox(lat, lon)) return null;
  if (survey?.purpose !== 'sale' && survey?.purpose !== 'both') return null;

  return (
    <section aria-labelledby="sell-suggest-title" className="flex gap-3 rounded-2xl bg-field-500/10 p-4 ring-1 ring-field-500/40">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-field-500/20 text-field-300">
        <Store aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id="sell-suggest-title" className="font-bold">
          {t('title')}
        </h3>
        <p className="mt-0.5 text-sm text-ink-muted">{t('body')}</p>
        <button
          type="button"
          onClick={() =>
            useListingsStore.getState().openPublish({ fieldId: field.id, lat, lon, name: field.name ?? null, areaHa: field.areaHa ?? null })
          }
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-full bg-field-500 px-5 font-semibold text-black hover:bg-field-400"
        >
          <Store aria-hidden className="size-4" />
          {t('cta')}
        </button>
      </div>
    </section>
  );
}
