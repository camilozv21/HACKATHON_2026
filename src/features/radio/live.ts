/**
 * Estado "en vivo" de la radio: la frase que suena, si la radio mueve el mapa y el programa del día.
 * Va aparte de store.ts porque ese módulo entra en el JS inicial (lo usa el Dock); este solo en los chunks diferidos.
 */
import { create } from 'zustand';

const FOLLOW_KEY = 'fieldshift:radio-follow';

function readFollow() {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== '0';
  } catch {
    return true;
  }
}

export type ProgramState = {
  stationId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Quién escribió el guion que suena: Claude o las plantillas. */
  by: 'claude' | 'rules' | null;
  /** Claude todavía está escribiendo la versión con voz de locutor. */
  pending: boolean;
};

const IDLE: ProgramState = { stationId: null, status: 'idle', by: null, pending: false };

type LiveState = {
  /** Frase del segmento que suena (subtítulos y pistas sobre el globo). */
  sentence: number;
  /** La radio mueve el mapa mientras habla (preferencia de la persona). */
  follow: boolean;
  /** La persona tomó el mapa: las pistas esperan hasta "Seguir a la radio" o hasta cambiar de emisora. */
  held: boolean;
  program: ProgramState;
  setSentence: (i: number) => void;
  setFollow: (v: boolean) => void;
  setHeld: (v: boolean) => void;
  setProgram: (p: Partial<ProgramState>) => void;
  /** Nueva emisora: frase 0, pistas activas y programa por pedir (si no es el de esta emisora). */
  resetFor: (stationId: string) => void;
};

export const useRadioLive = create<LiveState>()((set) => ({
  sentence: 0,
  follow: readFollow(),
  held: false,
  program: IDLE,
  setSentence: (sentence) => set({ sentence }),
  setFollow: (follow) => {
    try {
      localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0');
    } catch {
      // Sin almacenamiento: vale para esta visita.
    }
    set(follow ? { follow, held: false } : { follow });
  },
  setHeld: (held) => set({ held }),
  setProgram: (p) => set((s) => ({ program: { ...s.program, ...p } })),
  resetFor: (stationId) => set((s) => ({ sentence: 0, held: false, program: s.program.stationId === stationId ? s.program : IDLE })),
}));
