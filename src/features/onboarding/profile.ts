import { z } from 'zod';
import { create } from 'zustand';
import { OnboardingAnswers, type AgentProfile } from '@/lib/api/contract';
import { usePrefsStore } from '@/lib/prefs';

/**
 * Perfil de la persona (preguntas de inicio): rol, objetivo, cómo prefiere la información y las preguntas que la IA
 * sugirió para empezar el chat. Se recuerda en este teléfono. El modo y la voz viven en prefs (se cambian en Ajustes).
 */
const STORAGE_KEY = 'fieldshift:profile:v1';

export const SavedProfile = OnboardingAnswers.extend({
  suggestions: z.array(z.string().max(160)).max(3),
  source: z.enum(['claude', 'rules']),
});
export type Profile = z.infer<typeof SavedProfile>;

function readSaved(): Profile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = SavedProfile.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function save(profile: Profile | null) {
  try {
    if (profile) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* modo privado o almacenamiento lleno: el perfil vale solo en esta visita */
  }
}

type ProfileState = {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
};

export const useProfileStore = create<ProfileState>()((set) => ({
  profile: readSaved(),
  setProfile: (profile) => {
    save(profile);
    set({ profile });
  },
}));

/** Lo que el agente recibe para adaptar sus respuestas: rol (si respondió), modo y si se leerán en voz alta. */
export function agentProfile(): AgentProfile {
  const { mode, narrator } = usePrefsStore.getState();
  const role = useProfileStore.getState().profile?.role;
  return role ? { role, mode, narrator } : { mode, narrator };
}
