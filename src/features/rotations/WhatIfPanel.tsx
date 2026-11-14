'use client';

import { ChevronDown, CloudRain, FlaskConical, RotateCcw, Thermometer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useUnits } from '@/lib/units';
import { useRotationsStore } from './store';
import { isNeutral, RAIN_RANGE, TEMP_RANGE } from './whatIf';

/** "¿Y si cambia el clima?": lluvia −30…+30 % y temperatura +0…+3 °C. Siempre marcado como estimación. */
export function WhatIfPanel() {
  const t = useTranslations('rotations.whatIf');
  const scenario = useRotationsStore((s) => s.scenario);
  const setScenario = useRotationsStore((s) => s.setScenario);
  const uid = useId();
  const active = !isNeutral(scenario);
  const rainLabel = `${scenario.rainPct > 0 ? '+' : scenario.rainPct < 0 ? '−' : ''}${Math.abs(scenario.rainPct)} %`;
  const u = useUnits();
  const tempLabel = `+${u.tempDelta(scenario.tempC)}`;

  return (
    <details open={active} className="group rounded-2xl bg-white/5 ring-1 ring-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
        <FlaskConical aria-hidden className="size-5 text-sun" />
        <span className="flex-1">{t('title')}</span>
        {active && (
          <span className="rounded-full bg-sun/20 px-2 py-0.5 text-xs font-bold text-sun">{t('estimate')}</span>
        )}
        <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 px-3 pb-3">
        <p className="text-xs text-ink-muted">{t('hint')}</p>

        <div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <label htmlFor={`${uid}-rain`} className="flex items-center gap-1.5 font-semibold">
              <CloudRain aria-hidden className="size-4 text-sky-glow" />
              {t('rain')}
            </label>
            <output htmlFor={`${uid}-rain`} className="font-bold tabular-nums">
              {rainLabel}
            </output>
          </div>
          <input
            id={`${uid}-rain`}
            type="range"
            min={RAIN_RANGE.min}
            max={RAIN_RANGE.max}
            step={RAIN_RANGE.step}
            value={scenario.rainPct}
            aria-valuetext={t('rainValue', { n: scenario.rainPct })}
            onChange={(e) => setScenario({ rainPct: Number(e.target.value) })}
            className="h-11 w-full cursor-pointer accent-sky-glow"
          />
          <div aria-hidden className="flex justify-between text-[11px] text-ink-faint">
            <span>{t('drier')}</span>
            <span>{t('wetter')}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <label htmlFor={`${uid}-temp`} className="flex items-center gap-1.5 font-semibold">
              <Thermometer aria-hidden className="size-4 text-risk-high" />
              {t('temp')}
            </label>
            <output htmlFor={`${uid}-temp`} className="font-bold tabular-nums">
              {tempLabel}
            </output>
          </div>
          <input
            id={`${uid}-temp`}
            type="range"
            min={TEMP_RANGE.min}
            max={TEMP_RANGE.max}
            step={TEMP_RANGE.step}
            value={scenario.tempC}
            aria-valuetext={t('tempValue', { n: scenario.tempC })}
            onChange={(e) => setScenario({ tempC: Number(e.target.value) })}
            className="h-11 w-full cursor-pointer accent-risk-high"
          />
          <div aria-hidden className="flex justify-between text-[11px] text-ink-faint">
            <span>{t('asToday')}</span>
            <span>{t('hotter')}</span>
          </div>
        </div>

        {active && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-xs text-sun" role="status">
              {t('activeNote')}
            </p>
            <button
              type="button"
              onClick={() => setScenario({ rainPct: 0, tempC: 0 })}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/15"
            >
              <RotateCcw aria-hidden className="size-4" />
              {t('reset')}
            </button>
          </div>
        )}
        <p className="text-[11px] text-ink-faint">{t('rules')}</p>
      </div>
    </details>
  );
}
