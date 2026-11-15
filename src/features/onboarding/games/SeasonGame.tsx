'use client';

import clsx from 'clsx';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bean,
  CloudRain,
  Droplets,
  Eye,
  Flame,
  Hand,
  Leaf,
  Pointer,
  Repeat,
  Satellite,
  Shovel,
  Sprout,
  SprayCan,
  Sun,
  Sunrise,
  Thermometer,
  Tractor,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useUnits } from '@/lib/units';
import {
  applyChoice,
  GAUGE_MISSION,
  optionTone,
  SEASON_START,
  SEASON_TURNS,
  soilStatus,
  vulnerability,
  type GaugeKey,
  type Health,
  type SeasonOption,
  type SeasonTurn,
} from './logic';
import { AnswerButton, buzz, Feedback, GameHeading, PrimaryButton, Steps, type GameProps, type Message } from './ui';

const GAUGE_ICONS: Record<GaugeKey, LucideIcon> = { temp: Thermometer, moisture: Droplets, rain: CloudRain, et: Wind, ndvi: Leaf };
const TURN_ICONS = { storm: CloudRain, heat: Sun, stress: Leaf, harvest: Tractor } as const;
const OPTION_ICONS: Record<string, LucideIcon> = {
  plow: Tractor,
  cover: Sprout,
  nothing: Hand,
  noon: Sun,
  fertilize: SprayCan,
  dawn: Sunrise,
  spray: SprayCan,
  scout: Eye,
  ignore: Hand,
  repeat: Repeat,
  burn: Flame,
  legume: Bean,
};
const BAR = { good: 'bg-field-500', fair: 'bg-risk-medium', poor: 'bg-risk-high' } as const;

/**
 * Reto 7 · Sobrevive la temporada (vulnerabilidad del cultivo y salud del suelo). Como un juego de "vidas": dos
 * barras arriba (tu cultivo, tu suelo). En cada uno de los 4 momentos el satélite da 1–3 avisos en frases cortas
 * (con la misión que lo mide) y la persona elige qué hace; las barras suben o bajan con +/−. Cubre calor, humedad
 * del suelo, lluvia, evaporación y verdor, y cómo juntos vuelven vulnerable al cultivo o cuidan el suelo.
 */
export default function SeasonGame({ reduced, say, onFinish }: GameProps) {
  const t = useTranslations('onboarding.games.season');
  const format = useFormatter();
  const units = useUnits();
  const [turn, setTurn] = useState(0);
  const [health, setHealth] = useState<Health>(SEASON_START);
  const [chosen, setChosen] = useState<SeasonOption | null>(null);
  const [end, setEnd] = useState(false);
  const [msg, setMsg] = useState<Message>(null);
  const mistakes = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const current = SEASON_TURNS[turn]!;
  const last = turn === SEASON_TURNS.length - 1;
  const signed = (n: number) => format.number(n, { signDisplay: 'exceptZero' });

  const value = (k: GaugeKey, v: number) => {
    switch (k) {
      case 'temp':
        return units.temp(v);
      case 'moisture':
        return format.number(v / 100, { style: 'percent', maximumFractionDigits: 0 });
      case 'rain':
        return units.rain(v);
      case 'et':
        return `${format.number(units.rainValue(v), { maximumFractionDigits: 1 })} ${units.rainUnit}`;
      case 'ndvi':
        return format.number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };
  const alert = (tr: SeasonTurn, k: GaugeKey) => t(`turns.${tr.id}.say.${k}`, { value: value(k, tr.gauges[k]) });
  const turnSpoken = (tr: SeasonTurn) =>
    [t(`turns.${tr.id}.when`), t(`turns.${tr.id}.title`), t('alertsTitle'), ...tr.focus.map((k) => alert(tr, k)), t('question')].join('. ');

  useEffect(() => {
    say(`${t('title')}. ${t('task')} ${turnSpoken(SEASON_TURNS[0]!)}`);
    // Solo al montar: cada momento siguiente se lee al tocar "Siguiente momento".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say, t]);

  const choose = (o: SeasonOption) => {
    if (chosen) return;
    setChosen(o);
    setHealth((h) => applyChoice(h, o));
    if (!o.best) mistakes.current += 1;
    const tone = optionTone(o);
    buzz(tone);
    const text = `${t(`turns.${current.id}.feedback.${o.id}`)} ${t('delta', { crop: signed(o.crop), soil: signed(o.soil) })}`;
    setMsg({ tone, text });
    say(text);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }));
  };

  const next = () => {
    if (last) {
      setEnd(true);
      setMsg(null);
      say(`${t('endTitle')}. ${t(`vulnerability.${vulnerability(health.crop)}`)}. ${t(`soilStatus.${soilStatus(health.soil)}`)}. ${t('endText')}`);
      return;
    }
    const n = SEASON_TURNS[turn + 1]!;
    setTurn(turn + 1);
    setChosen(null);
    setMsg(null);
    say(turnSpoken(n));
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }));
  };

  const cropState = vulnerability(health.crop);
  const soilState = soilStatus(health.soil);
  const bars = (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          {
            key: 'crop',
            v: health.crop,
            d: chosen?.crop,
            label: t('crop'),
            status: t(`vulnerability.${cropState}`),
            cls: BAR[cropState === 'low' ? 'good' : cropState === 'medium' ? 'fair' : 'poor'],
            Icon: Sprout,
          },
          { key: 'soil', v: health.soil, d: chosen?.soil, label: t('soil'), status: t(`soilStatus.${soilState}`), cls: BAR[soilState], Icon: Shovel },
        ] as const
      ).map(({ key, v, d, label, status, cls, Icon }) => (
        <div key={key} className="relative rounded-2xl bg-white/5 p-2 ring-1 ring-line">
          <p className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
            <Icon aria-hidden className="size-3.5" />
            {label}
          </p>
          <div
            role="meter"
            aria-label={label}
            aria-valuenow={v}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={status}
            className="mt-1 h-3 overflow-hidden rounded-full bg-white/10"
          >
            <div className={clsx('h-full rounded-full transition-[width] duration-700', cls)} style={{ width: `${v}%` }} />
          </div>
          <p className="mt-1 text-xs font-bold">{status}</p>
          <AnimatePresence>
            {!end && d !== undefined && d !== 0 && (
              <motion.span
                key={`${key}-${turn}`}
                aria-hidden
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                className={clsx(
                  'absolute -top-2 -right-1 flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm font-black ring-2 ring-surface-strong',
                  d > 0 ? 'bg-field-500 text-black' : 'bg-risk-high text-black',
                )}
              >
                {d > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                {signed(d)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );

  if (end) {
    return (
      <div className="flex flex-col gap-3">
        <GameHeading title={t('endTitle')} task={t('endText')} />
        {bars}
        <PrimaryButton onClick={() => onFinish(mistakes.current)}>
          {t('finish')}
          <ArrowRight aria-hidden className="size-6" />
        </PrimaryButton>
      </div>
    );
  }

  const TurnIcon = TURN_ICONS[current.id];
  return (
    <div className="flex flex-col gap-3">
      <GameHeading title={t('title')} task={t('task')} />
      <div ref={topRef} className="flex scroll-mt-2 flex-col gap-3">
        <Steps steps={SEASON_TURNS.map((tr) => t(`turns.${tr.id}.when`))} current={turn} label={t('stepsLabel')} />
        {bars}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.id}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
          transition={{ duration: reduced ? 0.12 : 0.25 }}
          className="flex flex-col gap-2 rounded-3xl bg-white/5 p-3 ring-1 ring-line"
        >
          <h3 className="flex items-center gap-2.5 text-lg leading-tight font-bold">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sun/15 text-sun">
              <TurnIcon aria-hidden className="size-7" />
            </span>
            {t(`turns.${current.id}.title`)}
          </h3>
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-sky-glow uppercase">
            <Satellite aria-hidden className="size-4" />
            {t('alertsTitle')}
          </p>
          <ul className="flex flex-col gap-1.5">
            {current.focus.map((k) => {
              const Icon = GAUGE_ICONS[k];
              return (
                <li key={k} className="flex items-start gap-2 rounded-xl bg-black/20 p-2 text-sm">
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-sky-glow" />
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 rounded-md bg-sky-glow/15 px-1.5 py-0.5 text-xs font-bold ring-1 ring-sky-glow/40">{GAUGE_MISSION[k]}</span>
                    {alert(current, k)}
                  </span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      </AnimatePresence>

      <p className="flex items-center gap-2 text-lg font-bold text-sun">
        <Pointer aria-hidden className="size-5 shrink-0" />
        {t('question')}
      </p>
      <div className="flex flex-col gap-2">
        {current.options.map((o) => (
          <AnswerButton
            key={o.id}
            Icon={OPTION_ICONS[o.id]}
            onClick={() => choose(o)}
            disabled={chosen !== null}
            state={chosen?.id === o.id ? (o.best ? 'right' : 'wrong') : chosen && o.best ? 'right' : 'idle'}
          >
            {t(`turns.${current.id}.options.${o.id}`)}
          </AnswerButton>
        ))}
      </div>

      <div ref={resultRef} className="flex scroll-mb-28 flex-col gap-2">
        <Feedback message={msg} />
        {chosen && (
          <div aria-hidden className="flex justify-center gap-2">
            {(
              [
                { key: 'crop', d: chosen.crop, label: t('crop'), Icon: Sprout },
                { key: 'soil', d: chosen.soil, label: t('soil'), Icon: Shovel },
              ] as const
            ).map(({ key, d, label, Icon }) => (
              <span
                key={key}
                className={clsx(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ring-1',
                  d > 0 ? 'bg-field-500/20 ring-field-400' : d < 0 ? 'bg-risk-high/15 ring-risk-high' : 'bg-white/5 ring-line',
                )}
              >
                <Icon className="size-4" />
                {label}
                {d > 0 ? <ArrowUp className="size-4" /> : d < 0 ? <ArrowDown className="size-4" /> : null}
                <span className="tabular-nums">{signed(d)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {chosen && (
        <PrimaryButton onClick={next}>
          {last ? t('seeEnd') : t('nextTurn')}
          <ArrowRight aria-hidden className="size-6" />
        </PrimaryButton>
      )}
    </div>
  );
}
