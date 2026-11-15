'use client';

import clsx from 'clsx';
import { Bean, CloudSun, Satellite, Sprout, Star, Wheat, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { TermIcon } from '@/features/glossary/TermIcon';
import type { GlossaryTerm } from '@/features/glossary/terms';
import type { OnboardingAnswers, QuestLevel, QuestSummary } from '@/lib/api/contract';
import { archetypeKey } from './catalog';
import { useFocusRef } from './ui';

const GOAL_ICONS: Record<OnboardingAnswers['goal'], LucideIcon> = { climate: CloudSun, rotations: Sprout, satellite: Satellite };
const LEVEL_ICONS: Record<QuestLevel, LucideIcon> = { beginner: Bean, intermediate: Sprout, advanced: Wheat };
const LEVEL_N: Record<QuestLevel, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Texto que lee el locutor en la pantalla del perfil. */
export function profileSpoken(t: (k: string, v?: Record<string, string | number>) => string, a: OnboardingAnswers, s: QuestSummary) {
  return t('results.spoken', {
    archetype: t(`results.archetype.${archetypeKey(a)}`),
    level: t(`results.levels.${s.level}`),
    stars: s.stars,
    max: s.maxStars,
  });
}

/**
 * "Tu perfil de campo": la insignia (quién es + qué quiere hacer), el nivel que mostró en los retos (semilla,
 * brote, cosecha), las estrellas y los términos que domina o conviene repasar. Nunca regaña: un nivel bajo solo
 * significa que la app y el asistente explicarán con más calma.
 */
export function ProfileCard({ answers, summary, reduced }: { answers: OnboardingAnswers; summary: QuestSummary; reduced: boolean }) {
  const t = useTranslations('onboarding');
  const tg = useTranslations('glossary');
  const heading = useFocusRef<HTMLHeadingElement>();
  const GoalIcon = GOAL_ICONS[answers.goal];
  const LevelIcon = LEVEL_ICONS[summary.level];

  const chips = (title: string, terms: string[], tone: 'ok' | 'review') =>
    terms.length > 0 && (
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {terms.map((term) => (
            <li
              key={term}
              className={clsx(
                'flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold ring-1',
                tone === 'ok' ? 'bg-field-500/15 ring-field-500/50' : 'bg-sun/10 ring-sun/50',
              )}
            >
              <TermIcon term={term as GlossaryTerm} className="size-4" />
              {tg(`terms.${term}.title`)}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1 text-center">
        <motion.span
          initial={reduced ? false : { scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="relative grid size-24 place-items-center rounded-full bg-gradient-to-br from-field-500/40 to-sky-glow/30 text-field-300 ring-4 ring-field-400"
        >
          <GoalIcon aria-hidden className="size-12" />
          <span className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full bg-sun text-black ring-2 ring-surface-strong">
            <LevelIcon aria-hidden className="size-5" />
          </span>
        </motion.span>
        <p className="mt-1 text-xs font-semibold tracking-wider text-sky-glow uppercase">{t('results.kicker')}</p>
        <h2 id="quiz-title" ref={heading} tabIndex={-1} className="text-2xl leading-tight font-bold outline-none">
          {t(`results.archetype.${archetypeKey(answers)}`)}
        </h2>
        <p className="text-sm text-ink-muted">{t(`results.goalText.${answers.goal}`)}</p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sun/15 text-sun">
          <LevelIcon aria-hidden className="size-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t('results.level', { n: LEVEL_N[summary.level], name: t(`results.levels.${summary.level}`) })}</span>
          <span className="block text-sm text-ink-muted">{t(`results.levelText.${summary.level}`)}</span>
        </span>
        <span
          role="img"
          className="flex shrink-0 items-center gap-1 font-bold tabular-nums"
          aria-label={t('results.stars', { stars: summary.stars, max: summary.maxStars })}
        >
          <Star aria-hidden className="size-5 fill-sun text-sun" />
          <span aria-hidden>
            {summary.stars}/{summary.maxStars}
          </span>
        </span>
      </div>

      {chips(t('results.mastered'), summary.mastered, 'ok')}
      {chips(t('results.review'), summary.review, 'review')}
      <p className="text-xs text-ink-faint">{summary.review.length > 0 ? t('results.note') : t('results.noteAll')}</p>
    </div>
  );
}
