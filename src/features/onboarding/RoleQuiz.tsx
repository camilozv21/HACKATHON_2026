'use client';

import clsx from 'clsx';
import { ArrowLeft, ArrowRight, ChartColumn, Check, Leaf, Satellite, Sparkles, Star, Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isSpeechSupported, speak, stop, type NarratorLang } from '@/features/narrator/narrator';
import type { OnboardingAnswers, ProfileSuggestion, QuestSummary } from '@/lib/api/contract';
import { usePrefsStore, type Mode } from '@/lib/prefs';
import { runFirstStep } from './firstStep';
import { GAME_IDS, summarize, totalStars, type QuestResults } from './games/catalog';
import { ProfileCard, profileSpoken } from './games/ProfileCard';
import QuestRunner from './games/QuestRunner';
import { markQuizTaken } from './gateFlag';
import { useProfileStore } from './profile';
import { QUESTION_OPTIONS, QUESTION_STEPS, type QuestionStep } from './questions';
import { requestSuggestion } from './suggest';

type Screen = QuestionStep | 'quest' | 'results' | 'thinking' | 'suggestion';
type Opt = { value: string; Icon: (typeof QUESTION_OPTIONS)['role'][number]['Icon'] };

/**
 * Inicio tipo juego (después de la bienvenida en línea):
 *  1. ¿Quién eres? (el personaje: agricultor/a o técnico/a) y ¿cómo quieres jugar? (escuchar, poco texto o todos
 *     los datos: enciende la voz y decide si los retos muestran la ciencia).
 *  2. Los 7 retos del glosario (games/QuestRunner): NDVI, evapotranspiración, balance de agua, anomalía de humedad,
 *     helada, satélite vs. campo y la temporada (vulnerabilidad del cultivo y salud del suelo).
 *  3. ¿Cuál es tu primera misión? y "Tu perfil de campo" (insignia, nivel, términos que domina y por repasar).
 *  4. /api/profile (Claude → reglas) sugiere modo sencillo o completo, voz y primer paso; la persona confirma.
 * Pensado para quien no sabe leer: íconos grandes, cada pantalla se lee sola con la voz encendida, y botones
 * grandes abajo. Mismo aspecto que la bienvenida (z-80).
 */
export default function RoleQuiz({ onClose }: { onClose: () => void }) {
  const t = useTranslations('onboarding');
  const tRules = useTranslations('onboarding.rules');
  const locale = useLocale() as NarratorLang;
  const reduced = useReducedMotion() ?? false;
  const narrator = usePrefsStore((s) => s.narrator);
  const [screen, setScreen] = useState<Screen>('role');
  const [answers, setAnswers] = useState<Partial<OnboardingAnswers>>({});
  const [quest, setQuest] = useState<{ index: number; results: QuestResults }>({ index: 0, results: {} });
  const [summary, setSummary] = useState<QuestSummary | null>(null);
  const [suggestion, setSuggestion] = useState<ProfileSuggestion | null>(null);
  const [mode, setMode] = useState<Mode>('full');
  const [voice, setVoice] = useState(false);
  const [canSpeak] = useState(isSpeechSupported);
  const panelRef = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const pending = useRef<Promise<ProfileSuggestion> | null>(null);
  // Foco en el título de cada pantalla al aparecer (el lector de pantalla la anuncia). Ref estable: con
  // AnimatePresence "wait" el título nuevo se monta al terminar la salida del anterior.
  const headingRef = useCallback((el: HTMLHeadingElement | null) => el?.focus({ preventScroll: true }), []);

  const questionText = (s: QuestionStep) =>
    [t(`questions.${s}.title`), ...(QUESTION_OPTIONS[s] as Opt[]).map((o) => t(`questions.${s}.${o.value}.spoken`)), t('questions.spokenEnd')].join(' ');
  const suggestionText = (s: ProfileSuggestion, m: Mode, v: boolean) =>
    [s.welcome, `${t(`suggestion.${m}.title`)}.`, t(`suggestion.${m}.text`), v ? t('suggestion.voiceSpoken') : '', t('suggestion.spokenEnd')]
      .filter(Boolean)
      .join(' ');
  // Estable: los retos lo usan en sus efectos de montaje (leer la instrucción una sola vez).
  const say = useCallback(
    (text: string) => {
      if (usePrefsStore.getState().narrator) speak(text, { lang: locale, id: 'onboarding' });
    },
    [locale],
  );

  // Toma el relevo de la bienvenida en línea: la oculta y lee la primera pregunta si la voz está encendida.
  useEffect(() => {
    alive.current = true;
    markQuizTaken();
    usePrefsStore.getState().reload();
    const intro = document.getElementById('onboarding');
    if (intro) intro.hidden = true;
    if (usePrefsStore.getState().narrator) {
      const opts = QUESTION_OPTIONS.role.map((o) => t(`questions.role.${o.value}.spoken`));
      speak([t('questions.role.title'), ...opts, t('questions.spokenEnd')].join(' '), { lang: locale, id: 'onboarding' });
    }
    return () => {
      alive.current = false;
    };
  }, [t, locale]);

  const closing = useRef(false);
  const finish = () => {
    closing.current = true;
    stop();
    usePrefsStore.getState().setOnboarded(true);
    window.dispatchEvent(new Event('fieldshift:onboarded'));
    const h = document.querySelector('h1');
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
    onClose();
  };

  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // Esc cierra. El foco no sale del diálogo: si Tab lo lleva afuera, vuelve al primer botón (salvo al cerrar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finishRef.current();
    const onFocus = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (closing.current || !panel || !(e.target instanceof Node) || panel.contains(e.target)) return;
      panel.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
    };
  }, []);

  const go = (next: Screen) => {
    setScreen(next);
    if (next === 'role' || next === 'reading' || next === 'goal') say(questionText(next));
  };

  const step = QUESTION_STEPS.indexOf(screen as QuestionStep);
  const current = step >= 0 ? QUESTION_STEPS[step]! : null;
  // La ciencia (fórmulas, misiones) se muestra a técnicos y a quien quiso todos los datos.
  const detail = answers.reading === 'detail' || answers.role === 'technician';

  const sayOption = (s: QuestionStep, value: string) => say(t('questions.selected', { option: t(`questions.${s}.${value}.label`) }));
  const choose = (s: QuestionStep, value: string) => {
    setAnswers((a) => ({ ...a, [s]: value }));
    // "Escuchando": la voz se enciende de inmediato (quien no lee la necesita para los retos) y anuncia la elección
    // (el onClick de la opción corre antes que este onChange, todavía sin voz).
    if (s === 'reading' && value === 'listen' && canSpeak && !usePrefsStore.getState().narrator) {
      usePrefsStore.getState().setNarrator(true);
      sayOption(s, value);
    }
  };

  const onQuestDone = (results: QuestResults) => {
    setQuest((q) => ({ ...q, results }));
    go('goal');
  };

  /** "Saltar retos": los que faltan quedan como saltados (para repasar) y sigue con la misión. */
  const skipQuest = () => {
    stop();
    const results: QuestResults = { ...quest.results };
    for (const id of GAME_IDS) results[id] ??= 0;
    setQuest((q) => ({ ...q, results }));
    go('goal');
  };

  const showResults = (a: OnboardingAnswers) => {
    const s = summarize(quest.results);
    setSummary(s);
    setScreen('results');
    // La sugerencia se pide ya: mientras la persona mira su perfil, Claude (o las reglas) responde.
    pending.current = requestSuggestion(a, locale, (k) => tRules(k), undefined, s);
    say(profileSpoken(t, a, s));
  };

  const next = () => {
    if (!current || !answers[current]) return;
    if (current === 'role') go('reading');
    else if (current === 'reading') setScreen('quest');
    else showResults(answers as OnboardingAnswers);
  };

  const think = async () => {
    const a = answers as OnboardingAnswers;
    setScreen('thinking');
    say(t('thinking.title'));
    const [s] = await Promise.all([
      pending.current ?? requestSuggestion(a, locale, (k) => tRules(k), undefined, summary ?? undefined),
      // Un instante mínimo en "Preparando…" para que se entienda qué pasó.
      new Promise((r) => setTimeout(r, reduced ? 200 : 600)),
    ]);
    if (!alive.current) return;
    // La voz que la persona ya encendió (en la bienvenida o con el botón de arriba) no se apaga sola: la sugerencia
    // solo puede encenderla. Si no, "Usar así" la apagaba y el resto de la app quedaba en silencio.
    const voiceOn = s.narrator || usePrefsStore.getState().narrator;
    setSuggestion(s);
    setMode(s.mode);
    setVoice(voiceOn);
    setScreen('suggestion');
    if (voiceOn && !usePrefsStore.getState().narrator) usePrefsStore.getState().setNarrator(true);
    say(suggestionText(s, s.mode, voiceOn));
  };

  const toggleVoice = () => {
    const on = !usePrefsStore.getState().narrator;
    usePrefsStore.getState().setNarrator(on);
    if (screen === 'suggestion') setVoice(on);
    if (!on) return stop();
    if (current) speak(questionText(current), { lang: locale, id: 'onboarding' });
    else if (screen === 'results' && summary) speak(profileSpoken(t, answers as OnboardingAnswers, summary), { lang: locale, id: 'onboarding' });
    else if (suggestion) speak(suggestionText(suggestion, mode, on), { lang: locale, id: 'onboarding' });
  };

  const switchMode = () => {
    const m: Mode = mode === 'lite' ? 'full' : 'lite';
    setMode(m);
    if (suggestion) say(`${t(`suggestion.${m}.title`)}. ${t(`suggestion.${m}.text`)}`);
  };

  const accept = () => {
    if (!suggestion) return;
    const prefs = usePrefsStore.getState();
    prefs.setMode(mode);
    prefs.setNarrator(voice);
    useProfileStore.getState().setProfile({
      ...(answers as OnboardingAnswers),
      suggestions: suggestion.suggestions,
      source: suggestion.source,
      ...(summary ? { quest: summary } : {}),
    });
    const first = suggestion.firstStep;
    finish();
    // Después de cerrar: el primer paso abre su propio panel (y lo lee si la voz está encendida).
    setTimeout(() => runFirstStep(first), 60);
  };

  const enter = reduced ? { opacity: 0 } : { opacity: 0, x: 40 };
  const leave = reduced ? { opacity: 0 } : { opacity: 0, x: -40 };
  const stars = totalStars(quest.results);
  const kicker = current
    ? t('step', { n: step + 1, total: QUESTION_STEPS.length })
    : screen === 'quest'
      ? t('games.progress', { n: quest.index + 1, total: GAME_IDS.length })
      : screen === 'results'
        ? t('games.kicker')
        : t('brand');

  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center">
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-title"
        className="panel relative m-0 flex max-h-[96dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl p-4 pb-[calc(var(--safe-bottom)+1rem)] shadow-2xl sm:m-4 sm:max-h-[92dvh] sm:rounded-3xl sm:p-5"
      >
        <header className="flex items-center gap-2">
          <p aria-live="polite" className="flex-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">
            {kicker}
          </p>
          {(screen === 'quest' || screen === 'results' || screen === 'goal') && (
            <span
              className="flex min-h-9 items-center gap-1 rounded-full bg-sun/15 px-2.5 text-sm font-bold text-sun ring-1 ring-sun/40"
              aria-label={t('games.starsTotal', { stars })}
              role="img"
            >
              <Star aria-hidden className="size-4 fill-sun" />
              <span aria-hidden className="tabular-nums">
                {stars}
              </span>
            </span>
          )}
          {canSpeak && (
            <button
              type="button"
              onClick={toggleVoice}
              aria-pressed={narrator}
              aria-label={t('voice.toggle')}
              title={t('voice.toggle')}
              className={clsx(
                'grid size-11 place-items-center rounded-full ring-1',
                narrator ? 'bg-field-500 text-black ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
              )}
            >
              {narrator ? <Volume2 aria-hidden className="size-5" /> : <VolumeX aria-hidden className="size-5" />}
            </button>
          )}
          {(screen === 'role' || screen === 'reading') && (
            <button type="button" onClick={finish} className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-white/10">
              {t('skip')}
            </button>
          )}
          {screen === 'quest' && (
            <button type="button" onClick={skipQuest} className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-white/10">
              {t('games.skipAll')}
            </button>
          )}
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            data-screen={screen}
            initial={enter}
            animate={{ opacity: 1, x: 0 }}
            exit={leave}
            transition={{ duration: reduced ? 0.12 : 0.22, ease: 'easeOut' }}
            className="flex flex-col gap-4"
          >
            {current && (
              <>
                <div>
                  {current === 'goal' && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-sun uppercase">
                      <Star aria-hidden className="size-4 fill-sun" />
                      {t('questions.goal.kicker')}
                    </p>
                  )}
                  <h2 id="quiz-title" ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
                    {t(`questions.${current}.title`)}
                  </h2>
                  <p className="text-sm text-ink-muted">{t(`questions.${current}.subtitle`)}</p>
                </div>
                <div role="radiogroup" aria-labelledby="quiz-title" className="flex flex-col gap-2">
                  {(QUESTION_OPTIONS[current] as Opt[]).map(({ value, Icon }) => {
                    const checked = answers[current] === value;
                    return (
                      <label
                        key={value}
                        className={clsx(
                          'flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl p-3 ring-1 transition-transform',
                          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                          checked ? 'scale-[1.02] bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
                        )}
                      >
                        <input
                          type="radio"
                          name={`quiz-${current}`}
                          value={value}
                          checked={checked}
                          onChange={() => choose(current, value)}
                          onClick={() => sayOption(current, value)}
                          className="sr-only"
                        />
                        <span
                          className={clsx(
                            'grid size-14 shrink-0 place-items-center rounded-2xl ring-1 transition-colors',
                            checked ? 'bg-field-500 text-black ring-field-300' : 'bg-field-500/15 text-field-300 ring-field-500/40',
                          )}
                        >
                          <Icon aria-hidden className="size-8" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg leading-tight font-semibold">{t(`questions.${current}.${value}.label`)}</span>
                          <span className="block text-sm text-ink-muted">{t(`questions.${current}.${value}.hint`)}</span>
                        </span>
                        <span
                          aria-hidden
                          className={clsx(
                            'grid size-7 shrink-0 place-items-center rounded-full ring-2',
                            checked ? 'bg-field-500 text-black ring-field-500' : 'ring-line-strong',
                          )}
                        >
                          {checked && <Check className="size-4" />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {screen === 'quest' && (
              <QuestRunner
                detail={detail}
                reduced={reduced}
                say={say}
                onProgress={(index, results) => setQuest({ index, results })}
                onDone={onQuestDone}
              />
            )}

            {screen === 'results' && summary && <ProfileCard answers={answers as OnboardingAnswers} summary={summary} reduced={reduced} />}

            {screen === 'thinking' && (
              <div role="status" className="flex flex-col items-center gap-4 py-6 text-center">
                <div aria-hidden className="relative grid size-28 place-items-center">
                  <span className="absolute inset-0 rounded-full ring-1 ring-field-500/30" />
                  <span className="size-14 rounded-full bg-sky-glow/30 ring-1 ring-sky-glow/50" />
                  {reduced ? (
                    <Satellite className="absolute -top-1 left-1/2 size-7 -translate-x-1/2 text-sky-glow" />
                  ) : (
                    <motion.span
                      className="absolute inset-0"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
                    >
                      <Satellite className="absolute -top-1 left-1/2 size-7 -translate-x-1/2 text-sky-glow" />
                    </motion.span>
                  )}
                </div>
                <h2 id="quiz-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
                  {t('thinking.title')}
                </h2>
                <p className="text-sm text-ink-muted">{t('thinking.text')}</p>
              </div>
            )}

            {screen === 'suggestion' && suggestion && (
              <>
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-sky-glow uppercase">
                    <Sparkles aria-hidden className="size-4" />
                    {suggestion.source === 'claude' ? t('suggestion.kickerClaude') : t('suggestion.kickerRules')}
                  </p>
                  <h2 id="quiz-title" ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold outline-none">
                    {t('suggestion.title')}
                  </h2>
                </div>
                <p className="rounded-2xl bg-white/5 p-3 text-base ring-1 ring-line">{suggestion.welcome}</p>
                <div aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-field-500/15 p-3 ring-2 ring-field-400">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-field-500/20 text-field-300">
                    {mode === 'lite' ? <Leaf aria-hidden className="size-8" /> : <ChartColumn aria-hidden className="size-8" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold">{t(`suggestion.${mode}.title`)}</span>
                    <span className="block text-sm text-ink-muted">{t(`suggestion.${mode}.text`)}</span>
                  </span>
                </div>
                {canSpeak && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={voice}
                    onClick={() => setVoice((v) => !v)}
                    className={clsx(
                      'flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1',
                      voice ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
                    )}
                  >
                    {voice ? <Volume2 aria-hidden className="size-5 text-field-300" /> : <VolumeX aria-hidden className="size-5" />}
                    <span className="flex-1 font-semibold">{t('suggestion.voice')}</span>
                    <span className="text-sm font-bold">{voice ? t('suggestion.voiceOn') : t('suggestion.voiceOff')}</span>
                  </button>
                )}
                {suggestion.reasons.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">{t('suggestion.why')}</p>
                    <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
                      {suggestion.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-ink-faint">{t('suggestion.note')}</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {current && (
          <div className="flex gap-2">
            {current === 'reading' && (
              <button
                type="button"
                onClick={() => go('role')}
                aria-label={t('back')}
                className="grid size-14 shrink-0 place-items-center rounded-full bg-white/5 ring-1 ring-line hover:bg-white/10"
              >
                <ArrowLeft aria-hidden className="size-6" />
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!answers[current]}
              className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black hover:bg-field-400 disabled:opacity-40"
            >
              {current === 'reading' ? t('games.play') : t('next')}
              <ArrowRight aria-hidden className="size-6" />
            </button>
          </div>
        )}

        {screen === 'results' && (
          <button
            type="button"
            onClick={() => void think()}
            className="sticky bottom-0 z-10 flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black shadow-lg shadow-black/30 hover:bg-field-400"
          >
            {t('results.continue')}
            <ArrowRight aria-hidden className="size-6" />
          </button>
        )}

        {screen === 'suggestion' && suggestion && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={accept}
              className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black hover:bg-field-400"
            >
              <Check aria-hidden className="size-6" />
              {t('suggestion.accept')}
            </button>
            <button
              type="button"
              onClick={switchMode}
              className="flex min-h-12 items-center justify-center rounded-full bg-white/5 px-5 font-semibold ring-1 ring-line hover:bg-white/10"
            >
              {mode === 'lite' ? t('suggestion.switchToFull') : t('suggestion.switchToLite')}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
