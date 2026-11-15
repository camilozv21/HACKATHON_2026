'use client';

import clsx from 'clsx';
import { ArrowRight, Leaf, Satellite, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { TermIcon } from '@/features/glossary/TermIcon';
import { useUnits } from '@/lib/units';
import { GAMES, type GameId, type Stars } from './catalog';
import { PrimaryButton, useFocusRef } from './ui';

/** Parámetros de los textos de los retos: los que hablan de temperatura usan la unidad de la persona. */
export function useLearnedParams() {
  const units = useUnits();
  return { zero: units.temp(0), delta: units.tempDelta(3) };
}

/** Lo que lee el locutor al terminar un reto. */
export function useLearnedSpoken() {
  const t = useTranslations('onboarding.games');
  const tg = useTranslations('glossary');
  const params = useLearnedParams();
  return (id: GameId, stars: Exclude<Stars, 0>) => {
    const main = GAMES[id].terms[0];
    return [t(`learned.praise${stars}`), t('learned.stars', { stars }), tg(`terms.${main}.title`), tg(`terms.${main}.simple`), t(`${id}.lesson`, params)].join('. ');
  };
}

/** Tarjeta de cierre de cada reto: lo que aprendió, con las palabras del glosario. */
export function Learned({
  id,
  stars,
  detail,
  reduced,
  nextLabel,
  onNext,
}: {
  id: GameId;
  stars: Stars;
  detail: boolean;
  reduced: boolean;
  nextLabel: string;
  onNext: () => void;
}) {
  const t = useTranslations('onboarding.games');
  const tg = useTranslations('glossary');
  const params = useLearnedParams();
  const heading = useFocusRef<HTMLHeadingElement>();
  const earned = Math.max(stars, 1) as 1 | 2 | 3;
  const [main, ...more] = GAMES[id].terms;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-col items-center gap-1 text-center">
        {stars === 3 && !reduced && <Burst />}
        <div role="img" aria-label={t('learned.stars', { stars })} className="flex items-end gap-1">
          {[1, 2, 3].map((n) => (
            <motion.span
              key={n}
              initial={reduced ? false : { scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14, delay: reduced ? 0 : 0.12 * n }}
            >
              <Star
                aria-hidden
                className={clsx(n === 2 ? 'size-11' : 'size-9', n <= stars ? 'fill-sun text-sun' : 'text-ink-faint')}
              />
            </motion.span>
          ))}
        </div>
        <p className="text-sm font-bold text-sun">{t(`learned.praise${earned}`)}</p>
        <p className="text-xs font-semibold tracking-wider text-field-300 uppercase">{t('learned.kicker')}</p>
        <h2 id="quiz-title" ref={heading} tabIndex={-1} className="flex items-center gap-2 text-2xl leading-tight font-bold outline-none">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-field-500/20 text-field-300">
            <TermIcon term={main} className="size-6" />
          </span>
          {tg(`terms.${main}.title`)}
        </h2>
      </div>

      <p className="text-base">{tg(`terms.${main}.simple`)}</p>
      <div className="rounded-2xl bg-field-500/10 p-3 ring-1 ring-field-500/40">
        <p className="text-xs font-bold tracking-wider text-field-300 uppercase">{t('learned.key')}</p>
        <p className="mt-1 text-sm">{t(`${id}.lesson`, params)}</p>
      </div>
      {detail && (
        <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
          <p className="text-xs font-bold tracking-wider text-sky-glow uppercase">{t('learned.science')}</p>
          <p className="mt-1 text-sm">{t(`${id}.science`, params)}</p>
        </div>
      )}
      {more.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <Leaf aria-hidden className="size-4 text-field-300" />
          <span className="font-semibold">{t('learned.also')}</span>
          {more.map((m) => (
            <span key={m} className="rounded-full bg-white/10 px-2 py-0.5 font-semibold">
              {tg(`terms.${m}.title`)}
            </span>
          ))}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        <Satellite aria-hidden className="size-4 text-sky-glow" />
        <span className="font-semibold text-ink-muted">{t('learned.measures')}</span>
        {GAMES[id].missions.map((m) => (
          <span key={m} className="rounded-full bg-sky-glow/15 px-2 py-0.5 font-semibold ring-1 ring-sky-glow/40">
            {m}
          </span>
        ))}
      </p>
      <PrimaryButton onClick={onNext}>
        {nextLabel}
        <ArrowRight aria-hidden className="size-6" />
      </PrimaryButton>
    </div>
  );
}

/** Estallido de estrellas al ganar 3 (una sola vez; no con movimiento reducido). */
function Burst() {
  return (
    <div aria-hidden className="pointer-events-none absolute top-6 left-1/2">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className={clsx('absolute size-2 rounded-full', i % 3 === 0 ? 'bg-sun' : i % 3 === 1 ? 'bg-field-400' : 'bg-sky-glow')}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * 90, y: Math.sin(a) * 60, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.35 }}
          />
        );
      })}
    </div>
  );
}

