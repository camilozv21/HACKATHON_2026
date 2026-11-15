'use client';

import clsx from 'clsx';
import { Check, SkipForward } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GAME_IDS, starsFor, type QuestResults, type Stars } from './catalog';
import { Learned, useLearnedSpoken } from './Learned';
import { GAME_COMPONENTS, GAME_ICONS } from './registry';
import { GameStyles } from './ui';

type Props = {
  detail: boolean;
  reduced: boolean;
  say: (text: string) => void;
  /** Cada cambio de reto o de resultados (la cabecera muestra "Reto n de 7" y las estrellas). */
  onProgress: (index: number, results: QuestResults) => void;
  onDone: (results: QuestResults) => void;
};

/**
 * Los retos del glosario, uno detrás de otro: el juego → "¡Lo aprendiste!" (estrellas, término del glosario, la
 * clave, qué misión lo mide y, en modo detalle, la ciencia) → el siguiente. Arriba, el camino de los 7 retos.
 * Cada reto se puede saltar (cuenta como "para repasar").
 */
export default function QuestRunner({ detail, reduced, say, onProgress, onDone }: Props) {
  const t = useTranslations('onboarding.games');
  const learnedSpoken = useLearnedSpoken();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'play' | 'learned'>('play');
  const [results, setResults] = useState<QuestResults>({});
  const id = GAME_IDS[index]!;
  const Game = GAME_COMPONENTS[id];
  const last = index === GAME_IDS.length - 1;
  const stars = results[id] ?? 0;

  const record = (s: Stars) => {
    const next = { ...results, [id]: s };
    setResults(next);
    onProgress(index, next);
    return next;
  };

  const finish = (mistakes: number) => {
    const s = starsFor(mistakes);
    record(s);
    setPhase('learned');
    say(learnedSpoken(id, s));
  };

  const advance = (r: QuestResults) => {
    if (last) return onDone(r);
    setIndex(index + 1);
    setPhase('play');
    onProgress(index + 1, r);
  };

  const skip = () => advance(record(0));

  return (
    <div className="flex flex-col gap-3">
      <GameStyles />
      <ol aria-label={t('path')} className="flex items-center">
        {GAME_IDS.map((g, i) => {
          const Icon = GAME_ICONS[g];
          const done = results[g] !== undefined && !(i === index && phase === 'play');
          const status =
            i === index && phase === 'play'
              ? t('status.current')
              : done
                ? results[g]
                  ? t('status.done', { stars: results[g] ?? 0 })
                  : t('status.skipped')
                : t('status.next');
          return (
            <li key={g} aria-current={i === index ? 'step' : undefined} className={clsx('flex items-center', i < GAME_IDS.length - 1 && 'flex-1')}>
              <span className="sr-only">{t('pathItem', { n: i + 1, name: t(`${g}.name`), status })}</span>
              <span
                aria-hidden
                className={clsx(
                  'grid size-8 shrink-0 place-items-center rounded-full ring-1 transition-transform duration-300',
                  i === index
                    ? 'scale-110 bg-field-500 text-black ring-2 ring-field-300'
                    : done
                      ? 'bg-field-500/25 text-field-300 ring-field-500/50'
                      : 'bg-white/5 text-ink-faint ring-line',
                )}
              >
                {done && i !== index ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              {i < GAME_IDS.length - 1 && <span aria-hidden className={clsx('mx-0.5 h-0.5 flex-1 rounded', i < index ? 'bg-field-500/70' : 'bg-line')} />}
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${id}-${phase}`}
          data-quest-step={`${id}-${phase}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: reduced ? 0.12 : 0.22, ease: 'easeOut' }}
        >
          {phase === 'play' ? (
            <div className="flex flex-col gap-2">
              <Game detail={detail} reduced={reduced} say={say} onFinish={finish} />
              <button
                type="button"
                onClick={skip}
                className="flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-sm font-semibold text-ink-muted hover:bg-white/10"
              >
                <SkipForward aria-hidden className="size-4" />
                {t('skipGame')}
              </button>
            </div>
          ) : (
            <Learned
              id={id}
              stars={stars}
              detail={detail}
              reduced={reduced}
              nextLabel={last ? t('learned.finish') : t('learned.nextGame')}
              onNext={() => advance(results)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
