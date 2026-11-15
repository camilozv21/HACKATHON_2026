'use client';

import { ArrowRight, Equal, MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ANOMALY_CARDS, ANOMALY_SCALE_MAX, classifyAnomaly, type AnomalyAnswer } from './logic';
import { AnswerButton, buzz, Feedback, GameHeading, PrimaryButton, type GameProps, type Message } from './ui';

const ANSWERS: { value: AnomalyAnswer; Icon: typeof Equal }[] = [
  { value: 'drier', Icon: TrendingDown },
  { value: 'normal', Icon: Equal },
  { value: 'wetter', Icon: TrendingUp },
];

/**
 * Reto 4 · ¿Seco para quién? (anomalía de humedad del suelo, SMAP). Cuatro lugares: el agua del suelo de hoy contra
 * lo normal de ese mes. Dos son trampa: el desierto con poca agua pero normal, y la selva con mucha agua pero menos
 * de lo normal. Enseña que la anomalía compara con lo normal de cada lugar, no con un número fijo.
 */
export default function AnomalyGame({ detail, reduced, say, onFinish }: GameProps) {
  const t = useTranslations('onboarding.games.anomaly');
  const format = useFormatter();
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<AnomalyAnswer | null>(null);
  const [msg, setMsg] = useState<Message>(null);
  const mistakes = useRef(0);
  const card = ANOMALY_CARDS[idx]!;
  const right = classifyAnomaly(card.now, card.normal);
  const diff = card.now - card.normal;
  const pct = (v: number) => format.number(v / 100, { style: 'percent', maximumFractionDigits: 0 });
  const last = idx === ANOMALY_CARDS.length - 1;

  useEffect(() => say(`${t('title')}. ${t('task')}`), [say, t]);

  const choose = (a: AnomalyAnswer) => {
    if (answer) return;
    setAnswer(a);
    const ok = a === right;
    if (!ok) mistakes.current += 1;
    buzz(ok ? 'ok' : 'bad');
    const text = `${ok ? t('right') : t('wrong', { answer: t(`answers.${right}`) })} ${t(`cards.${card.id}.why`)}`;
    setMsg({ tone: ok ? 'ok' : 'bad', text });
    say(text);
  };

  const next = () => {
    if (last) return onFinish(mistakes.current);
    setIdx(idx + 1);
    setAnswer(null);
    setMsg(null);
    const c = ANOMALY_CARDS[idx + 1]!;
    say(`${t(`cards.${c.id}.place`)}, ${t(`cards.${c.id}.month`)}.`);
  };

  const signedDiff = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${format.number(Math.abs(diff))}`;
  const lo = Math.min(card.now, card.normal);
  const hi = Math.max(card.now, card.normal);

  return (
    <div className="flex flex-col gap-3">
      <GameHeading
        title={t('title')}
        task={t('task')}
        kicker={
          <p className="text-xs font-semibold tracking-wider text-sky-glow uppercase">{t('card', { n: idx + 1, total: ANOMALY_CARDS.length })}</p>
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.id}
          initial={reduced ? { opacity: 0 } : { opacity: 0, rotateY: -70, x: 30 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, rotateY: 70, x: -30 }}
          transition={{ duration: reduced ? 0.12 : 0.32, ease: 'easeOut' }}
          className="rounded-3xl bg-gradient-to-br from-white/10 to-white/0 p-4 ring-1 ring-line"
        >
          <p className="flex items-center gap-2 text-lg font-bold">
            <MapPin aria-hidden className="size-5 text-field-300" />
            {t(`cards.${card.id}.place`)}
          </p>
          <p className="text-sm text-ink-muted">{t(`cards.${card.id}.month`)}</p>

          <div className="mt-4 flex flex-col gap-1">
            <div className="relative h-11 rounded-xl bg-black/30 ring-1 ring-line">
              <div
                className="absolute inset-y-0 left-0 rounded-xl bg-sky-glow/80 transition-[width] duration-500"
                style={{ width: `${(card.now / ANOMALY_SCALE_MAX) * 100}%` }}
              />
              {answer && diff !== 0 && (
                <div
                  aria-hidden
                  className="absolute inset-y-2 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.55)_0_4px,transparent_4px_8px)]"
                  style={{ left: `${(lo / ANOMALY_SCALE_MAX) * 100}%`, width: `${((hi - lo) / ANOMALY_SCALE_MAX) * 100}%` }}
                />
              )}
              <div
                aria-hidden
                className="absolute -inset-y-1.5 w-0 border-l-[3px] border-dashed border-sun"
                style={{ left: `${(card.normal / ANOMALY_SCALE_MAX) * 100}%` }}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm bg-sky-glow" />
                {t('now')}: <b>{pct(card.now)}</b>
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-0 border-l-[3px] border-dashed border-sun" />
                {t('normal')}: <b>{pct(card.normal)}</b>
              </span>
            </div>
            {answer && (
              <p className="mt-1 text-center text-base font-bold">
                {t('diff', { value: signedDiff })} · {t(`answers.${right}`)}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-col gap-2">
        {ANSWERS.map(({ value, Icon }) => (
          <AnswerButton
            key={value}
            Icon={Icon}
            onClick={() => choose(value)}
            disabled={answer !== null}
            state={answer === null ? 'idle' : value === right ? 'right' : value === answer ? 'wrong' : 'idle'}
          >
            {t(`answers.${value}`)}
          </AnswerButton>
        ))}
      </div>

      {detail && answer && <p className="text-xs text-ink-muted">{t('formula')}</p>}
      <Feedback message={msg} />
      {answer && (
        <PrimaryButton onClick={next}>
          {last ? t('finish') : t('nextCard')}
          <ArrowRight aria-hidden className="size-6" />
        </PrimaryButton>
      )}
    </div>
  );
}
