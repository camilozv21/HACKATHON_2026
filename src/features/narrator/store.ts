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

// La bienvenida en línea (OnboardingScript, sin React) avisa con un evento cuando lee en voz alta.
if (typeof window !== 'undefined') {
  window.addEventListener('fieldshift:narrator', (e) => {
    useNarratorStore.getState().setSpeaking((e as CustomEvent<boolean>).detail ? 'welcome' : null);
  });
}
