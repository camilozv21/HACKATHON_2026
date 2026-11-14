import { create } from 'zustand';

/** Contexto que otras partes de la app pasan al chat (p. ej. "Preguntarle al asistente sobre esta región"). */
export type AgentContext = {
  openRegion?: { id: string; name: string | null; lat: number; lon: number };
  fieldId?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'ok' | 'error';
  sources?: { dataset: string; date?: string; url?: string }[];
  suggestions?: string[];
  /** Cámara antes de que el agente moviera el globo ("Volver a donde estaba"). */
  previous?: { lng: number; lat: number; zoom: number };
  /** Enlace al informe agroclimático que preparó el agente (se abre en otra pestaña). */
  report?: string;
};

const STORAGE_KEY = 'fieldshift:chat:v1';

function save(sessionId: string, messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, messages }));
  } catch {
    // sin sessionStorage: el historial vive solo en memoria
  }
}

function newSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type AgentUiState = {
  /** Panel de conversación expandido (la barra siempre está visible). */
  expanded: boolean;
  /** Minimizado temporalmente mientras el globo vuela por una acción del agente. */
  flying: boolean;
  /** Pregunta pre-escrita que se envía al abrir. */
  pendingPrompt: string | null;
  /** Abrir directamente dictando por voz. */
  voiceRequested: boolean;
  context: AgentContext;
  /** Respuesta en curso: la radio baja el volumen (ducking). */
  busy: boolean;
  sessionId: string;
  messages: ChatMessage[];
  setExpanded: (v: boolean) => void;
  setFlying: (v: boolean) => void;
  openWith: (prompt: string | null, context?: AgentContext) => void;
  requestVoice: () => void;
  consumeVoice: () => boolean;
  consumePrompt: () => string | null;
  setBusy: (v: boolean) => void;
  addMessage: (m: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
  resetConversation: () => void;
  hydrate: () => void;
};

export const useAgentStore = create<AgentUiState>()((set, get) => ({
  expanded: false,
  flying: false,
  pendingPrompt: null,
  voiceRequested: false,
  context: {},
  busy: false,
  sessionId: '',
  messages: [],
  setExpanded: (expanded) => set({ expanded }),
  setFlying: (flying) => set({ flying }),
  openWith: (pendingPrompt, context) =>
    set((s) => ({ expanded: true, pendingPrompt, context: { ...s.context, ...(context ?? {}) } })),
  requestVoice: () => set({ expanded: true, voiceRequested: true }),
  consumeVoice: () => {
    const v = get().voiceRequested;
    if (v) set({ voiceRequested: false });
    return v;
  },
  consumePrompt: () => {
    const p = get().pendingPrompt;
    set({ pendingPrompt: null });
    return p;
  },
  setBusy: (busy) => set({ busy }),
  addMessage: (m) => {
    const messages = [...get().messages, m].slice(-40);
    set({ messages });
    save(get().sessionId, messages);
  },
  patchMessage: (id, patch) => {
    const messages = get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
    set({ messages });
    save(get().sessionId, messages);
  },
  resetConversation: () => {
    const sessionId = newSessionId();
    set({ messages: [], sessionId, context: {} });
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignorar
    }
  },
  hydrate: () => {
    if (get().sessionId) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const j = JSON.parse(raw) as { sessionId?: string; messages?: ChatMessage[] };
        if (j.sessionId && Array.isArray(j.messages)) {
          set({ sessionId: j.sessionId, messages: j.messages });
          return;
        }
      }
    } catch {
      // datos corruptos o sin acceso: se empieza de cero
    }
    set({ sessionId: newSessionId() });
  },
}));
