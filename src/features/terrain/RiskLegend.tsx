'use client';

import clsx from 'clsx';
import { Loader2, MapPin, Mountain, ShieldAlert, Shovel, Sun, Thermometer, Waves, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fitBounds } from '@/features/globe/camera';
import { useGlobeStore } from '@/features/globe/store';
import { CO_BBOX } from '@/features/region/admin';
import { inBBox } from '@/lib/bbox';
import { RISK_KINDS, RISK_MAP_COLOR, type RiskKind } from './kinds';
import { useRiskStore } from './store';

export const RISK_ICON: Record<RiskKind, LucideIcon> = {
  all: ShieldAlert,
  drought: Sun,
  water: Waves,
  heat: Thermometer,
  soil: Shovel,
};

/** Muestra de un nivel: color del mapa + el mismo patrón que en el mapa (rayado = alto, puntos = medio). */
export function LevelSwatch({ level, className }: { level: 'low' | 'medium' | 'high' | 'none'; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-block shrink-0 rounded-sm text-black/55 ring-1 ring-white/30',
        level === 'high' && 'pattern-hatch',
        level === 'medium' && 'pattern-dots',
        className ?? 'size-4',
      )}
      style={{ backgroundColor: RISK_MAP_COLOR[level] }}
    />
  );
}

/** ¿Colombia está a la vista? Con el globo lejos se ve aunque la mira no caiga dentro. */
function useColombiaInView() {
  return useGlobeStore((s) => {
    const { lng, lat, zoom } = s.center;
    const pad = zoom < 3 ? 25 : zoom < 5 ? 8 : 1;
    const [w, so, e, n] = CO_BBOX;
    return inBBox([w - pad, so - pad, e + pad, n + pad], lng, lat);
  });
}

/** Leyenda de "Zonas de riesgo" dentro de la barra de capa: qué riesgo se pinta, niveles, relieve y avisos. */
export default function RiskLegend() {
  const t = useTranslations('terrain');
  const kind = useRiskStore((s) => s.kind);
  const relief = useRiskStore((s) => s.relief);
  const status = useRiskStore((s) => s.status);
  const source = useRiskStore((s) => s.source);
  const reliefMissing = useRiskStore((s) => s.reliefMissing);
  const { setKind, setRelief } = useRiskStore.getState();
  const inView = useColombiaInView();

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div role="radiogroup" aria-label={t('legend.chooseKind')} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {RISK_KINDS.map((k) => {
          const Icon = RISK_ICON[k];
          const on = k === kind;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(k)}
              className={clsx(
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1',
                on ? 'bg-field-500 text-black ring-field-500' : 'ring-line hover:bg-white/10',
              )}
            >
              <Icon aria-hidden className="size-4" />
              {t(`kinds.${k}`)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ul aria-label={t('legend.levels')} className="flex flex-1 flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          {(['low', 'medium', 'high', 'none'] as const).map((l) => (
            <li key={l} className="flex items-center gap-1.5">
              <LevelSwatch level={l} />
              {t(`levels.${l}`)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          role="switch"
          aria-checked={relief && !reliefMissing}
          aria-label={`${t('legend.relief')}: ${relief && !reliefMissing ? t('legend.on') : t('legend.off')}`}
          disabled={reliefMissing}
          onClick={() => setRelief(!relief)}
          className={clsx(
            'flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 disabled:opacity-50',
            relief && !reliefMissing ? 'bg-white/10 ring-field-400' : 'text-ink-muted ring-line hover:bg-white/10',
          )}
        >
          <Mountain aria-hidden className="size-4" />
          {t('legend.relief')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {!inView && (
          <button
            type="button"
            onClick={() => fitBounds(CO_BBOX)}
            className="flex min-h-11 items-center gap-2 rounded-full bg-sky-glow/20 px-3 text-sm font-semibold ring-1 ring-sky-glow/50 hover:bg-sky-glow/30"
          >
            <MapPin aria-hidden className="size-4" />
            {t('legend.goColombia')}
          </button>
        )}
      </div>

      <p role="status" aria-live="polite" className="text-sm">
        {status === 'loading' ? (
          <span className="flex items-center gap-2 text-ink-muted">
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            {t('legend.loading')}
          </span>
        ) : status === 'error' ? (
          <span className="text-risk-medium">{t('legend.error')}</span>
        ) : !inView ? (
          <span className="text-ink-muted">{t('legend.onlyColombia')}</span>
        ) : (
          <span className="text-ink-faint">{t('legend.hint')}</span>
        )}
      </p>
      {reliefMissing && <p className="text-xs text-ink-faint">{t('legend.reliefMissing')}</p>}
      {source === 'synthetic' && <p className="-mt-1 text-xs text-sun">{t('legend.synthetic')}</p>}
    </div>
  );
}
