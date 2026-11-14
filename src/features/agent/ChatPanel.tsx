'use client';

import clsx from 'clsx';
import { toTimeParam } from '@/features/time/period';
import { useTimeStore } from '@/features/time/store';
import { ChevronDown, FileText, Loader2, Mic, MicOff, RotateCcw, Send, Sparkles, Undo2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { needStateFor, useFarmDataStore } from '@/features/field/farmData';
import { pendingNeeds } from '@/features/field/needs';
import { useFieldStore } from '@/features/field/store';
import { flyTo } from '@/features/globe/camera';
import { getMap } from '@/features/globe/store';
import { useLayerStore } from '@/features/layers/store';
import { getUserLocation } from '@/features/location/store';
import { speak, stop as stopNarrator, stripMarkdown, type NarratorLang } from '@/features/narrator/narrator';
import { SpeakButton } from '@/features/narrator/SpeakButton';
import { agentProfile, useProfileStore } from '@/features/onboarding/profile';
import { useRegionStore } from '@/features/region/store';
import { AgentAction, AgentResponse, type AgentRequest } from '@/lib/api/contract';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { usePrefsStore } from '@/lib/prefs';
import { runAgentActions } from './actionRunner';
import { useAgentStore, type ChatMessage } from './store';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Lo que el agente necesita saber de la pantalla para responder y mover el globo. */
function buildRequest(sessionId: string, message: string, locale: 'es' | 'en', history: ChatMessage[]): AgentRequest {
  const map = getMap();
  const c = map?.getCenter();
  const layer = useLayerStore.getState();
  const region = useRegionStore.getState().target;
  const field = useFieldStore.getState().field;
  const ctx = useAgentStore.getState().context;
  const loc = getUserLocation();
  const activeLayerId = layer.active[0];
  const timeSel = useTimeStore.getState().sel;
  // Datos de la finca que el análisis todavía no tiene: el agente los pide antes de recomendar.
  const missing = field ? pendingNeeds(needStateFor(field.id), useFarmDataStore.getState().requests[field.id]).map((n) => n.need) : [];
  return {
    sessionId,
    message,
    locale,
    userLocation: loc ? { lat: loc.lat, lon: loc.lon, accuracy: loc.accuracy, city: loc.city, country: loc.country } : null,
    view: {
      center: [c?.lng ?? 0, c?.lat ?? 0],
      zoom: map?.getZoom() ?? 1,
      activeLayerId,
      layerDate: activeLayerId ? layer.dates[activeLayerId] : undefined,
      when: timeSel ? toTimeParam(timeSel) : undefined,
      openRegionId: region
        ? region.demoId
          ? `demo:${region.demoId}`
          : `cell:${region.lat.toFixed(2)},${region.lon.toFixed(2)}`
        : ctx.openRegion?.id,
      fieldId: field?.id,
      missingData: missing.length ? missing : undefined,
    },
    history: history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    // Rol, modo sencillo/completo y voz: el agente ajusta el largo, los términos y si la respuesta se leerá en voz alta.
    profile: agentProfile(),
  };
}

/**
 * Conversación con el agente de IA (n8n vía /api/agent). Móvil: hasta ~60 % de la altura (el globo sigue
 * visible arriba). Desktop: tarjeta centrada de ~560 px. Mientras el globo vuela por una acción del agente,
 * el panel se minimiza a la barra para que se vea el movimiento.
 */
export default function ChatPanel() {
  const t = useTranslations('agent');
  const tReport = useTranslations('report');
  const tNarrator = useTranslations('narrator');
  const locale = useLocale() as 'es' | 'en';
  const reduced = useReducedMotion();
  const isDesktop = useIsDesktop();
  const expanded = useAgentStore((s) => s.expanded);
  const flying = useAgentStore((s) => s.flying);
  const messages = useAgentStore((s) => s.messages);
  const busy = useAgentStore((s) => s.busy);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const Recognition = getRecognition();

  useEffect(() => useAgentStore.getState().hydrate(), []);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, busy, reduced]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      const store = useAgentStore.getState();
      if (!message || store.busy) return;
      store.hydrate();
      const history = store.messages;
      store.addMessage({ id: uid(), role: 'user', content: message });
      setInput('');
      store.setBusy(true);
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRequest(useAgentStore.getState().sessionId, message, locale, history)),
          signal: AbortSignal.timeout(35_000),
        });
        if (!res.ok) {
          const key = res.status === 429 ? 'errorRate' : res.status === 504 ? 'errorTimeout' : 'errorGeneric';
          store.addMessage({ id: uid(), role: 'assistant', content: t(key), status: 'error' });
          return;
        }
        const parsed = AgentResponse.safeParse(await res.json());
        if (!parsed.success) {
          store.addMessage({ id: uid(), role: 'assistant', content: t('errorGeneric'), status: 'error' });
          return;
        }
        const data = parsed.data;
        const actions = data.actions ?? [];
        const moves = actions.some((a) => {
          const p = AgentAction.safeParse(a);
          return p.success && ['flyTo', 'fitBounds', 'openRegion'].includes(p.data.type);
        });
        const map = getMap();
        const c = map?.getCenter();
        const msgId = uid();
        store.addMessage({
          id: msgId,
          role: 'assistant',
          content: data.reply,
          status: 'ok',
          sources: data.sources,
          suggestions: data.suggestions,
          previous: moves && map && c ? { lng: c.lng, lat: c.lat, zoom: map.getZoom() } : undefined,
        });
        // Locutor encendido: la respuesta se lee sola (sin markdown ni símbolos).
        if (usePrefsStore.getState().narrator) speak(stripMarkdown(data.reply), { lang: locale as NarratorLang, id: `msg:${msgId}` });
        if (actions.length) {
          const result = await runAgentActions(actions, {
            locale,
            onFlightStart: () => useAgentStore.getState().setFlying(true),
            messages: { noField: t('noField') },
          });
          // En móvil el drawer de región ocupa casi toda la pantalla: el chat queda en la barra.
          if (result.openedRegion && !window.matchMedia('(min-width: 1024px)').matches) {
            useAgentStore.getState().setExpanded(false);
          }
          useAgentStore.getState().setFlying(false);
          if (result.report) useAgentStore.getState().patchMessage(msgId, { report: result.report });
        }
      } catch (err) {
        const key = (err as Error).name === 'TimeoutError' ? 'errorTimeout' : 'errorNetwork';
        store.addMessage({ id: uid(), role: 'assistant', content: t(key), status: 'error' });
      } finally {
        useAgentStore.getState().setBusy(false);
      }
    },
    [locale, t],
  );

  const startVoice = useCallback(() => {
    if (!Recognition || listening) return;
    const rec = new Recognition();
    rec.lang = locale === 'en' ? 'en-US' : 'es-ES';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ');
      setInput(text);
    };
    rec.onend = () => {
      setListening(false);
      useAgentStore.getState().setBusy(false);
      inputRef.current?.focus();
    };
    rec.onerror = () => {
      setListening(false);
      useAgentStore.getState().setBusy(false);
    };
    recRef.current = rec;
    // La voz del locutor no debe colarse en el dictado.
    stopNarrator();
    setListening(true);
    // Mientras se dicta, la radio baja el volumen (mismo mecanismo que cuando responde el agente).
    useAgentStore.getState().setBusy(true);
    rec.start();
  }, [Recognition, listening, locale]);

  // Abrir con pregunta pre-escrita (desde el drawer de región) o dictando.
  useEffect(() => {
    if (!expanded) return;
    // Se difiere un tick: el panel ya está montado y la acción no dispara renders en cascada dentro del efecto.
    const id = setTimeout(() => {
      const prompt = useAgentStore.getState().consumePrompt();
      if (prompt) void send(prompt);
      else if (useAgentStore.getState().consumeVoice()) startVoice();
      else inputRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(id);
  }, [expanded, send, startVoice]);

  useEffect(() => {
    if (!expanded || flying) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useAgentStore.getState().setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, flying]);

  const visible = expanded && !flying;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  // Preguntas para empezar: las que sugirió la IA en las preguntas de inicio, o las de siempre.
  const profileStarters = useProfileStore((s) => s.profile?.suggestions);
  const starter = profileStarters?.length ? profileStarters : [t('suggest1'), t('suggest2'), t('suggest3')];

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          key="chat"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 48, scale: 0.98 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 48, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          className={clsx(
            'panel pointer-events-auto fixed z-40 flex flex-col overflow-hidden shadow-2xl',
            isDesktop
              ? 'bottom-4 max-h-[72dvh] w-[560px] -translate-x-1/2 rounded-3xl'
              : 'inset-x-0 bottom-0 h-[62dvh] rounded-t-[var(--radius-sheet)] pb-[var(--safe-bottom)]',
          )}
          style={isDesktop ? { left: 'calc((100% - var(--map-pad-right, 0px)) / 2)' } : undefined}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
            <Sparkles aria-hidden className="size-5 text-sky-glow" />
            <h2 id="chat-title" className="flex-1 font-bold">
              {t('title')}
            </h2>
            <button
              type="button"
              onClick={() => useAgentStore.getState().resetConversation()}
              aria-label={t('newChat')}
              title={t('newChat')}
              className="grid size-11 place-items-center rounded-full hover:bg-white/10"
            >
              <RotateCcw aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => useAgentStore.getState().setExpanded(false)}
              aria-label={t('minimize')}
              className="grid size-11 place-items-center rounded-full hover:bg-white/10"
            >
              <ChevronDown aria-hidden className="size-5" />
            </button>
          </header>

          <ol ref={listRef} aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3">
            {messages.length === 0 && (
              <li className="rounded-2xl bg-white/5 p-3 text-sm text-ink-muted">{t('intro')}</li>
            )}
            {messages.map((m) => (
              <li key={m.id} className={clsx('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                <div
                  className={clsx(
                    'max-w-[88%] rounded-2xl px-3 py-2 text-sm',
                    m.role === 'user'
                      ? 'rounded-br-md bg-field-500 text-black'
                      : m.status === 'error'
                        ? 'rounded-bl-md bg-risk-medium/15 ring-1 ring-risk-medium/40'
                        : 'rounded-bl-md bg-white/8 ring-1 ring-line',
                  )}
                >
                  {m.role === 'assistant' ? (
                    <div className="chat-md">
                      <ReactMarkdown
                        rehypePlugins={[rehypeSanitize]}
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
                {m.role === 'assistant' && (m.status !== 'error' || m.sources?.length || m.previous || m.report) ? (
                  <div className="mt-1.5 flex max-w-[88%] flex-wrap items-center gap-1.5">
                    {m.status !== 'error' && (
                      <SpeakButton id={`msg:${m.id}`} compact label={tNarrator('listenReply')} text={() => stripMarkdown(m.content)} />
                    )}
                    {m.sources?.map((s) => (
                      <span key={s.dataset + (s.date ?? '')} className="rounded-full bg-sky-glow/15 px-2 py-0.5 text-[11px] font-medium text-sky-glow">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer">
                            {s.dataset}
                          </a>
                        ) : (
                          s.dataset
                        )}
                        {s.date ? ` · ${s.date}` : ''}
                      </span>
                    ))}
                    {m.report && (
                      <a
                        href={m.report}
                        target="_blank"
                        rel="noopener"
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-field-500 px-4 text-sm font-bold text-black hover:bg-field-400"
                      >
                        <FileText aria-hidden className="size-4" />
                        {tReport('chatOpen')}
                      </a>
                    )}
                    {m.previous && (
                      <button
                        type="button"
                        onClick={() => {
                          useRegionStore.getState().closeRegion();
                          flyTo({ lng: m.previous!.lng, lat: m.previous!.lat, zoom: m.previous!.zoom });
                        }}
                        className="flex min-h-8 items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11px] font-semibold hover:bg-white/15"
                      >
                        <Undo2 aria-hidden className="size-3.5" />
                        {t('goBack')}
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
            {busy && !listening && (
              <li className="flex items-center gap-2 text-sm text-ink-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                {t('thinking')}
              </li>
            )}
          </ol>

          <div className="shrink-0 border-t border-line px-3 pt-2 pb-2">
            <ul className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1" aria-label={t('suggestions')}>
              {(lastAssistant?.suggestions?.length ? lastAssistant.suggestions : starter).map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void send(s)}
                    disabled={busy}
                    className="min-h-9 rounded-full bg-white/5 px-3 text-xs whitespace-nowrap ring-1 ring-line hover:bg-white/10 disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2"
            >
              <label className="sr-only" htmlFor="chat-input">
                {t('inputLabel')}
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={listening ? t('listening') : t('placeholder')}
                maxLength={1000}
                enterKeyHint="send"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-white/5 px-3 py-2.5 text-base ring-1 ring-line outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-field-400"
              />
              {Recognition && (
                <button
                  type="button"
                  onClick={() => (listening ? recRef.current?.stop() : startVoice())}
                  aria-pressed={listening}
                  aria-label={listening ? t('stopVoice') : t('voice')}
                  className={clsx('grid size-11 shrink-0 place-items-center rounded-full', listening ? 'bg-risk-high text-white' : 'bg-white/10')}
                >
                  {listening ? <MicOff aria-hidden className="size-5" /> : <Mic aria-hidden className="size-5" />}
                </button>
              )}
              <button
                type="submit"
                disabled={!input.trim() || busy}
                aria-label={t('send')}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-field-500 text-black disabled:opacity-40"
              >
                <Send aria-hidden className="size-5" />
              </button>
            </form>
            <p className="mt-1.5 text-center text-[11px] text-ink-faint">{t('disclaimer')}</p>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
