'use client';

import clsx from 'clsx';
import { Pause, Play, Printer, SkipForward, Sparkles, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAgentStore } from '@/features/agent/store';
import { selectField } from '@/features/field/actions';
import { DEMO_FARMS, demoField } from '@/features/field/demoFarms';
import { useFieldStore } from '@/features/field/store';
import { flyTo } from '@/features/globe/camera';
import { useLayerStore } from '@/features/layers/store';
import { useLocationStore } from '@/features/location/store';
import { usePrioritiesStore } from '@/features/priorities/store';
import { useRegionStore } from '@/features/region/store';
import { DEFAULT_PRIORITIES } from '@/lib/api/contract';

type RadioEngine = { activate: () => void; play: () => Promise<void> | void; pause: () => void };

const IOWA = DEMO_FARMS.find((d) => d.id === 'cornbelt-iowa') ?? DEMO_FARMS[0]!;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a que el agente termine de responder (o se cumpla el tiempo). */
async function waitForAgent(prevCount: number, maxMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = useAgentStore.getState();
    if (!s.busy && s.messages.length > prevCount + 1 && s.messages.at(-1)?.role === 'assistant') return;
    await wait(300);
  }
}

type Step = { id: string; ms: number; run: (ctx: { locale: string; radio: RadioEngine | null }) => Promise<void> | void };

/**
 * Recorrido guiado (?demo=1, 60–90 s): ubicación → drawer de región → radio → agente que mueve el globo y activa
 * SMAP → finca → calendario → 3 rotaciones → cambio de prioridades → resumen imprimible.
 * Cada paso usa las mismas acciones que la app; se puede pausar, adelantar o salir.
 */
const STEPS: Step[] = [
  {
    id: 'location',
    ms: 6000,
    run: () => {
      const loc = useLocationStore.getState();
      const t = loc.precise ?? loc.coarse;
      if (t) flyTo({ lng: t.lon, lat: t.lat, zoom: 4.5 });
    },
  },
  {
    id: 'region',
    ms: 8000,
    run: () => {
      useRegionStore.getState().openRegion({ lat: IOWA.center[1], lon: IOWA.center[0], name: 'Iowa' });
    },
  },
  {
    id: 'radio',
    ms: 9000,
    run: ({ radio }) => {
      useRegionStore.getState().closeRegion();
      flyTo({ lng: -93.63, lat: 42.03, zoom: 5 });
      if (radio) {
        radio.activate();
        void radio.play();
      }
    },
  },
  {
    id: 'agent',
    ms: 4000,
    run: async ({ radio, locale }) => {
      radio?.pause();
      const prev = useAgentStore.getState().messages.length;
      useAgentStore.getState().openWith(locale === 'en' ? 'How is soil moisture in Punjab?' : '¿Cómo está la humedad del suelo en el Punjab?');
      await waitForAgent(prev);
      await wait(2500);
      useAgentStore.getState().setExpanded(false);
    },
  },
  {
    id: 'farm',
    ms: 7000,
    run: async ({ locale }) => {
      useRegionStore.getState().closeRegion();
      useLayerStore.getState().clearLayers();
      await selectField(demoField(IOWA, locale), { locale, remember: false });
      useFieldStore.getState().setAnalyzing(true);
    },
  },
  {
    id: 'calendar',
    ms: 7000,
    run: async () => {
      useFieldStore.getState().setPanelTab('conditions');
      await wait(600);
      document.getElementById('sec-year')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
  },
  { id: 'rotations', ms: 8000, run: () => useFieldStore.getState().setPanelTab('rotations') },
  {
    id: 'priorities',
    ms: 8000,
    run: () => {
      usePrioritiesStore.getState().load({ ...DEFAULT_PRIORITIES, waterSaving: 5, erosionControl: 5, income: 1, forage: 1 });
      useFieldStore.getState().setPanelTab('rotations');
    },
  },
  { id: 'plan', ms: 9000, run: () => useFieldStore.getState().setPanelTab('plan') },
  { id: 'print', ms: 0, run: () => undefined },
];

export default function DemoTour() {
  const t = useTranslations('demo');
  const locale = useLocale();
  const [started, setStarted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const radio = useRef<RadioEngine | null>(null);
  const ranFor = useRef(-1);
  const inFlight = useRef<Promise<void>>(Promise.resolve());

  // El motor de radio se precarga para poder activarlo dentro del toque de "Empezar" (los navegadores lo exigen).
  useEffect(() => {
    void import('@/features/radio/engine').then((m) => (radio.current = m.radioEngine as unknown as RadioEngine));
  }, []);

  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;

  // Cada paso se ejecuta una sola vez; cuando su acción termina (p. ej. la respuesta del agente) empieza la cuenta
  // para pasar al siguiente. Pausar solo detiene la cuenta.
  useEffect(() => {
    if (!started || closed) return;
    const current = STEPS[index]!;
    if (ranFor.current !== index) {
      ranFor.current = index;
      inFlight.current = Promise.resolve(current.run({ locale, radio: radio.current })).catch(() => undefined);
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void inFlight.current.then(() => {
      if (cancelled || paused || current.ms === 0) return;
      timer = setTimeout(() => setIndex((i) => Math.min(STEPS.length - 1, i + 1)), current.ms);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [index, started, closed, paused, locale]);

  const start = useCallback(() => {
    radio.current?.activate();
    setStarted(true);
  }, []);

  const exit = () => {
    ranFor.current = Number.MAX_SAFE_INTEGER;
    radio.current?.pause();
    setClosed(true);
  };

  const printHref = () => {
    const params = new URLSearchParams(window.location.search);
    for (const k of ['lat', 'lon', 'z', 'view', 'layer', 'ldate', 'region', 'demo']) params.delete(k);
    return `/${locale}/print?${params.toString()}`;
  };

  if (closed) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+4.5rem)] z-[65] flex justify-center px-3">
      <section
        aria-label={t('label')}
        aria-live="polite"
        className="panel pointer-events-auto w-full max-w-md rounded-3xl p-4 shadow-2xl"
      >
        {!started ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-lg font-bold">
              <Sparkles aria-hidden className="size-5 text-sun" />
              {t('title')}
            </p>
            <p className="text-sm text-ink-muted">{t('intro')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={start}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-semibold text-black hover:bg-field-400"
              >
                <Play aria-hidden className="size-5" />
                {t('start')}
              </button>
              <button type="button" onClick={exit} className="min-h-12 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line">
                {t('notNow')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('step', { n: index + 1, total: STEPS.length })}</p>
              <div aria-hidden className="flex flex-1 gap-0.5">
                {STEPS.map((s, i) => (
                  <span key={s.id} className={clsx('h-1 flex-1 rounded-full', i <= index ? 'bg-field-400' : 'bg-white/15')} />
                ))}
              </div>
              <button type="button" onClick={exit} aria-label={t('exit')} className="grid size-11 place-items-center rounded-full hover:bg-white/10">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <p className="font-bold" data-demo-step={step.id}>
              {t(`steps.${step.id}.title`)}
            </p>
            <p className="text-sm text-ink-muted">{t(`steps.${step.id}.text`)}</p>
            {last ? (
              <div className="flex gap-2">
                <a
                  href={printHref()}
                  target="_blank"
                  rel="noopener"
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-field-500 px-4 font-semibold text-black hover:bg-field-400"
                >
                  <Printer aria-hidden className="size-5" />
                  {t('print')}
                </a>
                <button type="button" onClick={exit} className="min-h-12 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-line">
                  {t('finish')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line"
                >
                  {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
                  {paused ? t('resume') : t('pause')}
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold ring-1 ring-line"
                >
                  <SkipForward aria-hidden className="size-4" />
                  {t('next')}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
