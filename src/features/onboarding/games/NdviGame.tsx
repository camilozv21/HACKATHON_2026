'use client';

import clsx from 'clsx';
import { Check, ScanEye, Sprout } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { isStressed, NDVI_LOTS, ndviClass, STRESSED_LOTS } from './logic';
import { buzz, Feedback, GameHeading, useLater, type GameProps, type Message } from './ui';

const LENS_BG = { high: 'bg-risk-low', mid: 'bg-risk-medium', low: 'bg-risk-high' } as const;

/**
 * Reto 1 · Visión satélite (NDVI). Nueve lotes que a simple vista se ven igual de verdes; con la "visión del
 * satélite" (falso color + número) se ven los 3 con estrés. Enseña: NDVI alto = planta vigorosa, bajo = sed,
 * plaga o suelo desnudo, y que el satélite lo nota antes que el ojo. Cada lote dice su número (no solo color).
 */
export default function NdviGame({ detail, reduced, say, onFinish }: GameProps) {
  const t = useTranslations('onboarding.games.ndvi');
  const format = useFormatter();
  const later = useLater();
  const [lens, setLens] = useState(false);
  const [usedLens, setUsedLens] = useState(false);
  const [scan, setScan] = useState(0);
  const [found, setFound] = useState<number[]>([]);
  const [shake, setShake] = useState<number | null>(null);
  const [msg, setMsg] = useState<Message>(null);
  const mistakes = useRef(0);
  const done = found.length === STRESSED_LOTS.length;
  const fmt = (v: number) => format.number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => say(`${t('title')}. ${t('task')}`), [say, t]);

  const tell = (m: NonNullable<Message>) => {
    setMsg(m);
    say(m.text);
  };

  const toggleLens = () => {
    const on = !lens;
    setLens(on);
    if (!on) return;
    setUsedLens(true);
    setScan((s) => s + 1);
    tell({ tone: 'info', text: t('lensOn') });
  };

  const tap = (i: number) => {
    if (done || found.includes(i)) return;
    const v = NDVI_LOTS[i]!;
    if (!lens) return tell({ tone: 'info', text: t('needLens') });
    if (isStressed(v)) {
      const next = [...found, i];
      const left = STRESSED_LOTS.length - next.length;
      setFound(next);
      buzz('ok');
      tell({ tone: 'ok', text: left === 0 ? t('allFound') : t('found', { value: fmt(v), left }) });
      if (left === 0) later(() => onFinish(mistakes.current), 1600);
    } else {
      mistakes.current += 1;
      buzz('bad');
      setShake(i);
      later(() => setShake(null), 750);
      tell({ tone: 'bad', text: t('healthy', { value: fmt(v) }) });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <GameHeading title={t('title')} task={t('task')} />

      <div className="relative">
        <p aria-hidden className="mb-1.5 text-center text-xs font-semibold tracking-wider text-ink-muted uppercase">
          {lens ? t('lensView') : t('eyeView')}
        </p>
        <div role="group" aria-label={lens ? t('lensView') : t('eyeView')} className="grid grid-cols-3 gap-2 rounded-3xl bg-black/25 p-2 ring-1 ring-line">
          {NDVI_LOTS.map((v, i) => {
            const isFound = found.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => tap(i)}
                aria-pressed={isFound}
                aria-label={lens ? t('lotValue', { n: i + 1, value: fmt(v) }) : t('lot', { n: i + 1 })}
                style={lens && !reduced ? { transitionDelay: `${Math.floor(i / 3) * 160}ms` } : undefined}
                className={clsx(
                  'relative grid aspect-[4/3] min-h-14 place-items-center overflow-hidden rounded-2xl ring-1 ring-black/20 transition-colors duration-500',
                  lens ? LENS_BG[ndviClass(v)] : 'bg-field-600',
                  shake === i && 'fsq-shake',
                  isFound && 'ring-4 ring-white',
                )}
              >
                <span aria-hidden className="flex -space-x-1 text-field-900">
                  <Sprout className="size-5" />
                  <Sprout className="size-6" />
                  <Sprout className="size-5" />
                </span>
                {lens && (
                  <span aria-hidden className="absolute bottom-1 rounded-full bg-black/75 px-2 text-sm font-bold text-white tabular-nums">
                    {fmt(v)}
                  </span>
                )}
                {isFound && (
                  <span aria-hidden className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-white text-black">
                    <Check className="size-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {lens && !reduced && (
          <motion.div
            key={scan}
            aria-hidden
            className="pointer-events-none absolute inset-x-2 h-12 rounded-full bg-gradient-to-b from-transparent via-sky-glow/70 to-transparent"
            initial={{ top: '8%', opacity: 1 }}
            animate={{ top: '92%', opacity: 0 }}
            transition={{ duration: 0.75, ease: 'easeInOut' }}
          />
        )}
      </div>

      {lens && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span>{t('legendLow')}</span>
            <span aria-hidden className="h-2.5 flex-1 rounded-full bg-gradient-to-r from-risk-high via-risk-medium to-risk-low" />
            <span>{t('legendHigh')}</span>
          </div>
          {detail && <p className="text-xs text-ink-muted">{t('formula')}</p>}
        </div>
      )}

      <Feedback message={msg} />

      <button
        type="button"
        onClick={toggleLens}
        aria-pressed={lens}
        disabled={done}
        className={clsx(
          'relative flex min-h-14 items-center justify-center gap-2 rounded-full px-5 text-lg font-semibold',
          lens ? 'bg-sky-glow text-black' : 'bg-white/10 text-ink ring-2 ring-sky-glow/70',
        )}
      >
        {!usedLens && <span aria-hidden className="fsq-ping absolute inset-0 rounded-full ring-2 ring-sky-glow" />}
        <ScanEye aria-hidden className="size-6" />
        {t('lens')}
        <span aria-hidden className="text-sm font-bold opacity-80">
          · {lens ? t('on') : t('off')}
        </span>
      </button>
    </div>
  );
}
