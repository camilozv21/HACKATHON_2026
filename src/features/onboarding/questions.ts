import { BookOpen, ClipboardList, CloudSun, Ear, Image, Satellite, Sprout, Tractor, type LucideIcon } from 'lucide-react';
import type { OnboardingAnswers } from '@/lib/api/contract';

/**
 * Las 3 preguntas de inicio, en orden: quién eres (el personaje), cómo quieres jugar (escuchar, poco texto o todos
 * los datos) y, después de los retos, tu primera misión. Cada opción tiene un ícono grande: se puede responder sin
 * leer.
 */
export const QUESTION_STEPS = ['role', 'reading', 'goal'] as const;
export type QuestionStep = (typeof QUESTION_STEPS)[number];

type Option<K extends QuestionStep> = { value: OnboardingAnswers[K]; Icon: LucideIcon };

export const QUESTION_OPTIONS: { [K in QuestionStep]: Option<K>[] } = {
  role: [
    { value: 'farmer', Icon: Tractor },
    { value: 'technician', Icon: ClipboardList },
  ],
  reading: [
    { value: 'listen', Icon: Ear },
    { value: 'little', Icon: Image },
    { value: 'detail', Icon: BookOpen },
  ],
  goal: [
    { value: 'climate', Icon: CloudSun },
    { value: 'rotations', Icon: Sprout },
    { value: 'satellite', Icon: Satellite },
  ],
};
