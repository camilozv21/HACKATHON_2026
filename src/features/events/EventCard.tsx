'use client';

import clsx from 'clsx';
import { ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { EventDetail, KindBadge, useEventDate } from './EventDetail';
import { useEventsStore } from './store';

/**
 * Detalle de lo tocado en el globo. Si hay varios eventos en el mismo punto (UNGRD los ubica en el centro del
 * municipio) se listan y se abre uno a la vez. Panel inferior en móvil; tarjeta flotante a la izquierda en desktop.
 */
export function EventCard() {
  const t = useTranslations('events');
  const isDesktop = useIsDesktop();
  const selected = useEventsStore((s) => s.selected);
  const select = useEventsStore((s) => s.select);
  const dateLabel = useEventDate();
  const [open, setOpen] = useState<string | null>(selected?.[0]?.id ?? null);
  const [prevSel, setPrevSel] = useState(selected);
  const closeRef = useRef<HTMLButtonElement>(null);
  if (prevSel !== selected) {
    setPrevSel(selected);
    setOpen(selected?.[0]?.id ?? null);
  }

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useEventsStore.getState().select(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  if (!selected?.length) return null;
  const single = selected.length === 1 ? selected[0]! : null;
  const list = selected.slice(0, 12);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="event-card-title"
      className={clsx(
        'panel pointer-events-auto fixed z-40 flex flex-col overflow-hidden shadow-2xl',
        isDesktop
          ? 'bottom-[calc(var(--safe-bottom)+1rem)] left-4 max-h-[70dvh] w-[24rem] rounded-3xl'
          : 'inset-x-0 bottom-0 max-h-[65dvh] rounded-t-[var(--radius-sheet)] pb-[var(--safe-bottom)]',
      )}
    >
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        {single && <KindBadge kind={single.kind} ring={single.source === 'community'} />}
        <h2 id="event-card-title" className="min-w-0 flex-1 text-lg leading-tight font-bold">
          {single ? t(`kind.${single.kind}`) : t('here', { count: selected.length })}
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={() => select(null)}
          aria-label={t('close')}
          className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <div className="overflow-y-auto overscroll-contain px-4 pb-4">
        {single ? (
          <EventDetail event={single} />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((e) => {
              const expanded = open === e.id;
              return (
                <li key={e.id} className="rounded-2xl bg-white/5 ring-1 ring-line">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : e.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                  >
                    <KindBadge kind={e.kind} ring={e.source === 'community'} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{t(`kind.${e.kind}`)}</span>
                      <span className="block text-xs text-ink-muted">
                        {dateLabel(e.date)} · {t(`source.${e.source}`)}
                      </span>
                    </span>
                    <ChevronDown aria-hidden className={clsx('size-5 shrink-0 transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3">
                      <EventDetail event={e} compact />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
