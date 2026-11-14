'use client';

import { MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { selectField } from '@/features/field/actions';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';

/**
 * Alternativa textual al globo para teclado y lectores de pantalla: un enlace "saltar a la lista de lugares"
 * (primer elemento con foco) y la lista de fincas de ejemplo. Invisible hasta que recibe el foco.
 */
export default function PlacesAlternative() {
  const t = useTranslations('a11y');
  const locale = useLocale();

  return (
    <>
      <a
        href="#places"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[90] focus:rounded-full focus:bg-field-500 focus:px-4 focus:py-3 focus:font-semibold focus:text-black"
      >
        {t('skipToPlaces')}
      </a>
      <section
        id="places"
        tabIndex={-1}
        aria-labelledby="places-title"
        className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:inset-x-3 focus-within:top-3 focus-within:z-[90] focus-within:rounded-3xl focus-within:bg-surface-strong focus-within:p-4 focus-within:shadow-2xl focus-within:ring-1 focus-within:ring-line"
      >
        <h2 id="places-title" className="text-lg font-bold">
          {t('placesTitle')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t('placesIntro')}</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {DEMO_FARMS.map((d) => {
            const f = demoField(d, locale);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => void selectField(f, { locale })}
                  className="flex min-h-12 w-full items-center gap-2 rounded-2xl bg-white/5 px-3 text-left font-semibold ring-1 ring-line hover:bg-white/10"
                >
                  <MapPin aria-hidden className="size-5 shrink-0 text-field-300" />
                  {t('openFarm', { name: f.name ?? d.id })}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
