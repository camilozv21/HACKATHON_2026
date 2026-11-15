'use client';

import { Trophy } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { shownPoints, usePointsStore, type Flash } from './store';

const AccountDialog = dynamic(() => import('./AccountDialog'), { ssr: false });

/**
 * Botón de puntos (arriba a la derecha, con el globo listo): el total de la cuenta o, sin cuenta, los puntos sin
 * guardar (con un punto amarillo). Abre "Tu puntaje" (crear cuenta, entrar, cómo ganar puntos). Cada premio
 * muestra "+N" debajo un momento y se anuncia a los lectores de pantalla.
 */
export function PointsButton() {
  const t = useTranslations('points');
  const locale = useLocale();
  const points = usePointsStore(shownPoints);
  const signedIn = usePointsStore((s) => s.account !== null);
  const open = usePointsStore((s) => s.dialogOpen);
  const setOpen = usePointsStore((s) => s.setDialogOpen);
  const flash = usePointsStore((s) => s.flash);
  // El "+N" se ve 2,8 s: luego se marca como visto (el siguiente premio trae otro `seq`).
  const [seenSeq, setSeenSeq] = useState(0);
  const shown: Flash | null = flash && flash.seq !== seenSeq ? flash : null;
  const fmt = (n: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO').format(n);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setSeenSeq(flash.seq), 2800);
    return () => clearTimeout(id);
  }, [flash]);

  const what = shown ? (shown.action ? t(`actions.${shown.action}.done`) : t('flash.saved')) : '';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={signedIn ? t('button.aria', { points: fmt(points) }) : t('button.ariaGuest', { points: fmt(points) })}
        className="glass pointer-events-auto relative flex h-12 items-center gap-1.5 rounded-full px-3.5 font-bold tabular-nums shadow-lg"
      >
        <Trophy aria-hidden className="size-5 text-sun" />
        <span>{fmt(points)}</span>
        {!signedIn && points > 0 && <span aria-hidden className="absolute top-1 right-1 size-2.5 rounded-full bg-sun ring-2 ring-space" />}
      </button>
      {shown && (
        <p
          key={shown.seq}
          aria-hidden
          className="points-pop pointer-events-none absolute top-full right-0 mt-2 rounded-full bg-sun px-3 py-1 text-sm font-bold whitespace-nowrap text-black shadow-lg"
        >
          {t('flash.plus', { points: fmt(shown.points) })} · {what}
        </p>
      )}
      <p role="status" className="sr-only">
        {shown ? t(shown.saved ? 'flash.sr' : 'flash.srGuest', { points: fmt(shown.points), what }) : ''}
      </p>
      {open && <AccountDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
