import { create } from 'zustand';

/**
 * Qué está leyendo el locutor ahora (null = en silencio). La radio lo escucha para bajar el volumen o pausar su
 * propia voz de respaldo (las dos comparten speechSynthesis). Si el locutor está encendido vive en prefs.
 */
type NarratorState = {
  speakingId: string | null;
  setSpeaking: (id: string | null) => void;
};

export const useNarratorStore = create<NarratorState>()((set) => ({
  speakingId: null,
  setSpeaking: (speakingId) => set({ speakingId }),
}));

// La bienvenida en línea (OnboardingScript, sin React) avisa con un evento cuando lee en voz alta. Al callar solo
// borra su propia lectura: si la cortó la primera pregunta del inicio, esa sigue marcada.
if (typeof window !== 'undefined') {
  window.addEventListener('fieldshift:narrator', (e) => {
    const s = useNarratorStore.getState();
    if ((e as CustomEvent<boolean>).detail) s.setSpeaking('welcome');
    else if (s.speakingId === 'welcome') s.setSpeaking(null);
  });
}
