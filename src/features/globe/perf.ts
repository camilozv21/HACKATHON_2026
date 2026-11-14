/**
 * Perfil del dispositivo y la red para ajustar el globo en móviles de gama media y conexiones lentas.
 * Ver docs/performance.md.
 */
type NavigatorExtras = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

export type DeviceProfile = {
  pixelRatio: number;
  lowEnd: boolean;
  /** Ahorro de datos del sistema o red 2G: solo GIBS, baja resolución. */
  saveData: boolean;
  maxTileCacheSize: number;
};

export function getDeviceProfile(): DeviceProfile {
  const nav = navigator as NavigatorExtras;
  const dpr = window.devicePixelRatio || 1;
  const lowEnd =
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ||
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4);
  const slowNet = /(^|-)2g$/.test(nav.connection?.effectiveType ?? '');
  const saveData = Boolean(nav.connection?.saveData) || slowNet;
  const forced = new URLSearchParams(window.location.search).get('savedata') === '1';

  return {
    pixelRatio: saveData || forced ? 1 : Math.min(dpr, lowEnd ? 1.5 : 2),
    lowEnd,
    saveData: saveData || forced,
    // Tiles en memoria por fuente: suficiente para volver atrás sin recargar, sin agotar la RAM.
    maxTileCacheSize: lowEnd ? 120 : 280,
  };
}

/** ¿El navegador puede crear un contexto WebGL? (sin él no hay globo 3D). */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const ok = Boolean(gl);
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export const isDebug = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
