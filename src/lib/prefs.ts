import { create } from 'zustand';

/**
 * Preferencias de la persona (en este dispositivo). Se guardan en localStorage (siempre con try/catch).
 *  - contrast: 'auto' sigue prefers-contrast del sistema; 'high' = modo sol directo; 'normal' lo apaga.
 *  - units: métrico (mm, °C, ha) o imperial (pulgadas, °F, acres).
 *  - mode: 'lite' (modo sencillo: menos datos técnicos, lo importante primero) o 'full' (todo el detalle).
 *  - narrator: el locutor lee en voz alta el panel de región y las respuestas del asistente.
 *  - introVoice: la introducción (bienvenida y retos) se lee sola en voz alta, salvo que la persona haya apagado la
 *    voz (NARRATOR_KEY = '0'). Sin elegir nada, la introducción habla y el resto de la app queda en silencio.
 *  - onboarded: ya respondió (o saltó) la bienvenida y las preguntas de inicio.
 *  - mapMarkers: mostrar en el globo los puntos de fincas de ejemplo y de emisoras (los que pulsan).
 * data-contrast y data-mode se aplican también antes del primer pintado con un script en el <head> (layout).
 * La bienvenida en línea (OnboardingScript) lee y escribe las mismas claves NARRATOR_KEY y ONBOARDED_KEY.
 */
export type Contrast = 'auto' | 'high' | 'normal';
export type Units = 'metric' | 'imperial';
export type Mode = 'lite' | 'full';

export const CONTRAST_KEY = 'fieldshift:contrast';
export const MODE_KEY = 'fieldshift:mode';
export const NARRATOR_KEY = 'fieldshift:narrator';
export const ONBOARDED_KEY = 'fieldshift:onboarded:v2';
const UNITS_KEY = 'fieldshift:units';
const MARKERS_KEY = 'fieldshift:map-markers';

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* modo privado: la preferencia vale solo en esta visita */
  }
}

export function applyContrast(c: Contrast) {
  const root = document.documentElement;
  if (c === 'auto') delete root.dataset.contrast;
  else root.dataset.contrast = c;
}

export function applyMode(m: Mode) {
  const root = document.documentElement;
  if (m === 'lite') root.dataset.mode = 'lite';
  else delete root.dataset.mode;
}

type PrefsState = {
  contrast: Contrast;
  units: Units;
  mode: Mode;
  narrator: boolean;
  introVoice: boolean;
  onboarded: boolean;
  mapMarkers: boolean;
  setContrast: (c: Contrast) => void;
  setUnits: (u: Units) => void;
  setMode: (m: Mode) => void;
  setNarrator: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  setMapMarkers: (v: boolean) => void;
  /** Vuelve a leer lo que la bienvenida en línea pudo escribir sin pasar por este store (voz, introducción vista). */
  reload: () => void;
};

const savedContrast = read(CONTRAST_KEY);
const savedUnits = read(UNITS_KEY);

export const usePrefsStore = create<PrefsState>()((set) => ({
  contrast: savedContrast === 'high' || savedContrast === 'normal' ? savedContrast : 'auto',
  units: savedUnits === 'imperial' ? 'imperial' : 'metric',
  mode: read(MODE_KEY) === 'lite' ? 'lite' : 'full',
  narrator: read(NARRATOR_KEY) === '1',
  introVoice: read(NARRATOR_KEY) !== '0',
  onboarded: read(ONBOARDED_KEY) === '1',
  mapMarkers: read(MARKERS_KEY) !== '0',
  setContrast: (contrast) => {
    write(CONTRAST_KEY, contrast);
    applyContrast(contrast);
    set({ contrast });
  },
  setUnits: (units) => {
    write(UNITS_KEY, units);
    set({ units });
  },
  setMode: (mode) => {
    write(MODE_KEY, mode);
    applyMode(mode);
    set({ mode });
  },
  setNarrator: (narrator) => {
    write(NARRATOR_KEY, narrator ? '1' : '0');
    set({ narrator, introVoice: narrator });
  },
  setOnboarded: (onboarded) => {
    write(ONBOARDED_KEY, onboarded ? '1' : '0');
    set({ onboarded });
  },
  setMapMarkers: (mapMarkers) => {
    write(MARKERS_KEY, mapMarkers ? '1' : '0');
    set({ mapMarkers });
  },
  reload: () => {
    const voice = read(NARRATOR_KEY);
    set({ narrator: voice === '1', introVoice: voice !== '0', onboarded: read(ONBOARDED_KEY) === '1' });
  },
}));

/** Modo sencillo activo (para cambios de estructura; para ocultar detalles basta la variante CSS `lite:`). */
export const useLite = () => usePrefsStore((s) => s.mode === 'lite');
