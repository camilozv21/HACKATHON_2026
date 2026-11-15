'use client';

import clsx from 'clsx';
import { ArrowRight, MapPin, Satellite, Sprout, Waves } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  combinedEstimate,
  isDriest,
  MAX_SENSORS,
  precision,
  SATELLITE_MEAN,
  SATELLITE_PRECISION,
  SENSOR_CELLS,
  SENSOR_COLS,
  truthAt,
} from './logic';
import { buzz, Feedback, GameHeading, NowBox, PrimaryButton, Steps, useLater, type GameProps, type Message } from './ui';

/**
 * Fases: mirar con el satélite → (explicación) → clavar 3 sensores → juntar (solo, con animación) → decidir.
 * En pantalla son 3 pasos: Satélite, Sensores, Decide.
 */
type Phase = 'look' | 'seen' | 'probe' | 'combining' | 'decide' | 'done';
const STEP: Record<Phase, number> = { look: 0, seen: 0, probe: 1, combining: 1, decide: 2, done: 3 };

/** Color de humedad (más azul = más agua); el número siempre va escrito encima. */
const wetness = (v: number) => (v >= 30 ? 'bg-sky-glow' : v >= 22 ? 'bg-sky-glow/70' : v >= 15 ? 'bg-sun/70' : 'bg-sun');

/**
 * Reto 6 · Detective del suelo (satélite vs. medición en campo). Misión fija: encontrar el lote más seco para
 * regarlo primero. Paso 1: el satélite ve la finca entera como un solo cuadro (el promedio, no dice cuál lote está
 * seco). Paso 2: 3 sensores dan el dato exacto donde se clavan; al tercero, satélite y sensores se juntan solos y
 * aparece el mapa de toda la finca (con la precisión de cada forma de medir). Paso 3: tocar el número más bajo.
 */
export default function SensorsGame({ detail, reduced, say, onFinish }: GameProps) {
  const t = useTranslations('onboarding.games.sensors');
  const format = useFormatter();
  const later = useLater();
  const [phase, setPhase] = useState<Phase>('look');
  const [probes, setProbes] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [msg, setMsg] = useState<Message>(null);
  const mistakes = useRef(0);
  const pct = (v: number) => format.number(v / 100, { style: 'percent', maximumFractionDigits: 0 });
  const combined = phase === 'decide' || phase === 'done';
  const left = MAX_SENSORS - probes.length;
  const steps = [t('steps.look'), t('steps.probe'), t('steps.decide')];

  const now =
    phase === 'look'
      ? t('now.look')
      : phase === 'seen'
        ? t('now.seen', { value: pct(SATELLITE_MEAN) })
        : phase === 'probe'
          ? t('now.probe', { left })
          : phase === 'combining'
            ? t('now.combining')
            : t('now.decide');

  useEffect(() => say(`${t('title')}. ${t('task')} ${t('now.look')}`), [say, t]);

  const tell = (m: NonNullable<Message>) => {
    setMsg(m);
    say(m.text);
  };

  const look = () => {
    setPhase('seen');
    setMsg(null);
    say(t('now.seen', { value: pct(SATELLITE_MEAN) }));
  };

  const toField = () => {
    setPhase('probe');
    setMsg(null);
    say(`${t('now.probe', { left: MAX_SENSORS })} ${t('probeTip')}`);
  };

  const tapCell = (i: number) => {
    if (phase === 'probe') {
      if (probes.includes(i)) return;
      const next = [...probes, i];
      setProbes(next);
      buzz('ok');
      tell({ tone: 'info', text: t('probeValue', { value: pct(truthAt(i)) }) });
      if (next.length === MAX_SENSORS) {
        // Satélite + sensores se juntan solos: un instante de "juntando…" y aparece el mapa completo.
        setPhase('combining');
        later(
          () => {
            setPhase('decide');
            tell({ tone: 'ok', text: `${t('combined')} ${t('now.decide')}` });
          },
          reduced ? 300 : 1300,
        );
      }
      return;
    }
    if (phase !== 'decide') return;
    if (isDriest(i)) {
      buzz('ok');
      setPicked(i);
      setPhase('done');
      tell({ tone: 'ok', text: t('decideOk') });
      later(() => onFinish(mistakes.current), 2000);
    } else {
      mistakes.current += 1;
      buzz('bad');
      setWrong(i);
      later(() => setWrong(null), 750);
      tell({ tone: 'bad', text: t('decideNo', { value: pct(combinedEstimate(i, probes)) }) });
    }
  };

  const cellLabel = (i: number) => {
    const pos = { row: Math.floor(i / SENSOR_COLS) + 1, col: (i % SENSOR_COLS) + 1 };
    if (probes.includes(i)) return t('cellSensor', { ...pos, value: pct(truthAt(i)) });
    if (combined) return t('cellEstimate', { ...pos, value: pct(combinedEstimate(i, probes)) });
    return t('cell', pos);
  };
  const clickable = phase === 'probe' || phase === 'decide';

  return (
    <div className="flex flex-col gap-3">
      <GameHeading title={t('title')} task={t('task')} />
      <Steps steps={steps} current={STEP[phase]} label={t('stepsLabel')} />
      <NowBox title={t('nowTitle')}>
        {now}
        {phase === 'probe' && <span className="mt-1 block text-sm font-normal text-ink-muted">{t('probeTip')}</span>}
      </NowBox>

      <div className="flex gap-1.5 rounded-3xl bg-[#3b2a1a]/60 p-2 ring-1 ring-line">
        <div aria-hidden className="flex w-9 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-sky-glow text-black">
          <Waves className="size-5" />
          <span className="text-[11px] font-bold">{t('river')}</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div role="group" aria-label={t('farm')} className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: SENSOR_CELLS }, (_, i) => {
              const probed = probes.includes(i);
              const value = probed ? truthAt(i) : combined ? combinedEstimate(i, probes) : null;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => tapCell(i)}
                  disabled={!clickable || (phase === 'probe' && probed)}
                  aria-label={cellLabel(i)}
                  aria-pressed={picked === i ? true : undefined}
                  style={combined && !probed && !reduced ? { transitionDelay: `${(i % SENSOR_COLS) * 120}ms` } : undefined}
                  className={clsx(
                    'relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl text-xs font-bold ring-1 ring-black/20 transition-colors duration-500',
                    value === null ? 'bg-field-600/50' : wetness(value),
                    clickable && !probed && 'hover:ring-2 hover:ring-white',
                    phase === 'probe' && !probed && 'fsq-glow',
                    wrong === i && 'fsq-shake ring-2 ring-risk-high',
                    picked === i && 'ring-4 ring-white',
                  )}
                >
                  {probed ? (
                    <MapPin aria-hidden className="size-4 text-black" />
                  ) : value === null ? (
                    <Sprout aria-hidden className="size-4 text-field-900" />
                  ) : null}
                  {value !== null && (
                    <span aria-hidden className={clsx('tabular-nums', probed ? 'text-sm text-black' : 'text-black/80')}>
                      {probed ? '' : '≈'}
                      {pct(value)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {(phase === 'seen' || phase === 'combining') && (
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={clsx(
                'pointer-events-none absolute inset-0 grid place-items-center rounded-2xl ring-2 ring-inset',
                phase === 'seen' ? 'bg-sun/35 ring-sun' : 'bg-sky-glow/20 ring-sky-glow',
              )}
            >
              <span className="flex items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-base font-bold text-white">
                <Satellite className="size-5" />
                {phase === 'seen' ? t('satPixel', { value: pct(SATELLITE_MEAN) }) : t('now.combining')}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {(phase === 'probe' || phase === 'combining') && (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden>{t('sensors')}</span>
          <span aria-hidden className="flex gap-1">
            {Array.from({ length: MAX_SENSORS }, (_, k) => (
              <MapPin key={k} className={clsx('size-5', k < probes.length ? 'text-field-300' : 'text-ink-faint')} />
            ))}
          </span>
          <span className="sr-only">{t('sensorsCount', { used: probes.length, total: MAX_SENSORS })}</span>
          <span className="ml-auto text-xs font-normal text-ink-muted">{t('satBadge', { value: pct(SATELLITE_MEAN) })}</span>
        </p>
      )}

      {combined && (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
          <p className="text-xs font-bold tracking-wider text-ink-muted uppercase">{t('precisionTitle')}</p>
          {(
            [
              { label: t('precisionSat'), value: SATELLITE_PRECISION, cls: 'bg-sun' },
              { label: t('precisionBoth'), value: precision(probes), cls: 'bg-field-500' },
            ] as const
          ).map(({ label, value, cls }) => (
            <div key={label}>
              <p className="flex justify-between text-sm font-semibold">
                <span>{label}</span>
                <span className="tabular-nums">{pct(value)}</span>
              </p>
              <div aria-hidden className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={clsx('h-full rounded-full', cls)}
                  initial={{ width: reduced ? `${value}%` : '0%' }}
                  animate={{ width: `${value}%` }}
                  transition={{ duration: reduced ? 0 : 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
          {detail && <p className="text-xs text-ink-muted">{t('formula')}</p>}
        </div>
      )}

      <Feedback message={msg} />

      {phase === 'look' && (
        <PrimaryButton onClick={look}>
          <Satellite aria-hidden className="size-6" />
          {t('look')}
        </PrimaryButton>
      )}
      {phase === 'seen' && (
        <PrimaryButton onClick={toField}>
          {t('toField')}
          <ArrowRight aria-hidden className="size-6" />
        </PrimaryButton>
      )}
    </div>
  );
}
