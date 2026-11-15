'use client';

import clsx from 'clsx';
import { ArrowRight, Feather, Layers, Mountain, Sun, SunDim, Wind } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useUnits } from '@/lib/units';
import { ET_COVER_SAVING, ET_MAX, ET_START, etPerDay, type EtWeather } from './logic';
import { buzz, Feedback, GameHeading, PrimaryButton, TwoWay, useLater, type GameProps, type Message } from './ui';

type Phase = 'sources' | 'max' | 'protect' | 'done';
type Spot = 'soil' | 'leaves' | 'cloud';
const SPOTS: { id: Spot; left: string; top: string }[] = [
  { id: 'cloud', left: '22%', top: '20%' },
  { id: 'leaves', left: '53%', top: '50%' },
  { id: 'soil', left: '40%', top: '84%' },
];
const PLANTS = [110, 170, 230];

/**
 * Reto 2 · El campo suda (evapotranspiración). Primero encuentra de dónde sale el vapor (suelo = evaporación,
 * hojas = transpiración; la nube es la trampa). Luego mueve sol, viento y suelo para que el campo pierda lo
 * máximo, y al final, con sol y viento fijos, descubre lo único que sí controla: cubrir el suelo.
 */
export default function EtGame({ reduced, say, onFinish }: GameProps) {
  const t = useTranslations('onboarding.games.et');
  const format = useFormatter();
  const units = useUnits();
  const later = useLater();
  const [phase, setPhaseState] = useState<Phase>('sources');
  const phaseRef = useRef<Phase>('sources');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [spots, setSpots] = useState<Spot[]>([]);
  const [wrongSpot, setWrongSpot] = useState(false);
  const [w, setW] = useState<EtWeather>(ET_START);
  const [msg, setMsg] = useState<Message>(null);
  const mistakes = useRef(0);
  const et = etPerDay(w);
  const water = (mm: number) => `${format.number(units.rainValue(mm), { maximumFractionDigits: 1 })} ${units.rainUnit}`;
  const sourcesDone = spots.includes('soil') && spots.includes('leaves');

  useEffect(() => say(`${t('title')}. ${t('taskSources')}`), [say, t]);

  const tell = (m: NonNullable<Message>) => {
    setMsg(m);
    say(m.text);
  };

  const touch = (s: Spot) => {
    if (phase !== 'sources' || spots.includes(s)) return;
    if (s === 'cloud') {
      mistakes.current += 1;
      buzz('bad');
      setWrongSpot(true);
      later(() => setWrongSpot(false), 750);
      return tell({ tone: 'bad', text: t('cloudWrong') });
    }
    const next = [...spots, s];
    setSpots(next);
    buzz('ok');
    const both = next.includes('soil') && next.includes('leaves');
    tell({ tone: 'ok', text: both ? `${t(`${s}Found`)} ${t('sourcesDone')}` : t(`${s}Found`) });
  };

  const toMax = () => {
    setPhase('max');
    setMsg(null);
    say(t('taskMax'));
  };

  const change = (next: EtWeather) => {
    setW(next);
    if (phase === 'max' && etPerDay(next) === ET_MAX) {
      buzz('ok');
      setPhase('protect');
      tell({ tone: 'ok', text: t('maxDone', { amount: water(ET_MAX) }) });
      later(() => phaseRef.current === 'protect' && tell({ tone: 'info', text: t('taskProtect') }), 2600);
    } else if (phase === 'protect' && !next.bare) {
      buzz('ok');
      setPhase('done');
      tell({ tone: 'ok', text: t('protectDone', { amount: water(ET_COVER_SAVING) }) });
      later(() => onFinish(mistakes.current), 2200);
    }
  };

  const vapor = (x: number, y: number, k: number) => (
    <g key={`${x}-${y}-${k}`} transform={`translate(${x} ${y})`}>
      <path
        d="M0 0 q4 -5 0 -10 q-4 -5 0 -10"
        className={reduced ? undefined : 'fsq-rise'}
        style={{ animationDelay: `${k * 0.55}s`, animationDuration: w.wind ? '1.3s' : '2.2s' }}
        fill="none"
        stroke="#d6ecff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </g>
  );
  const soilVapor = phase === 'sources' ? 2 : w.bare ? 4 : 1;
  const leafVapor = phase === 'sources' ? 2 : w.sun ? 3 : 1;

  return (
    <div className="flex flex-col gap-3">
      <GameHeading title={t('title')} task={phase === 'sources' ? t('taskSources') : phase === 'max' ? t('taskMax') : t('taskProtect')} />

      <div className="relative overflow-hidden rounded-3xl ring-1 ring-line">
        <svg viewBox="0 0 320 170" className="block w-full" role="img" aria-label={t('scene', { amount: water(et) })}>
          <rect width="320" height="122" style={{ fill: w.sun ? '#6b4a1c' : '#173b5e', transition: 'fill .6s' }} />
          <circle cx="272" cy="34" r={w.sun ? 24 : 14} fill="#ffd166" style={{ transition: 'r .5s' }} />
          {w.sun &&
            Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4;
              return (
                <line
                  key={i}
                  x1={272 + Math.cos(a) * 30}
                  y1={34 + Math.sin(a) * 30}
                  x2={272 + Math.cos(a) * 40}
                  y2={34 + Math.sin(a) * 40}
                  stroke="#ffd166"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              );
            })}
          <path d="M44 42a14 14 0 0 1 26-8 11 11 0 0 1 20 6 10 10 0 0 1-2 20H48a10 10 0 0 1-4-18z" fill="#e8eef7" opacity=".9" />
          {w.wind &&
            [56, 72, 88].map((y, i) => (
              <path
                key={y}
                d={`M${8 + i * 12} ${y} q30 -8 60 0 t60 0`}
                className={reduced ? undefined : 'fsq-wind'}
                fill="none"
                stroke="#ffffff"
                strokeOpacity=".55"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            ))}
          <rect y="120" width="320" height="50" fill="#5a3b22" />
          {!w.bare &&
            Array.from({ length: 26 }, (_, i) => (
              <line key={i} x1={6 + i * 12} y1={i % 2 ? 121 : 125} x2={16 + i * 12} y2={i % 2 ? 125 : 120} stroke="#d9b45a" strokeWidth="3" strokeLinecap="round" />
            ))}
          {PLANTS.map((x) => (
            <g key={x}>
              <line x1={x} y1="120" x2={x} y2="74" stroke="#2f9e5b" strokeWidth="4" strokeLinecap="round" />
              <ellipse cx={x - 12} cy="92" rx="13" ry="6" transform={`rotate(-28 ${x - 12} 92)`} fill="#3fcf78" />
              <ellipse cx={x + 12} cy="84" rx="13" ry="6" transform={`rotate(28 ${x + 12} 84)`} fill="#3fcf78" />
              <ellipse cx={x} cy="70" rx="6" ry="10" fill="#6ee39a" />
            </g>
          ))}
          {Array.from({ length: soilVapor }, (_, k) => vapor(140 + k * 30, 116, k))}
          {PLANTS.flatMap((x, j) => Array.from({ length: leafVapor }, (_, k) => vapor(x + (k - 1) * 12, 64, j + k)))}
        </svg>

        {phase === 'sources' &&
          SPOTS.map(({ id, left, top }) => {
            const hit = spots.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => touch(id)}
                aria-pressed={hit}
                aria-label={t(`spots.${id}`)}
                style={{ left, top }}
                className={clsx(
                  'absolute grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2',
                  hit ? 'bg-field-500 text-black ring-white' : 'bg-white/15 ring-white/90 backdrop-blur-[1px]',
                  id === 'cloud' && wrongSpot && 'fsq-shake bg-risk-high/60',
                )}
              >
                {!hit && <span aria-hidden className="fsq-ping absolute inset-0 rounded-full ring-2 ring-white" />}
                <span aria-hidden className="text-lg font-black">{hit ? '✓' : '?'}</span>
              </button>
            );
          })}
        {spots.includes('soil') && (
          <span aria-hidden className="absolute right-2 bottom-2 rounded-full bg-[#5a3b22] px-2 py-0.5 text-xs font-bold text-white ring-1 ring-white/60">
            {t('equation.evaporation')}
          </span>
        )}
        {spots.includes('leaves') && (
          <span aria-hidden className="absolute top-[16%] left-[60%] rounded-full bg-field-600 px-2 py-0.5 text-xs font-bold text-black ring-1 ring-white/60">
            {t('equation.transpiration')}
          </span>
        )}
      </div>

      {phase === 'sources' && sourcesDone && (
        <motion.p
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-center gap-1.5 text-sm font-bold"
        >
          <span className="rounded-full bg-[#5a3b22] px-2.5 py-1 text-white">{t('equation.evaporation')}</span>+
          <span className="rounded-full bg-field-600 px-2.5 py-1 text-black">{t('equation.transpiration')}</span>=
          <span className="rounded-full bg-sky-glow px-2.5 py-1 text-black">{t('equation.et')}</span>
        </motion.p>
      )}

      {phase !== 'sources' && (
        <>
          <div>
            <p className="text-sm font-semibold">{t('meter', { amount: water(et) })}</p>
            <div aria-hidden className="mt-1 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-sky-glow transition-[width] duration-500" style={{ width: `${(et / ET_MAX) * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <TwoWay
              name="et-sun"
              legend={t('sun')}
              value={w.sun ? 'strong' : 'soft'}
              onChange={(v) => change({ ...w, sun: v === 'strong' })}
              options={[
                { value: 'soft', label: t('sunSoft'), Icon: SunDim },
                { value: 'strong', label: t('sunStrong'), Icon: Sun },
              ]}
              locked={phase !== 'max'}
              lockedLabel={t('locked')}
            />
            <TwoWay
              name="et-wind"
              legend={t('wind')}
              value={w.wind ? 'strong' : 'calm'}
              onChange={(v) => change({ ...w, wind: v === 'strong' })}
              options={[
                { value: 'calm', label: t('windCalm'), Icon: Feather },
                { value: 'strong', label: t('windStrong'), Icon: Wind },
              ]}
              locked={phase !== 'max'}
              lockedLabel={t('locked')}
            />
            <TwoWay
              name="et-soil"
              legend={t('soil')}
              value={w.bare ? 'bare' : 'covered'}
              onChange={(v) => change({ ...w, bare: v === 'bare' })}
              options={[
                { value: 'bare', label: t('soilBare'), Icon: Mountain },
                { value: 'covered', label: t('soilCovered'), Icon: Layers },
              ]}
              locked={phase === 'done'}
              lockedLabel={t('locked')}
            />
          </div>
        </>
      )}

      <Feedback message={msg} />

      {phase === 'sources' && sourcesDone && (
        <PrimaryButton onClick={toMax}>
          {t('continue')}
          <ArrowRight aria-hidden className="size-6" />
        </PrimaryButton>
      )}
    </div>
  );
}
