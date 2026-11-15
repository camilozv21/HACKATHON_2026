'use client';

import clsx from 'clsx';
import { Check, CloudRain, Droplets, Minus, Plus, Sprout, Sun } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useUnits } from '@/lib/units';
import {
  BALANCE_ROUNDS,
  balanceVerdict,
  COVER_SAVING,
  IRRIGATION_MAX,
  IRRIGATION_STEP,
  TANK_BAND,
  tankLevel,
  waterBalance,
} from './logic';
import { buzz, Feedback, GameHeading, PrimaryButton, useLater, type GameProps, type Message } from './ui';

/**
 * Reto 3 · La cuenta del agua (balance hídrico). Un tanque de suelo: entra lluvia (GPM) y riego, sale la
 * evapotranspiración. Dos meses: en el seco hay que regar (o regar menos cubriendo el suelo); en el de lluvias la
 * costumbre de regar encharca y la respuesta es no regar. Enseña: balance = entra − sale, y que demasiada agua
 * también daña (raíces ahogadas, tierra lavada).
 */
export default function BalanceGame({ detail, say, onFinish }: GameProps) {
  const t = useTranslations('onboarding.games.balance');
  const format = useFormatter();
  const units = useUnits();
  const later = useLater();
  const [round, setRound] = useState(0);
  const r = BALANCE_ROUNDS[round]!;
  const [irrigation, setIrrigation] = useState(r.irrigation);
  const [covered, setCovered] = useState(false);
  const [solved, setSolved] = useState(false);
  const [msg, setMsg] = useState<Message>(null);
  const mistakes = useRef(0);
  const b = waterBalance(r, irrigation, covered);
  const verdict = balanceVerdict(b);
  const level = tankLevel(b);
  const water = (mm: number) => `${format.number(units.rainValue(mm), { maximumFractionDigits: units.units === 'imperial' ? 1 : 0 })} ${units.rainUnit}`;
  const signed = (mm: number) => `${mm > 0 ? '+' : mm < 0 ? '−' : ''}${water(Math.abs(mm))}`;

  useEffect(() => say(`${t('title')}. ${t('task')}`), [say, t]);

  const tell = (m: NonNullable<Message>) => {
    setMsg(m);
    say(m.text);
  };

  const check = () => {
    if (solved) return;
    if (verdict === 'ok') {
      buzz('ok');
      setSolved(true);
      tell({ tone: 'ok', text: t('okRound') });
      later(() => {
        if (round === BALANCE_ROUNDS.length - 1) return onFinish(mistakes.current);
        const next = BALANCE_ROUNDS[round + 1]!;
        setRound(round + 1);
        setIrrigation(next.irrigation);
        setCovered(false);
        setSolved(false);
        tell({ tone: 'info', text: t(`rounds.${next.id}.intro`) });
      }, 1800);
    } else {
      mistakes.current += 1;
      buzz('bad');
      tell({ tone: 'bad', text: t(verdict === 'dry' ? 'dryHint' : 'wetHint') });
    }
  };

  const step = (d: number) => {
    setIrrigation((v) => Math.min(IRRIGATION_MAX, Math.max(0, v + d)));
    setMsg(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <GameHeading
        title={t('title')}
        task={t('task')}
        kicker={
          <p className="text-xs font-semibold tracking-wider text-sky-glow uppercase">
            {t('round', { n: round + 1, total: BALANCE_ROUNDS.length, name: t(`rounds.${r.id}.name`) })}
          </p>
        }
      />

      <div className="flex gap-3">
        <div
          role="img"
          aria-label={t('tank', { state: t(`zone.${verdict}`) })}
          className="relative h-56 w-24 shrink-0 overflow-hidden rounded-3xl bg-[#3b2a1a] ring-1 ring-line"
        >
          <div className="absolute inset-x-0 bottom-0 bg-sky-glow/75 transition-[height] duration-700 ease-out" style={{ height: `${level}%` }}>
            <div className="h-1.5 bg-white/60" />
          </div>
          <div
            className="absolute inset-x-0 border-y-2 border-dashed border-field-300 bg-field-500/20"
            style={{ bottom: `${TANK_BAND.min}%`, height: `${TANK_BAND.max - TANK_BAND.min}%` }}
          />
          <span aria-hidden className="absolute inset-x-1 top-1.5 rounded-full bg-black/60 text-center text-[11px] font-bold text-white">
            {t('zone.wet')}
          </span>
          <span
            aria-hidden
            className="absolute inset-x-1 -translate-y-1/2 rounded-full bg-black/60 text-center text-[11px] font-bold text-field-300"
            style={{ bottom: `${(TANK_BAND.min + TANK_BAND.max) / 2 - 4}%` }}
          >
            {t('zone.ok')}
          </span>
          <span aria-hidden className="absolute inset-x-1 bottom-1.5 rounded-full bg-black/60 text-center text-[11px] font-bold text-white">
            {t('zone.dry')}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
          <div className="rounded-2xl bg-white/5 p-2 ring-1 ring-line">
            <p className="text-xs font-bold tracking-wider text-field-300 uppercase">{t('in')}</p>
            <p className="mt-1 flex items-center gap-1.5">
              <CloudRain aria-hidden className="size-4 shrink-0 text-sky-glow" />
              <span className="flex-1">{t('rain')}</span>
              <b className="tabular-nums">{water(r.rain)}</b>
            </p>
            <div className="mt-1 flex items-center gap-1">
              <Droplets aria-hidden className="size-4 shrink-0 text-sky-glow" />
              <span className="flex-1">{t('irrigation')}</span>
              <button
                type="button"
                onClick={() => step(-IRRIGATION_STEP)}
                disabled={solved || irrigation <= 0}
                aria-label={t('less')}
                className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-line disabled:opacity-40"
              >
                <Minus aria-hidden className="size-5" />
              </button>
              <b aria-live="polite" className="min-w-14 text-center whitespace-nowrap tabular-nums">
                {water(irrigation)}
              </b>
              <button
                type="button"
                onClick={() => step(IRRIGATION_STEP)}
                disabled={solved || irrigation >= IRRIGATION_MAX}
                aria-label={t('more')}
                className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-line disabled:opacity-40"
              >
                <Plus aria-hidden className="size-5" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 p-2 ring-1 ring-line">
            <p className="text-xs font-bold tracking-wider text-sun uppercase">{t('out')}</p>
            <p className="mt-1 flex items-center gap-1.5">
              <Sun aria-hidden className="size-4 shrink-0 text-sun" />
              <span className="flex-1">{t('et')}</span>
              <b className="tabular-nums">{water(r.out - (covered ? COVER_SAVING : 0))}</b>
            </p>
            {r.cover && (
              <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-field-300">
                <input
                  type="checkbox"
                  checked={covered}
                  disabled={solved}
                  onChange={(e) => {
                    setCovered(e.target.checked);
                    setMsg(null);
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={clsx(
                    'grid size-6 shrink-0 place-items-center rounded-md ring-2',
                    covered ? 'bg-field-500 text-black ring-field-500' : 'ring-line-strong',
                  )}
                >
                  {covered && <Check className="size-4" />}
                </span>
                <Sprout aria-hidden className="size-4 shrink-0 text-field-300" />
                <span className="flex-1 leading-tight">{t('cover', { amount: water(COVER_SAVING) })}</span>
              </label>
            )}
          </div>

          <p
            className={clsx(
              'rounded-2xl p-2 font-bold ring-1',
              verdict === 'ok' ? 'bg-field-500/15 ring-field-400' : 'bg-risk-medium/10 ring-risk-medium/60',
            )}
          >
            {t('result')}: <span className="tabular-nums">{signed(b)}</span>
            <span className="block text-xs font-semibold text-ink-muted">{t(`verdict.${verdict}`)}</span>
          </p>
        </div>
      </div>

      {detail && <p className="text-xs text-ink-muted">{t('formula')}</p>}
      <Feedback message={msg} />
      <PrimaryButton onClick={check} disabled={solved}>
        <Check aria-hidden className="size-6" />
        {t('check')}
      </PrimaryButton>
    </div>
  );
}
