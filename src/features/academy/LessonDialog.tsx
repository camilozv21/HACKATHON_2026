'use client';

import { ArrowRight, Check, ExternalLink, Lightbulb, Medal, Target, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { SpeakButton } from '@/features/narrator/SpeakButton';
import { AnswerButton, buzz, Feedback, useLater, type Message } from '@/features/onboarding/games/ui';
import { lessonsOf, type Lesson } from './lessons';
import { PhoneSim } from './PhoneSim';
import { useAcademyStore } from './progress';

type Phase = 'learn' | 'quiz' | 'done';

/**
 * Una lección de la AgroAcademy (Radix Dialog: foco atrapado, Esc cierra, se navega con teclado):
 *  1. Qué es y para qué te sirve (con "Escuchar") + el simulador del teléfono, paso a paso.
 *  2. Una pregunta de 3 opciones (si falla, explica y deja intentar otra vez).
 *  3. ¡Lección completa!: insignia si cerró la unidad, "Pruébalo en el globo" (abre la app ahí) y la siguiente.
 */
export function LessonDialog({
  lesson,
  reduced,
  say,
  onClose,
  onNext,
}: {
  lesson: Lesson;
  reduced: boolean;
  say: (text: string) => void;
  onClose: () => void;
  onNext: (() => void) | null;
}) {
  const t = useTranslations('academy');
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>('learn');
  const [tried, setTried] = useState<number[]>([]);
  const [msg, setMsg] = useState<Message>(null);
  const [badge, setBadge] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const later = useLater();
  const k = `lessons.${lesson.id}`;

  const toQuiz = () => {
    setPhase('quiz');
    say(`${t(`${k}.quiz.q`)} ${[0, 1, 2].map((i) => t(`${k}.quiz.a${i}`)).join('. ')}`);
  };

  const answer = (i: number) => {
    if (tried.includes(i) || phase !== 'quiz') return;
    setTried([...tried, i]);
    if (i === lesson.answer) {
      buzz('ok');
      const store = useAcademyStore.getState();
      const unitBefore = lessonsOf(lesson.unit).every((l) => store.lessons.includes(l.id));
      store.completeLesson(lesson.id);
      const unitAfter = lessonsOf(lesson.unit).every((l) => useAcademyStore.getState().lessons.includes(l.id));
      setBadge(!unitBefore && unitAfter);
      setMsg({ tone: 'ok', text: `${t('lesson.right')} ${t(`${k}.quiz.why`)}` });
      say(`${t('lesson.right')} ${t(`${k}.quiz.why`)}`);
      later(
        () => {
          setPhase('done');
          titleRef.current?.focus();
        },
        reduced ? 300 : 1400,
      );
    } else {
      buzz('bad');
      setMsg({ tone: 'bad', text: `${t('lesson.wrong')} ${t(`${k}.quiz.why`)}` });
      say(`${t('lesson.wrong')} ${t(`${k}.quiz.why`)}`);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <Dialog.Overlay className="absolute inset-0 bg-black/60" />
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              titleRef.current?.focus();
            }}
            className="panel relative flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl outline-none sm:m-4 sm:rounded-3xl"
          >
            <header className="flex items-start gap-2 px-4 pt-4 pb-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wider text-field-300 uppercase">{t(`units.${lesson.unit}.title`)}</p>
                <Dialog.Title ref={titleRef} tabIndex={-1} className="text-2xl leading-tight font-bold outline-none">
                  {t(`${k}.title`)}
                </Dialog.Title>
              </div>
              <Dialog.Close
                aria-label={t('lesson.close')}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white/5 ring-1 ring-line hover:bg-white/10"
              >
                <X aria-hidden className="size-5" />
              </Dialog.Close>
            </header>

            <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+1rem)]">
              {phase === 'learn' && (
                <>
                  <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
                    <p className="flex items-start gap-2 text-base">
                      <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-sun" />
                      <span>
                        <b className="block text-xs tracking-wider text-sun uppercase">{t('lesson.what')}</b>
                        {t(`${k}.what`)}
                      </span>
                    </p>
                    <p className="flex items-start gap-2 text-base">
                      <Target aria-hidden className="mt-0.5 size-5 shrink-0 text-field-300" />
                      <span>
                        <b className="block text-xs tracking-wider text-field-300 uppercase">{t('lesson.why')}</b>
                        {t(`${k}.why`)}
                      </span>
                    </p>
                    <SpeakButton id={`academy-${lesson.id}`} text={() => `${t(`${k}.title`)}. ${t(`${k}.what`)} ${t(`${k}.why`)}`} />
                  </div>
                  <PhoneSim lesson={lesson} say={say} onDone={toQuiz} />
                </>
              )}

              {phase === 'quiz' && (
                <>
                  <p className="text-xs font-bold tracking-wider text-sun uppercase">{t('lesson.quizKicker')}</p>
                  <p className="text-lg leading-snug font-bold">{t(`${k}.quiz.q`)}</p>
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                      <AnswerButton
                        key={i}
                        onClick={() => answer(i)}
                        disabled={tried.includes(lesson.answer)}
                        state={tried.includes(i) ? (i === lesson.answer ? 'right' : 'wrong') : 'idle'}
                      >
                        {t(`${k}.quiz.a${i}`)}
                      </AnswerButton>
                    ))}
                  </div>
                  <Feedback message={msg} />
                </>
              )}

              {phase === 'done' && (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <motion.span
                    initial={reduced ? false : { scale: 0.3, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                    className="grid size-20 place-items-center rounded-full bg-field-500 text-black ring-4 ring-field-300/50"
                  >
                    <Check aria-hidden className="size-10" />
                  </motion.span>
                  <p aria-live="polite" className="text-xl font-bold">
                    {t('lesson.done')}
                  </p>
                  {badge && (
                    <p className="flex items-center gap-2 rounded-2xl bg-sun/15 px-3 py-2 font-bold text-sun ring-1 ring-sun/50">
                      <Medal aria-hidden className="size-5" />
                      {t('lesson.badge', { name: t(`units.${lesson.unit}.badge`) })}
                    </p>
                  )}
                  <p className="text-sm text-ink-muted">{t(`${k}.short`)}</p>
                  <a
                    href={`/${locale}${lesson.href}`}
                    className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black hover:bg-field-400"
                  >
                    <ExternalLink aria-hidden className="size-5" />
                    {t('lesson.tryIt')}
                  </a>
                  {onNext ? (
                    <button
                      type="button"
                      onClick={onNext}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white/5 px-5 font-semibold ring-1 ring-line hover:bg-white/10"
                    >
                      {t('lesson.next')}
                      <ArrowRight aria-hidden className="size-5" />
                    </button>
                  ) : (
                    <Dialog.Close className="flex min-h-12 w-full items-center justify-center rounded-full bg-white/5 px-5 font-semibold ring-1 ring-line hover:bg-white/10">
                      {t('lesson.backToAcademy')}
                    </Dialog.Close>
                  )}
                </div>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
