'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { TermIcon } from './TermIcon';
import { useGlossaryStore } from './terms';

export { TermIcon };

/** Varias partes montan la hoja (panel de la finca, radio): solo la primera montada la muestra (nunca dos a la vez). */
const hosts: symbol[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
function usePrimaryHost() {
  const [id] = useState(() => Symbol('glossary-host'));
  useEffect(() => {
    hosts.push(id);
    emit();
    return () => {
      hosts.splice(hosts.indexOf(id), 1);
      emit();
    };
  }, [id]);
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => hosts[0] === id,
    () => false,
  );
}

export default function GlossarySheet() {
  const t = useTranslations('glossary');
  const primary = usePrimaryHost();
  const term = useGlossaryStore((s) => (primary ? s.open : null));
  const close = useGlossaryStore((s) => s.close);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!term) return;
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [term, close]);

  if (!term) return null;

  // Portal a <body>: dentro del sheet (vaul usa transform) un `fixed` quedaría recortado al sheet.
  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" aria-label={t('close')} onClick={close} className="absolute inset-0 bg-black/50" tabIndex={-1} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="glossary-title"
        className="panel relative m-0 w-full max-w-md rounded-t-3xl p-5 pb-[calc(var(--safe-bottom)+1.25rem)] shadow-2xl sm:m-4 sm:rounded-3xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-field-500/20 text-field-300">
            <TermIcon term={term} className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('kicker')}</p>
            <h2 id="glossary-title" className="text-xl font-bold">
              {t(`terms.${term}.title`)}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={t('close')}
            className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <p className="mt-3 text-base">{t(`terms.${term}.simple`)}</p>
        <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-line">
          <p className="text-xs font-semibold text-field-300 uppercase">{t('example')}</p>
          <p className="mt-1">{t(`terms.${term}.example`)}</p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
