'use client';

import { HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useGlossaryStore, type GlossaryTerm } from './terms';

/** Término técnico con enlace al glosario ("¿qué es esto?"). */
export function GlossaryLink({ term, children }: { term: GlossaryTerm; children?: ReactNode }) {
  const t = useTranslations('glossary');
  const show = useGlossaryStore((s) => s.show);
  return (
    <button
      type="button"
      onClick={() => show(term)}
      className="inline-flex min-h-8 items-center gap-1 rounded-full text-left underline decoration-dotted underline-offset-4 hover:text-field-300"
      aria-label={children ? undefined : t('whatIs', { term: t(`terms.${term}.title`) })}
    >
      {children ?? t(`terms.${term}.title`)}
      <HelpCircle aria-hidden className="size-3.5 shrink-0 opacity-70" />
    </button>
  );
}
