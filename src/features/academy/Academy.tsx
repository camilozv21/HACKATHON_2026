'use client';

import clsx from 'clsx';
import {
  Accessibility,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Earth,
  Flame,
  GraduationCap,
  History,
  Layers,
  LocateFixed,
  Medal,
  MessageCircle,
  PanelRight,
  Play,
  Radio,
  Route,
  ShieldAlert,
  SlidersHorizontal,
  Sprout,
  Star,
  Store,
  Trophy,
  Repeat,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { speak, type NarratorLang } from '@/features/narrator/narrator';
import { GAME_ICONS } from '@/features/onboarding/games/registry';
import type { GameId } from '@/features/onboarding/games/catalog';
import { useProfileStore } from '@/features/onboarding/profile';
import { usePrefsStore } from '@/lib/prefs';
import { LESSONS, lessonsOf, nextLesson, PRACTICE_GAMES, UNIT_IDS, type Lesson, type UnitId } from './lessons';
import { LessonDialog } from './LessonDialog';
import { PracticeDialog } from './PracticeDialog';
import { practiceStars, useAcademyStore } from './progress';

const LESSON_ICONS: Record<string, LucideIcon> = {
  globe: Earth,
  location: LocateFixed,
  region: PanelRight,
  layers: Layers,
  time: History,
  events: Flame,
  risk: ShieldAlert,
  field: Sprout,
  priorities: SlidersHorizontal,
  rotations: Repeat,
  plan: CalendarDays,
  market: Store,
  agent: MessageCircle,
  radio: Radio,
  access: Accessibility,
  points: Trophy,
};
const UNIT_ICONS: Record<UnitId | 'practice', LucideIcon> = { globe: Earth, nasa: Layers, farm: Sprout, help: MessageCircle, practice: BookOpen };

type Open = { kind: 'lesson'; lesson: Lesson } | { kind: 'game'; id: GameId; detail: boolean } | null;

/** "La ciencia" en los retos: técnicos, quien quiso todos los datos o quien usa el modo completo. */
function wantsDetail() {
  const p = useProfileStore.getState().profile;
  return p?.reading === 'detail' || p?.role === 'technician' || usePrefsStore.getState().mode === 'full';
}

/**
 * AgroAcademy (cliente): el avance (lecciones, estrellas e insignias), el recorrido guiado de la app, las 4 unidades
 * con sus lecciones interactivas y la práctica de los 7 retos del glosario. El avance vive en este teléfono.
 */
export default function Academy() {
  const t = useTranslations('academy');
  const tg = useTranslations('onboarding.games');
  const locale = useLocale();
  const reduced = useReducedMotion() ?? false;
  const loaded = useAcademyStore((s) => s.loaded);
  const lessonsDone = useAcademyStore((s) => s.lessons);
  const games = useAcademyStore((s) => s.games);
  const [open, setOpen] = useState<Open>(null);
  const done = new Set(lessonsDone);
  const stars = practiceStars(games);
  const total = LESSONS.length + PRACTICE_GAMES.length;
  const finished = lessonsDone.length + PRACTICE_GAMES.filter((g) => games[g]).length;
  const next = nextLesson(done);

  // Después de hidratar: el avance guardado y las preferencias (voz).
  useEffect(() => {
    useAcademyStore.getState().load();
    usePrefsStore.getState().reload();
  }, []);

  const say = useCallback(
    (text: string) => {
      if (usePrefsStore.getState().narrator) speak(text, { lang: locale as NarratorLang, id: 'academy' });
    },
    [locale],
  );

  const openLesson = (lesson: Lesson) => setOpen({ kind: 'lesson', lesson });
  const afterLesson = (lesson: Lesson) => {
    const n = LESSONS[LESSONS.indexOf(lesson) + 1];
    return n ? () => setOpen({ kind: 'lesson', lesson: n }) : null;
  };
  const unitDone = (u: UnitId) => lessonsOf(u).every((l) => done.has(l.id));
  const practiceDone = PRACTICE_GAMES.every((g) => games[g]);

  return (
    <>
      {/* Avance */}
      <section aria-labelledby="acad-progress" className="flex flex-col gap-3 rounded-3xl bg-gradient-to-br from-field-500/20 to-sky-glow/10 p-4 ring-1 ring-field-500/40">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-field-500 text-black">
            <GraduationCap aria-hidden className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="acad-progress" className="text-lg font-bold">
              {t('progress.title')}
            </h2>
            <p className="text-sm text-ink-muted" aria-live="polite">
              {loaded ? t('progress.count', { done: finished, total }) : t('progress.loading')}
            </p>
          </div>
          <span
            role="img"
            aria-label={t('progress.stars', { stars, max: PRACTICE_GAMES.length * 3 })}
            className="flex shrink-0 items-center gap-1 rounded-full bg-sun/15 px-2.5 py-1 font-bold text-sun ring-1 ring-sun/40"
          >
            <Star aria-hidden className="size-4 fill-sun" />
            <span aria-hidden className="tabular-nums">
              {stars}
            </span>
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('progress.title')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={finished}
          className="h-3 overflow-hidden rounded-full bg-white/10"
        >
          <div className="h-full rounded-full bg-field-500 transition-[width] duration-700" style={{ width: `${(finished / total) * 100}%` }} />
        </div>
        <ul aria-label={t('progress.badges')} className="flex flex-wrap gap-1.5">
          {[...UNIT_IDS, 'practice' as const].map((u) => {
            const got = u === 'practice' ? practiceDone : unitDone(u);
            return (
              <li
                key={u}
                className={clsx(
                  'flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold ring-1',
                  got ? 'bg-sun/20 text-sun ring-sun/60' : 'bg-white/5 text-ink-muted ring-line',
                )}
              >
                <Medal aria-hidden className="size-4" />
                {t(`units.${u}.badge`)}
                <span className="sr-only">{got ? t('progress.badgeGot') : t('progress.badgeTodo')}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          {next ? (
            <button
              type="button"
              onClick={() => openLesson(next)}
              className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black hover:bg-field-400"
            >
              <Play aria-hidden className="size-5" />
              {lessonsDone.length === 0 ? t('progress.start') : t('progress.continue')}
            </button>
          ) : (
            <p className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-sun/15 px-5 font-bold text-sun">
              <Trophy aria-hidden className="size-5" />
              {t('progress.allLessons')}
            </p>
          )}
          <a
            href={`/${locale}?demo=1`}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white/5 px-5 font-semibold ring-1 ring-line hover:bg-white/10"
          >
            <Route aria-hidden className="size-5 text-sky-glow" />
            {t('tour')}
          </a>
        </div>
      </section>

      {/* Unidades */}
      {UNIT_IDS.map((u, ui) => {
        const UnitIcon = UNIT_ICONS[u];
        const list = lessonsOf(u);
        const count = list.filter((l) => done.has(l.id)).length;
        return (
          <section key={u} aria-labelledby={`unit-${u}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/5 text-field-300 ring-1 ring-line">
                <UnitIcon aria-hidden className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('unitN', { n: ui + 1 })}</p>
                <h2 id={`unit-${u}`} className="text-xl leading-tight font-bold">
                  {t(`units.${u}.title`)}
                </h2>
              </div>
              <span className="text-sm font-bold text-ink-muted tabular-nums">{t('unitCount', { done: count, total: list.length })}</span>
            </div>
            <p className="text-sm text-ink-muted">{t(`units.${u}.text`)}</p>
            <ul className="flex flex-col gap-2">
              {list.map((l) => {
                const Icon = LESSON_ICONS[l.id] ?? BookOpen;
                const isDone = done.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => openLesson(l)}
                      className={clsx(
                        'flex min-h-16 w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors',
                        isDone ? 'bg-field-500/10 ring-field-500/40 hover:bg-field-500/15' : 'bg-white/5 ring-line hover:bg-white/10',
                        next?.id === l.id && 'ring-2 ring-sun/70',
                      )}
                    >
                      <span
                        className={clsx(
                          'grid size-11 shrink-0 place-items-center rounded-xl',
                          isDone ? 'bg-field-500 text-black' : 'bg-field-500/15 text-field-300',
                        )}
                      >
                        {isDone ? <Check aria-hidden className="size-6" /> : <Icon aria-hidden className="size-6" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t(`lessons.${l.id}.title`)}</span>
                        <span className="block text-sm text-ink-muted">{t(`lessons.${l.id}.short`)}</span>
                      </span>
                      <span className={clsx('shrink-0 text-xs font-bold', isDone ? 'text-field-300' : 'text-ink-muted')}>
                        {isDone ? t('status.done') : t('status.todo')}
                      </span>
                      <ArrowRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* Práctica: los 7 retos del glosario */}
      <section aria-labelledby="unit-practice" className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/5 text-sun ring-1 ring-line">
            <BookOpen aria-hidden className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('unitN', { n: UNIT_IDS.length + 1 })}</p>
            <h2 id="unit-practice" className="text-xl leading-tight font-bold">
              {t('units.practice.title')}
            </h2>
          </div>
          <span className="text-sm font-bold text-ink-muted tabular-nums">
            {t('unitCount', { done: PRACTICE_GAMES.filter((g) => games[g]).length, total: PRACTICE_GAMES.length })}
          </span>
        </div>
        <p className="text-sm text-ink-muted">{t('units.practice.text')}</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRACTICE_GAMES.map((g) => {
            const Icon = GAME_ICONS[g];
            const best = games[g] ?? 0;
            return (
              <li key={g}>
                <button
                  type="button"
                  onClick={() => setOpen({ kind: 'game', id: g, detail: wantsDetail() })}
                  aria-label={`${tg(`${g}.name`)}. ${best ? t('practice.best', { stars: best }) : t('practice.notPlayed')}`}
                  className="flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/5 p-3 text-center ring-1 ring-line hover:bg-white/10"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-sun/15 text-sun">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <span className="text-sm leading-tight font-semibold">{tg(`${g}.name`)}</span>
                  <span aria-hidden className="flex gap-0.5">
                    {[1, 2, 3].map((n) => (
                      <Star key={n} className={clsx('size-4', n <= best ? 'fill-sun text-sun' : 'text-ink-faint')} />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {open?.kind === 'lesson' && (
        <LessonDialog
          key={open.lesson.id}
          lesson={open.lesson}
          reduced={reduced}
          say={say}
          onClose={() => setOpen(null)}
          onNext={afterLesson(open.lesson)}
        />
      )}
      {open?.kind === 'game' && (
        <PracticeDialog key={open.id} id={open.id} detail={open.detail} reduced={reduced} say={say} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
