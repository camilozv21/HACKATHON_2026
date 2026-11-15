'use client';

import clsx from 'clsx';
import { ArrowRight, Check, CloudSun, Droplets, Leaf, Satellite, ScanEye, Scale, Snowflake, SkipForward, Star, Wind, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentType } from 'react';
import { TermIcon } from '@/features/glossary/TermIcon';
import { useUnits } from '@/lib/units';
import AnomalyGame from './AnomalyGame';
import BalanceGame from './BalanceGame';
import { GAME_IDS, GAMES, starsFor, type GameId, type QuestResults, type Stars } from './catalog';
import EtGame from './EtGame';
import FrostGame from './FrostGame';
import NdviGame from './NdviGame';
import SeasonGame from './SeasonGame';
import SensorsGame from './SensorsGame';
import { GameStyles, PrimaryButton, useFocusRef, type GameProps } from './ui';

const GAME_COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  ndvi: NdviGame,
  et: EtGame,
  balance: BalanceGame,
  anomaly: AnomalyGame,
  frost: FrostGame,
  sensors: SensorsGame,
  season: SeasonGame,
};

export const GAME_ICONS: Record<GameId, LucideIcon> = {
  ndvi: ScanEye,
  et: Wind,
  balance: Scale,
  anomaly: Droplets,
  frost: Snowflake,
  sensors: Satellite,
  season: CloudSun,
};

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
  const tg = useTranslations('glossary');
  const units = useUnits();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'play' | 'learned'>('play');
  const [results, setResults] = useState<QuestResults>({});
  const id = GAME_IDS[index]!;
  const game = GAMES[id];
  const Game = GAME_COMPONENTS[id];
  const last = index === GAME_IDS.length - 1;
  const stars = results[id] ?? 0;
  const [main, ...more] = game.terms;
  // Los mensajes con temperatura usan la unidad de la persona (nunca "°C" fijo).
  const params = { zero: units.temp(0), delta: units.tempDelta(3) };

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
    say(
      [t(`learned.praise${s}`), t('learned.stars', { stars: s }), tg(`terms.${main}.title`), tg(`terms.${main}.simple`), t(`${id}.lesson`, params)].join(
        '. ',
      ),
    );
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
              main={main}
              more={more}
              detail={detail}
              reduced={reduced}
              params={params}
              last={last}
              onNext={() => advance(results)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Tarjeta de cierre de cada reto: lo que aprendió, con las palabras del glosario. */
function Learned({
  id,
  stars,
  main,
  more,
  detail,
  reduced,
  params,
  last,
  onNext,
}: {
  id: GameId;
  stars: Stars;
  main: (typeof GAMES)[GameId]['terms'][number];
  more: (typeof GAMES)[GameId]['terms'][number][];
  detail: boolean;
  reduced: boolean;
  params: Record<string, string>;
  last: boolean;
  onNext: () => void;
}) {
  const t = useTranslations('onboarding.games');
  const tg = useTranslations('glossary');
  const heading = useFocusRef<HTMLHeadingElement>();
  const earned = Math.max(stars, 1) as 1 | 2 | 3;

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
        {last ? t('learned.finish') : t('learned.nextGame')}
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

