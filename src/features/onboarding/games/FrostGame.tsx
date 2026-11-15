'use client';

import clsx from 'clsx';
import { ArrowDownToLine, Check, Cloud, Feather, Hourglass, Mountain, MoonStar, Shirt, Snowflake, Sprout, TriangleExclamationPoint, Wind } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useUnits } from '@/lib/units';
import { dawnTemp, FROST_BEST, FROST_OPTIONS, FROST_SCALE, FROST_START, frostRisk, type FrostNight } from './logic';
import { AnswerButton, buzz, Feedback, GameHeading, TwoWay, useLater, type GameProps, type Message } from './ui';

type Phase = 'find' | 'decide' | 'done';
const OPTION_ICONS = { wait: Hourglass, cover: Shirt, fertilize: Sprout } as const;
const STARS = [
  [30, 18],
  [70, 30],
  [118, 14],
  [160, 36],
  [205, 20],
  [300, 46],
  [96, 52],
  [228, 50],
];

/**
 * Reto 5 · La noche más fría (riesgo de helada). Mueve cielo, viento y lugar hasta que amanezca bajo cero: noche
 * despejada (el calor del suelo se escapa), en calma (el frío se asienta) y en la hondonada (el aire frío baja).
 * Después decide cómo proteger el frijol. El termómetro muestra número, palabra e ícono (no solo color).
 */
export default function FrostGame({ say, onFinish }: GameProps) {
  const t = useTranslations('onboarding.games.frost');
  const units = useUnits();
  const later = useLater();
  const [phase, setPhase] = useState<Phase>('find');
  const [night, setNight] = useState<FrostNight>(FROST_START);
  const [tried, setTried] = useState<string[]>([]);
  const [msg, setMsg] = useState<Message>(null);
  const mistakes = useRef(0);
  const temp = dawnTemp(night);
  const risk = frostRisk(temp);
  const fill = ((temp - FROST_SCALE.min) / (FROST_SCALE.max - FROST_SCALE.min)) * 100;
  const zero = ((0 - FROST_SCALE.min) / (FROST_SCALE.max - FROST_SCALE.min)) * 100;

  useEffect(() => say(`${t('title')}. ${t('taskFind')}`), [say, t]);

  const tell = (m: NonNullable<Message>) => {
    setMsg(m);
    say(m.text);
  };

  const change = (next: FrostNight, factor: string) => {
    if (phase !== 'find') return;
    setNight(next);
    if (frostRisk(dawnTemp(next)) === 'frost') {
      buzz('ok');
      setPhase('decide');
      tell({ tone: 'ok', text: t('found') });
      later(() => say(t('question')), 2600);
    } else tell({ tone: 'info', text: t(`why.${factor}`) });
  };

  const decide = (o: (typeof FROST_OPTIONS)[number]) => {
    if (phase !== 'decide' || tried.includes(o)) return;
    setTried([...tried, o]);
    if (o === FROST_BEST) {
      buzz('ok');
      setPhase('done');
      tell({ tone: 'ok', text: t(`feedback.${o}`) });
      later(() => onFinish(mistakes.current), 2000);
    } else {
      mistakes.current += 1;
      buzz('bad');
      tell({ tone: 'bad', text: t(`feedback.${o}`) });
    }
  };

  const plant = night.hollow ? { x: 70, y: 140 } : { x: 246, y: 86 };
  const frozen = risk === 'frost' || phase !== 'find';
  const RiskIcon = risk === 'frost' ? Snowflake : risk === 'high' ? TriangleExclamationPoint : Check;

  return (
    <div className="flex flex-col gap-3">
      <GameHeading title={t('title')} task={phase === 'find' ? t('taskFind') : t('question')} />

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-3xl ring-1 ring-line">
          <svg viewBox="0 0 320 170" className="block w-full" role="img" aria-label={t('scene', { temp: units.temp(temp), risk: t(`risk.${risk}`) })}>
            <rect width="320" height="170" fill="#0b1530" />
            {night.clear && STARS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill="#fff" className="fsq-twinkle" style={{ animationDelay: `${i * 0.3}s` }} />)}
            <circle cx="262" cy="28" r="12" fill="#f4f1de" />
            {!night.clear && (
              <g fill="#566480">
                <path d="M20 46a18 18 0 0 1 34-10 14 14 0 0 1 26 8 12 12 0 0 1-2 24H26a12 12 0 0 1-6-22z" />
                <path d="M150 34a18 18 0 0 1 34-10 14 14 0 0 1 26 8 12 12 0 0 1-2 24h-52a12 12 0 0 1-6-22z" />
                <path d="M232 40a16 16 0 0 1 30-8 12 12 0 0 1 22 8 10 10 0 0 1-2 20h-44a10 10 0 0 1-6-20z" />
              </g>
            )}
            {!night.calm &&
              [78, 96].map((y, i) => (
                <path key={y} d={`M${150 + i * 20} ${y} q30 -8 60 0 t60 0`} className="fsq-wind" fill="none" stroke="#cfe0ff" strokeOpacity=".5" strokeWidth="2.5" strokeLinecap="round" />
              ))}
            <path d="M0 108 Q 70 172 140 128 T 320 62 L320 170 L0 170 Z" fill="#1f3a2a" />
            {night.calm && night.clear && <ellipse cx="72" cy="146" rx="72" ry="16" fill="#9fd4ff" opacity=".35" />}
            <g style={{ transform: `translate(${plant.x}px, ${plant.y}px)`, transition: 'transform .6s ease' }}>
              <line x1="0" y1="0" x2="0" y2="-26" stroke={frozen ? '#cfe8ff' : '#3fcf78'} strokeWidth="3.5" strokeLinecap="round" />
              <ellipse cx="-9" cy="-14" rx="9" ry="4.5" transform="rotate(-25 -9 -14)" fill={frozen ? '#e6f3ff' : '#3fcf78'} />
              <ellipse cx="9" cy="-20" rx="9" ry="4.5" transform="rotate(25 9 -20)" fill={frozen ? '#e6f3ff' : '#6ee39a'} />
              {frozen &&
                [
                  [-16, -30],
                  [14, -36],
                  [18, -8],
                ].map(([x, y], i) => (
                  <text key={i} x={x} y={y} fontSize="12" fill="#ffffff" textAnchor="middle">
                    ✱
                  </text>
                ))}
            </g>
          </svg>
        </div>

        <div className="flex w-[4.5rem] shrink-0 flex-col items-center gap-0.5">
          <div aria-hidden className="relative h-20 w-5 overflow-hidden rounded-full bg-white/10 ring-1 ring-line">
            <div
              className={clsx(
                'absolute inset-x-0 bottom-0 rounded-full transition-[height,background-color] duration-500',
                risk === 'frost' ? 'bg-sky-glow' : risk === 'high' ? 'bg-risk-medium' : 'bg-risk-low',
              )}
              style={{ height: `${fill}%` }}
            />
            <div className="absolute inset-x-0 border-t-2 border-white" style={{ bottom: `${zero}%` }} />
          </div>
          <p className="text-center text-xs leading-tight text-ink-muted">{t('dawn')}</p>
          <p aria-live="polite" className="text-center text-base leading-tight font-bold tabular-nums">
            {units.temp(temp)}
          </p>
          <p className="flex items-center gap-0.5 text-center text-xs leading-tight font-bold">
            <RiskIcon aria-hidden className="size-3.5 shrink-0" />
            {t(`risk.${risk}`)}
          </p>
        </div>
      </div>

      {phase === 'find' ? (
        <div className="flex flex-col gap-1.5">
          <TwoWay
            name="frost-sky"
            legend={t('sky')}
            value={night.clear ? 'clear' : 'cloudy'}
            onChange={(v) => change({ ...night, clear: v === 'clear' }, v)}
            options={[
              { value: 'cloudy', label: t('cloudy'), Icon: Cloud },
              { value: 'clear', label: t('clear'), Icon: MoonStar },
            ]}
          />
          <TwoWay
            name="frost-wind"
            legend={t('wind')}
            value={night.calm ? 'calm' : 'windy'}
            onChange={(v) => change({ ...night, calm: v === 'calm' }, v)}
            options={[
              { value: 'windy', label: t('windy'), Icon: Wind },
              { value: 'calm', label: t('calm'), Icon: Feather },
            ]}
          />
          <TwoWay
            name="frost-place"
            legend={t('place')}
            value={night.hollow ? 'hollow' : 'slope'}
            onChange={(v) => change({ ...night, hollow: v === 'hollow' }, v)}
            options={[
              { value: 'slope', label: t('slope'), Icon: Mountain },
              { value: 'hollow', label: t('hollow'), Icon: ArrowDownToLine },
            ]}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {FROST_OPTIONS.map((o) => (
            <AnswerButton
              key={o}
              Icon={OPTION_ICONS[o]}
              onClick={() => decide(o)}
              disabled={phase === 'done'}
              state={tried.includes(o) ? (o === FROST_BEST ? 'right' : 'wrong') : 'idle'}
            >
              {t(`options.${o}`)}
            </AnswerButton>
          ))}
        </div>
      )}

      <Feedback message={msg} />
    </div>
  );
}
