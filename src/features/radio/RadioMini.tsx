'use client';

import clsx from 'clsx';
import { ChevronDown, ChevronUp, Loader2, Map as MapIcon, Pause, Play, Radio, SkipForward } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useLayerStore } from '@/features/layers/store';
import { useReducedMotion } from '@/lib/hooks/useMediaQuery';
import { radioEngine } from './engine';
import { useRadioStore } from './store';

/** Barras del visualizador (canvas, ≤ 30 fps, se detiene si no suena o la pestaña está oculta). */
function Visualizer({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33 || document.hidden) return;
      last = now;
      const levels = active && !reduced ? radioEngine.getLevels() : null;
      const n = 12;
      const w = canvas.width / n;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < n; i++) {
        const v = levels ? (levels[Math.min(levels.length - 1, i + 1)] ?? 0) / 255 : 0.12;
        const h = Math.max(2 * dpr, v * canvas.height);
        ctx.fillStyle = `rgba(110, 227, 154, ${0.45 + v * 0.55})`;
        ctx.fillRect(i * w + w * 0.18, canvas.height - h, w * 0.64, h);
      }
      if (!active || reduced) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);
  return <canvas ref={ref} aria-hidden className="h-8 w-14 shrink-0" />;
}

/**
 * Mini reproductor de la "Radio del campo" (encima de la barra del chat). Nunca suena solo al cargar:
 * el primer play exige un toque. Se expande con transcripción, próximos segmentos y patrocinador.
 */
export default function RadioMini() {
  const t = useTranslations('radio');
  const reduced = useReducedMotion();
  const stations = useRadioStore((s) => s.stations);
  const tunedId = useRadioStore((s) => s.tunedId);
  const segments = useRadioStore((s) => s.segments);
  const index = useRadioStore((s) => s.index);
  const status = useRadioStore((s) => s.status);
  const expanded = useRadioStore((s) => s.expanded);
  const usingVoice = useRadioStore((s) => s.usingVoice);
  const setExpanded = useRadioStore((s) => s.setExpanded);

  const station = stations.find((s) => s.id === tunedId);
  const seg = segments[index];
  if (!station) return null;

  const playing = status === 'playing' || status === 'static' || status === 'loading';
  const title = status === 'static' ? t('tuning') : status === 'empty' ? t('empty') : seg?.title ?? t('empty');

  return (
    <section aria-label={t('label')} className="panel pointer-events-auto w-full overflow-hidden rounded-2xl shadow-xl">
      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-2">
        <button
          type="button"
          onClick={() => radioEngine.toggle()}
          disabled={status === 'empty' || !seg}
          aria-label={playing ? t('pause') : t('play')}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-field-500 text-black disabled:opacity-40"
        >
          {status === 'loading' ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : playing ? (
            <Pause aria-hidden className="size-5" />
          ) : (
            <Play aria-hidden className="size-5 translate-x-px" />
          )}
        </button>
        <Visualizer active={playing} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-muted">
            <Radio aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              {station.name} · {station.frequencyLabel}
            </span>
          </p>
          <div className="relative overflow-hidden whitespace-nowrap">
            <p
              aria-live="polite"
              className={clsx('inline-block text-sm font-semibold', playing && !reduced && title.length > 28 && 'marquee')}
            >
              {seg?.type === 'ad' && status !== 'static' && (
                <span className="mr-1.5 rounded bg-sun/25 px-1 text-[10px] font-bold text-sun uppercase">{t('ad')}</span>
              )}
              {title}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => radioEngine.next()}
          disabled={segments.length < 2}
          aria-label={t('next')}
          className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
        >
          <SkipForward aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? t('collapse') : t('expand')}
          className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          {expanded ? <ChevronDown aria-hidden className="size-5" /> : <ChevronUp aria-hidden className="size-5" />}
        </button>
      </div>

      {expanded && (
        <div className="max-h-[45dvh] overflow-y-auto border-t border-line px-3 py-3 text-sm">
          {seg && (
            <>
              <p className="text-xs font-semibold text-ink-muted uppercase">{t('transcript')}</p>
              <p className="mt-1">{seg.transcript}</p>
              <p className="mt-2 flex flex-wrap gap-2 text-xs text-ink-muted">
                {seg.type === 'ad' && seg.sponsor && <span>{t('sponsor', { name: seg.sponsor })}</span>}
                {seg.type !== 'ad' && seg.dataSource && <span>{t('source', { source: seg.dataSource })}</span>}
                {usingVoice && <span className="rounded bg-sky-glow/20 px-1.5 text-sky-glow">{t('voiceFallback')}</span>}
              </p>
              {seg.relatedLayerId && (
                <button
                  type="button"
                  onClick={() => useLayerStore.getState().setLayer(seg.relatedLayerId!)}
                  className="mt-2 flex min-h-10 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
                >
                  <MapIcon aria-hidden className="size-4" />
                  {t('seeOnMap')}
                </button>
              )}
            </>
          )}
          {segments.length > 1 && (
            <>
              <p className="mt-4 text-xs font-semibold text-ink-muted uppercase">{t('upNext')}</p>
              <ol className="mt-1 flex flex-col gap-1">
                {segments.map((s, i) =>
                  i === index ? null : (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          useRadioStore.getState().setIndex(i);
                          radioEngine.activate();
                          void radioEngine.play();
                        }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-white/5"
                      >
                        <span className={clsx('rounded px-1 text-[10px] font-bold uppercase', s.type === 'ad' ? 'bg-sun/25 text-sun' : s.type === 'alert' ? 'bg-risk-high/25 text-risk-high' : 'bg-field-500/25 text-field-300')}>
                          {t(`types.${s.type}`)}
                        </span>
                        <span className="truncate">{s.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-ink-faint tabular-nums">{Math.round(s.durationSec)} s</span>
                      </button>
                    </li>
                  ),
                )}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  );
}
