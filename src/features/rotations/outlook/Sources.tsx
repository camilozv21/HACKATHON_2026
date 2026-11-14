'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Reference } from '@/lib/api/outlook';

type RefCtx = { number: (id: string) => number | null; anchor: (id: string) => string };
const Ctx = createContext<RefCtx>({ number: () => null, anchor: (id) => id });

/** Numera las fuentes en el orden en que llegan y da a cada cita su ancla en la lista. */
export function ReferencesProvider({ references, scope, children }: { references: Reference[]; scope: string; children: ReactNode }) {
  const value = useMemo<RefCtx>(() => {
    const index = new Map(references.map((r, i) => [r.id, i + 1]));
    return { number: (id) => index.get(id) ?? null, anchor: (id) => `src-${scope}-${id}` };
  }, [references, scope]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Abre la sección de fuentes (un <details>) y lleva la vista y el foco a esa fuente. */
function goTo(anchor: string) {
  const el = document.getElementById(anchor);
  if (!el) return;
  const details = el.closest('details');
  if (details && !details.open) details.open = true;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
}

/** Citas [1][3] junto a una frase. Las que no están en la lista se omiten. */
export function Cite({ ids }: { ids: string[] }) {
  const t = useTranslations('rotations.outlook');
  const { number, anchor } = useContext(Ctx);
  const nums = ids.map((id) => ({ id, n: number(id) })).filter((x): x is { id: string; n: number } => x.n != null);
  if (!nums.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-0.5 align-baseline">
      {nums.map(({ id, n }) => (
        <button
          key={id}
          type="button"
          onClick={() => goTo(anchor(id))}
          aria-label={t('citeLabel', { n })}
          className="inline-grid min-h-6 min-w-6 place-items-center rounded-md bg-sky-glow/15 px-1 text-[11px] font-semibold text-sky-glow tabular-nums hover:bg-sky-glow/25"
        >
          {n}
        </button>
      ))}
    </span>
  );
}

/** Lista de fuentes: autores, año, título, revista y lo que encontraron (en palabras simples). */
export function SourcesList({ references }: { references: Reference[] }) {
  const t = useTranslations('rotations.outlook');
  const { anchor } = useContext(Ctx);
  return (
    <ol className="flex flex-col gap-2">
      {references.map((r, i) => (
        <li key={r.id} id={anchor(r.id)} tabIndex={-1} className="scroll-mt-4 rounded-xl bg-black/20 p-3 outline-none ring-1 ring-line focus-visible:ring-2 focus-visible:ring-sky-glow">
          <p className="text-xs text-ink-muted">
            <span className="mr-1 font-semibold text-sky-glow tabular-nums">{i + 1}.</span>
            {r.authors} ({r.year}). <span className="text-ink">{r.title}</span>. <i>{r.venue}</i>.
          </p>
          <p className="mt-1 text-sm">{r.finding}</p>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-sky-glow underline-offset-4 hover:underline"
          >
            <ExternalLink aria-hidden className="size-4" />
            {t('openSource')}
            <span className="sr-only">: {r.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}
