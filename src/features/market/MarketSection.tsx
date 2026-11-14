'use client';

import clsx from 'clsx';
import { Activity, Banknote, Bot, Calculator, Clock, Minus, Sprout, Store, Truck, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { GlossaryLink } from '@/features/glossary/GlossaryLink';
import { ConfidenceChip } from '@/features/rotations/parts';
import type { MarketCrop, StrategyMarket } from '@/lib/api/contract';
import { formatCop, formatCopShort, formatMonth, formatNumber, formatPct } from './format';

const TREND_ICON: Record<'up' | 'flat' | 'down', LucideIcon> = { up: TrendingUp, flat: Minus, down: TrendingDown };

export const OUTLOOK_STYLE: Record<'favorable' | 'neutral' | 'unfavorable', { icon: LucideIcon; className: string }> = {
  favorable: { icon: TrendingUp, className: 'bg-field-500/15 text-field-300 ring-field-500/40' },
  neutral: { icon: Minus, className: 'bg-white/10 text-ink ring-line' },
  unfavorable: { icon: TrendingDown, className: 'bg-risk-medium/15 text-risk-medium ring-risk-medium/40' },
};

/** Etiqueta de la conclusión (ícono + texto: no depende solo del color). */
export function OutlookBadge({ label }: { label: 'favorable' | 'neutral' | 'unfavorable' }) {
  const t = useTranslations('market.outlook');
  const { icon: Icon, className } = OUTLOOK_STYLE[label];
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1', className)}>
      <Icon aria-hidden className="size-3.5" />
      {t(label)}
    </span>
  );
}

/** Quién redactó la conclusión: IA (con aviso) o reglas. */
export function OutlookSource({ by }: { by: 'claude' | 'rules' }) {
  const t = useTranslations('market');
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-glow/10 px-2 py-0.5 text-[11px] font-semibold text-sky-glow" title={by === 'claude' ? t('aiNote') : t('rulesNote')}>
      {by === 'claude' ? <Bot aria-hidden className="size-3" /> : <Calculator aria-hidden className="size-3" />}
      {by === 'claude' ? t('aiBadge') : t('rulesBadge')}
    </span>
  );
}

function Line({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-field-300" />
      <span>{children}</span>
    </li>
  );
}

function CropMarket({ c }: { c: MarketCrop }) {
  const t = useTranslations('market');
  const tp = useTranslations('products');
  const locale = useLocale();
  const name = tp(c.product as 'cafe');
  const TrendIcon = c.change12mPct === null ? null : TREND_ICON[c.change12mPct >= 10 ? 'up' : c.change12mPct <= -10 ? 'down' : 'flat'];
  return (
    <li className="rounded-xl bg-black/20 p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-semibold">{name}</p>
        {c.outlook && <OutlookBadge label={c.outlook.label} />}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {c.priceCopKg !== null && c.market ? (
          <Line icon={Store}>
            {t('priceAt', { price: formatCop(c.priceCopKg, locale), market: c.market })}
            {c.distanceKm !== null && <span className="text-ink-muted"> · {t('distance', { km: c.distanceKm })}</span>}
            <span className="block text-xs text-ink-muted">
              <GlossaryLink term="wholesale-price" /> · {t('median')}
            </span>
          </Line>
        ) : (
          <Line icon={Store}>
            <span className="text-ink-muted">{t('noPrice')}</span>
          </Line>
        )}
        {TrendIcon && c.change12mPct !== null && (
          <Line icon={TrendIcon}>
            {t(`trend.${c.change12mPct >= 10 ? 'up' : c.change12mPct <= -10 ? 'down' : 'flat'}`)} ({t('trendPct', { pct: formatPct(c.change12mPct, locale) })})
          </Line>
        )}
        {c.volatility && (
          <Line icon={Activity}>
            {t(`volatility.${c.volatility}`)}
            <span className="block text-xs text-ink-muted">
              <GlossaryLink term="price-volatility" />
            </span>
          </Line>
        )}
        {c.supplyTrend && <Line icon={Truck}>{t(`supply.${c.supplyTrend}`)}</Line>}
        {c.yieldTHa !== null && (
          <Line icon={Sprout}>{t(c.yieldScope === 'dept' ? 'yieldDept' : 'yieldNational', { value: formatNumber(c.yieldTHa, locale) })}</Line>
        )}
        {c.revenueCopHa !== null && (
          <Line icon={Banknote}>
            {t('revenue', { value: formatCopShort(c.revenueCopHa, locale) })} <GlossaryLink term="gross-income" />
          </Line>
        )}
        {c.monthsToFirstHarvest !== null && <Line icon={Clock}>{t('firstHarvest', { months: c.monthsToFirstHarvest })}</Line>}
        {c.credit && c.credit.n > 0 && (
          <Line icon={Banknote}>{t('credit', { count: c.credit.n, chain: c.credit.chain, small: c.credit.small })}</Line>
        )}
      </ul>
      {c.outlook && (
        <div className="mt-2 rounded-lg bg-white/5 p-2.5">
          <OutlookSource by={c.outlook.by} />
          <p className="mt-1">{c.outlook.why}</p>
        </div>
      )}
      {c.factor !== 1 && <p className="mt-2 text-xs text-ink-muted lite:hidden">{t('factor', { factor: formatNumber(c.factor, locale, 2) })}</p>}
    </li>
  );
}

/** Bloque "Mercado" de una estrategia: precio mayorista, tendencia, oferta, rendimiento, crédito y conclusión. */
export function MarketSection({ market }: { market: StrategyMarket }) {
  const t = useTranslations('market');
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">{t('hint')}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <ConfidenceChip confidence={market.confidence} />
      </div>
      <ul className="flex flex-col gap-2">
        {market.crops.map((c) => (
          <CropMarket key={c.crop} c={c} />
        ))}
      </ul>
      {market.risks.length > 0 && (
        <div className="rounded-xl bg-risk-medium/10 p-3 ring-1 ring-risk-medium/40">
          <p className="mb-1 font-semibold">{t('risks')}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
            {market.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {market.gaps.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">{t('gaps')}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-muted marker:text-ink-faint">
            {market.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-ink-faint">{t('sources', { month: formatMonth(market.asOf.slice(0, 7), locale) })}</p>
    </div>
  );
}
