'use client';

import clsx from 'clsx';
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Gauge,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pause,
  Play,
  Radio,
  SkipForward,
  TriangleAlert,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef } from 'react';
import { useGlossaryStore, type GlossaryTerm } from '@/features/glossary/terms';
import { useLayerStore } from '@/features/layers/store';
import { useRegionStore } from '@/features/region/store';
import type { RadioSegment } from '@/lib/api/contract';
import { useReducedMotion } from '@/lib/hooks/useMediaQuery';
import { resyncCues } from './cues';
import { radioEngine } from './engine';
import { useRadioLive } from './live';
import { shortPlace } from './local';
import { writtenByClaude } from './programClient';
import { splitSentences } from './sentences';
import { useRadioStore } from './store';
import { termsIn } from './terms';

const GlossarySheet = dynamic(() => import('@/features/glossary/GlossarySheet'), { ssr: false });

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

const typeBadge = (type: RadioSegment['type']) =>
  type === 'ad' ? 'bg-sun/25 text-sun' : type === 'alert' ? 'bg-risk-high/25 text-risk-high' : 'bg-field-500/25 text-field-300';

/** "¿Qué es NDVI?": abre el glosario (objetivo táctil de 44 px). */
function TermChip({ term }: { term: GlossaryTerm }) {
  const tg = useTranslations('glossary');
  return (
    <button
      type="button"
      onClick={() => useGlossaryStore.getState().show(term)}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-sky-glow/15 px-3 text-xs font-semibold text-sky-glow ring-1 ring-sky-glow/30 hover:bg-sky-glow/25"
    >
      <CircleHelp aria-hidden className="size-4" />
      {tg('whatIs', { term: tg(`terms.${term}.title`) })}
    </button>
  );
}

/**
 * Mini reproductor de la "Radio del campo" (encima de la barra del chat). Nunca suena solo al cargar:
 * el primer play exige un toque. Mientras habla muestra la frase que suena (subtítulos) y ofrece el
 * "¿qué es esto?" de los términos técnicos. Expandido: transcripción por frases (tocar una la repite),
 * fuentes, confianza y vacíos de cada bloque, "La radio mueve el mapa" y los próximos segmentos.
 */
export default function RadioMini() {
  const t = useTranslations('radio');
  const format = useFormatter();
  const reduced = useReducedMotion();
  const station = useRadioStore((s) => s.station);
  const segments = useRadioStore((s) => s.segments);
  const index = useRadioStore((s) => s.index);
  const status = useRadioStore((s) => s.status);
  const expanded = useRadioStore((s) => s.expanded);
  const usingVoice = useRadioStore((s) => s.usingVoice);
  const setExpanded = useRadioStore((s) => s.setExpanded);
  const sentence = useRadioLive((s) => s.sentence);
  const follow = useRadioLive((s) => s.follow);
  const held = useRadioLive((s) => s.held);
  const program = useRadioLive((s) => s.program);
  const glossaryOpen = useGlossaryStore((s) => s.open !== null);
  const currentRef = useRef<HTMLLIElement>(null);

  const seg = segments[index];
  const sentences = useMemo(() => (seg ? splitSentences(seg.transcript) : []), [seg]);
  const at = Math.min(sentence, Math.max(0, sentences.length - 1));
  const segTerms = useMemo(() => [...new Set(sentences.flatMap((s) => termsIn(s)))], [sentences]);

  useEffect(() => {
    if (expanded) currentRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [expanded, at, seg, reduced]);

  if (!station) return null;

  const playing = status === 'playing' || status === 'static' || status === 'loading';
  const preparing = status === 'loading' && program.stationId === station.id && program.status === 'loading';
  const place = shortPlace(station.region);
  const title =
    status === 'static'
      ? t('tuning')
      : preparing
        ? t('preparing', { place })
        : status === 'empty'
          ? t('empty')
          : (seg?.title ?? t('empty'));
  const speaking = (status === 'playing' && Boolean(sentences[at])) || false;
  const liveTerm = speaking ? termsIn(sentences[at])[0] : undefined;
  const isProgram = Boolean(seg?.topic);
  const resume = () => {
    useRadioLive.getState().setHeld(false);
    resyncCues(seg ?? null, at);
  };
  const dated = (date?: string) =>
    date && /^\d{4}-\d{2}(-\d{2})?$/.test(date)
      ? format.dateTime(new Date(`${date.length === 7 ? `${date}-15` : date}T12:00:00Z`), date.length === 7 ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' })
      : date;

  return (
    <section aria-label={t('label')} className="panel pointer-events-auto w-full overflow-hidden rounded-2xl shadow-xl">
      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-2">
        <button
          type="button"
          onClick={() => radioEngine.toggle()}
          disabled={status === 'empty' || (!seg && station.lat == null)}
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
              {seg && seg.type !== 'tip' && seg.type !== 'news' && status !== 'static' && !preparing && (
                <span className={clsx('mr-1.5 rounded px-1 text-[10px] font-bold uppercase', typeBadge(seg.type))}>{t(`types.${seg.type}`)}</span>
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

      {/* Subtítulos: la frase que suena. La voz ya la dice; la transcripción completa (accesible) está al expandir. */}
      {speaking && !expanded && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
          <p aria-hidden className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-ink">
            {sentences[at]}
          </p>
          {held && isProgram ? (
            <button
              type="button"
              onClick={resume}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-field-500/15 px-3 text-xs font-semibold text-field-300 ring-1 ring-field-500/30"
            >
              <Navigation aria-hidden className="size-4" />
              {t('resume')}
            </button>
          ) : (
            liveTerm && <TermChip term={liveTerm} />
          )}
        </div>
      )}

      {expanded && (
        <div className="max-h-[45dvh] overflow-y-auto border-t border-line px-3 py-3 text-sm">
          {preparing && <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted"><Loader2 aria-hidden className="size-3.5 animate-spin" />{t('preparing', { place })}</p>}
          {program.stationId === station.id && program.pending && !preparing && <p className="mb-2 text-xs text-ink-muted">{t('polishing')}</p>}
          {program.stationId === station.id && program.status === 'error' && <p className="mb-2 text-xs text-ink-muted">{t('programError')}</p>}
          {station.local && <p className="mb-2 text-xs text-ink-muted">{t('localStation')}</p>}

          {seg && (
            <>
              <p className="text-xs font-semibold text-ink-muted uppercase">{t('transcript')}</p>
              <ol className="mt-1 flex flex-col">
                {sentences.map((s, i) => (
                  <li key={i} ref={i === at ? currentRef : undefined}>
                    <button
                      type="button"
                      onClick={() => radioEngine.seekSentence(i)}
                      aria-current={i === at && playing ? 'true' : undefined}
                      aria-label={t('jumpTo', { text: s })}
                      className={clsx(
                        'w-full rounded-lg px-1.5 py-1 text-left',
                        i === at && playing ? 'bg-field-500/15 font-medium text-ink' : i < at && playing ? 'text-ink-muted' : 'text-ink',
                        'hover:bg-white/5',
                      )}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ol>

              {segTerms.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {segTerms.slice(0, 3).map((term) => (
                    <TermChip key={term} term={term} />
                  ))}
                </div>
              )}

              {/* Evidencia y honestidad del bloque: fuente con fecha, confianza, vacíos y si es de demostración. */}
              <div className="mt-3 flex flex-col gap-1.5 text-xs text-ink-muted">
                {seg.type === 'ad' && seg.sponsor && <p>{t('sponsor', { name: seg.sponsor })}</p>}
                {seg.type !== 'ad' && (seg.sources?.length ? (
                  <p>{t('source', { source: seg.sources.map((x) => (x.date ? `${x.dataset} · ${dated(x.date)}` : x.dataset)).join(' · ') })}</p>
                ) : (
                  seg.dataSource && <p>{t('source', { source: seg.dataSource })}</p>
                ))}
                {seg.confidence && (
                  <p className="flex items-center gap-1.5">
                    <Gauge aria-hidden className="size-3.5 shrink-0" />
                    {t(`confidence.${seg.confidence}`)}
                  </p>
                )}
                {seg.simulated && (
                  <p className="flex items-center gap-1.5 text-sun">
                    <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                    {t('simulated')}
                  </p>
                )}
                {seg.caveat && <p>{t('caveat', { text: seg.caveat })}</p>}
                {isProgram && <p>{writtenByClaude.has(seg) ? t('byClaude') : t('byRules')}</p>}
                {usingVoice && <p className="text-sky-glow">{seg.audioUrl ? t('voiceFallback') : t('voiceDevice')}</p>}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {seg.relatedLayerId && (
                  <button
                    type="button"
                    onClick={() => useLayerStore.getState().setLayer(seg.relatedLayerId!)}
                    className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
                  >
                    <MapIcon aria-hidden className="size-4" />
                    {t('seeOnMap')}
                  </button>
                )}
                {isProgram && station.lat != null && station.lon != null && (
                  <button
                    type="button"
                    onClick={() => useRegionStore.getState().openRegion({ lat: station.lat!, lon: station.lon!, name: station.region })}
                    className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium ring-1 ring-line hover:bg-white/10"
                  >
                    <MapPin aria-hidden className="size-4" />
                    {t('seeZone', { place })}
                  </button>
                )}
              </div>
            </>
          )}

          {/* La radio mueve el mapa mientras habla (se puede apagar; si la persona toma el mapa, espera). */}
          <div className="mt-3 rounded-xl bg-white/5 p-2 ring-1 ring-line">
            <button
              type="button"
              role="switch"
              aria-checked={follow}
              onClick={() => useRadioLive.getState().setFollow(!follow)}
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block font-medium">{t('follow')}</span>
                <span className="block text-xs text-ink-muted">{t('followHint')}</span>
              </span>
              <span aria-hidden className={clsx('relative h-6 w-10 shrink-0 rounded-full transition-colors', follow ? 'bg-field-500' : 'bg-white/20')}>
                <span className={clsx('absolute top-0.5 size-5 rounded-full bg-white transition-[left]', follow ? 'left-[1.125rem]' : 'left-0.5')} />
              </span>
            </button>
            {follow && held && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-muted">{t('held')}</p>
                <button
                  type="button"
                  onClick={resume}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full bg-field-500/15 px-3 text-xs font-semibold text-field-300 ring-1 ring-field-500/30"
                >
                  <Navigation aria-hidden className="size-4" />
                  {t('resume')}
                </button>
              </div>
            )}
          </div>

          {segments.length > 1 && (
            <>
              <p className="mt-4 text-xs font-semibold text-ink-muted uppercase">{t('upNext')}</p>
              <ol className="mt-1 flex flex-col gap-1">
                {segments.map((s, i) =>
                  i === index ? null : (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => radioEngine.playAt(i)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-white/5"
                      >
                        <span className={clsx('rounded px-1 text-[10px] font-bold uppercase', typeBadge(s.type))}>
                          {s.topic ? t(`topics.${s.topic}`) : t(`types.${s.type}`)}
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

          <p className="mt-3 text-xs text-ink-muted">{t('reminder')}</p>
        </div>
      )}
      {glossaryOpen && <GlossarySheet />}
    </section>
  );
}
