/**
 * Señal entre la bienvenida en línea (OnboardingScript, sin React) y el cuestionario React:
 *  window.__fsQuiz = 1 → la persona tocó "Empezar" y espera las preguntas; 2 → el cuestionario ya las mostró.
 * Si el chunk no llega a tiempo, la bienvenida se cierra sola a los 15 s (sigue en 1).
 */
type QuizWindow = Window & { __fsQuiz?: number };

export const QUIZ_EVENT = 'fieldshift:onboarding-questions';

export const quizRequested = () => typeof window !== 'undefined' && (window as QuizWindow).__fsQuiz === 1;

export function markQuizTaken() {
  (window as QuizWindow).__fsQuiz = 2;
}

export function clearQuizFlag() {
  (window as QuizWindow).__fsQuiz = 0;
}
