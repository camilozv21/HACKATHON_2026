import type { AutoRotator } from './autoRotate';

/** Objetos imperativos del globo que no deben vivir en estado de React. */
let rotator: AutoRotator | null = null;

/** Motivos activos para pausar la rotación automática (pestaña oculta, panel que tapa el globo…). */
const pauseReasons = new Set<string>();

function applyPause() {
  rotator?.setPaused(pauseReasons.size > 0);
}

export const globeRuntime = {
  setRotator(r: AutoRotator | null) {
    rotator = r;
    applyPause();
  },
  get rotator() {
    return rotator;
  },
  setPaused(reason: string, paused: boolean) {
    if (paused) pauseReasons.add(reason);
    else pauseReasons.delete(reason);
    applyPause();
  },
};

/** Los paneles que tapan la mayor parte del globo (sheet expandido, chat) llaman a esto. */
export function setGlobeOccluded(by: string, occluded: boolean) {
  globeRuntime.setPaused(`occluded:${by}`, occluded);
}
