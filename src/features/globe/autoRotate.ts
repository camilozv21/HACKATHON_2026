import type { Map as MapLibreMap } from 'maplibre-gl';
import { prefersReducedMotion } from '@/lib/hooks/useMediaQuery';
import { useGlobeStore } from './store';

type Options = {
  /** Segundos por vuelta completa. */
  secondsPerRevolution?: number;
  /** A partir de este zoom no se rota (el usuario está mirando un lugar). */
  maxZoom?: number;
  /** Reanudar tras este tiempo sin interacción. */
  idleResumeMs?: number;
};

/** Se pasa como eventData en easeTo para que los listeners de moveend ignoren la rotación. */
export const AUTO_ROTATE_EVENT = { autoRotate: true } as const;

/**
 * Rotación lenta del globo: se detiene al primer toque y se reanuda tras 20 s sin interacción.
 * Usa easeTo encadenado de 1 s, así no hay estado de React por frame.
 */
export class AutoRotator {
  private map: MapLibreMap;
  private opts: Required<Options>;
  private enabled: boolean;
  private paused = false;
  private interacting = false;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(map: MapLibreMap, opts: Options = {}) {
    this.map = map;
    this.opts = { secondsPerRevolution: 150, maxZoom: 4, idleResumeMs: 20_000, ...opts };
    this.enabled = !prefersReducedMotion();

    map.on('mousedown', this.onInteract);
    map.on('touchstart', this.onInteract);
    map.on('wheel', this.onInteract);
    map.on('dragstart', this.onInteract);
    map.on('mouseup', this.onRelease);
    map.on('touchend', this.onRelease);
    map.on('moveend', this.onMoveEnd);
  }

  private onInteract = () => {
    this.interacting = true;
    this.stopNow();
    this.scheduleResume();
  };

  private onRelease = () => {
    this.interacting = false;
    this.scheduleResume();
  };

  private onMoveEnd = (e: object) => {
    if (!isAutoRotateEvent(e)) return;
    // map.stop() (de jumpTo/flyTo ajenos) también emite este moveend: se difiere un frame y
    // solo se sigue girando si nadie más está moviendo la cámara.
    requestAnimationFrame(() => {
      if (!this.map.isMoving()) this.spin();
    });
  };

  private scheduleResume() {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.interacting = false;
      this.spin();
    }, this.opts.idleResumeMs);
  }

  private stopNow() {
    if (useGlobeStore.getState().autoRotating) {
      this.map.stop();
      useGlobeStore.getState().setAutoRotating(false);
    }
  }

  /** Detiene la rotación (p. ej. al iniciar un vuelo) y programa la reanudación. */
  interrupt() {
    this.stopNow();
    this.scheduleResume();
  }

  /** Pausa sin reanudar sola (pestaña oculta, panel que tapa el globo). */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.stopNow();
    else this.scheduleResume();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stopNow();
    else this.spin();
  }

  spin = () => {
    if (this.disposed || !this.enabled || this.paused || this.interacting) return;
    if (this.map.getZoom() > this.opts.maxZoom) {
      useGlobeStore.getState().setAutoRotating(false);
      return;
    }
    const center = this.map.getCenter();
    center.lng -= 360 / this.opts.secondsPerRevolution;
    if (!useGlobeStore.getState().autoRotating) useGlobeStore.getState().setAutoRotating(true);
    this.map.easeTo({ center, duration: 1000, easing: (n) => n }, AUTO_ROTATE_EVENT);
  };

  dispose() {
    this.disposed = true;
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.map.off('mousedown', this.onInteract);
    this.map.off('touchstart', this.onInteract);
    this.map.off('wheel', this.onInteract);
    this.map.off('dragstart', this.onInteract);
    this.map.off('mouseup', this.onRelease);
    this.map.off('touchend', this.onRelease);
    this.map.off('moveend', this.onMoveEnd);
  }
}

/** ¿El evento de movimiento proviene de la rotación automática? */
export const isAutoRotateEvent = (e: object) => Boolean((e as { autoRotate?: boolean }).autoRotate);
