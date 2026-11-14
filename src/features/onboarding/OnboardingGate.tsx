'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { clearQuizFlag, QUIZ_EVENT, quizRequested } from './gateFlag';

const RoleQuiz = dynamic(() => import('./RoleQuiz'), { ssr: false });

/**
 * Monta las preguntas de inicio cuando la bienvenida en línea las pide ("Empezar"). Vive en FirstLayer (diferido):
 * no suma al JS inicial. Mientras la bienvenida está abierta precarga el chunk para que el relevo sea inmediato.
 */
export function OnboardingGate() {
  const [active, setActive] = useState(quizRequested);

  useEffect(() => {
    const on = () => setActive(true);
    window.addEventListener(QUIZ_EVENT, on);
    // Por si tocó "Empezar" entre el primer render y esta suscripción.
    const id = setTimeout(() => quizRequested() && on(), 0);
    const intro = document.getElementById('onboarding');
    if (intro && !intro.hidden) void import('./RoleQuiz');
    return () => {
      clearTimeout(id);
      window.removeEventListener(QUIZ_EVENT, on);
    };
  }, []);

  if (!active) return null;
  return (
    <RoleQuiz
      onClose={() => {
        clearQuizFlag();
        setActive(false);
      }}
    />
  );
}
