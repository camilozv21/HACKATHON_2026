'use client';

import { useEffect } from 'react';
import { flyTo } from '@/features/globe/camera';
import { useGlobeStore } from '@/features/globe/store';
import { prefersReducedMotion } from '@/lib/hooks/useMediaQuery';
import { useLocationStore } from './store';
import { USER_ZOOM } from './useUserLocation';

/**
 * Intro cinematográfica: el globo aparece y gira INTRO_MS y luego vuela a la zona de la persona en ≤ INTRO_FLY_MS
 * (≤ 4 s en total). Un toque en el globo durante la intro la cancela y deja el globo donde está.
 * Se carga diferido con el globo listo (la detección de ubicación sí va en el JS inicial: LocationBootstrap).
 */
export const INTRO_MS = 1200;
const INTRO_FLY_MS = 2600;

function urlHasCamera() {
  const p = new URLSearchParams(window.location.search);
  return p.has('field') || (p.has('lat') && p.has('lon'));
}

export default function IntroFlight() {
  // 2) Vuelo a la persona cuando el globo está listo y hay ubicación.
  useEffect(() => {
    if (urlHasCamera()) {
      useLocationStore.getState().markFlown();
      return;
    }

    let introDone = false;
    let userInteracted = false;
    let flownAccuracy: 'ip' | 'precise' | null = null;
    let introTimer: ReturnType<typeof setTimeout> | null = null;

    const tryFly = () => {
      const loc = useLocationStore.getState();
      if (!introDone || useGlobeStore.getState().status !== 'ready') return;
      const target = loc.precise ?? loc.coarse;
      if (!target) return;
      const accuracy = loc.precise ? 'precise' : 'ip';
      // Si la persona pidió la ubicación con un toque, ese flujo ya hizo el vuelo.
      if (loc.precise?.origin === 'user') {
        flownAccuracy = 'precise';
        return;
      }
      // Primer vuelo, o refinamiento IP → precisa si la persona aún no ha tocado el globo.
      if (flownAccuracy === accuracy || (flownAccuracy && userInteracted)) return;
      flownAccuracy = accuracy;
      loc.markFlown();
      flyTo({ lng: target.lon, lat: target.lat, zoom: USER_ZOOM[accuracy] }, { maxMs: flownAccuracy === 'ip' || !userInteracted ? INTRO_FLY_MS : undefined });
    };

    const startIntro = () => {
      if (introTimer) return;
      introTimer = setTimeout(
        () => {
          introDone = true;
          tryFly();
        },
        prefersReducedMotion() ? 0 : INTRO_MS,
      );
    };

    // La intro cuenta desde el primer render completo del globo (evento idle), no desde que existe.
    const onGlobeReady = () => {
      const map = useGlobeStore.getState().map;
      if (!map) return;
      map.once('dragstart', () => (userInteracted = true));
      // Un toque durante la intro la cancela (no volamos encima de lo que la persona quiere mirar).
      const cancel = () => {
        if (introDone) return;
        userInteracted = true;
        introDone = true;
        if (introTimer) clearTimeout(introTimer);
        flownAccuracy = useLocationStore.getState().precise ? 'precise' : 'ip';
        useLocationStore.getState().markFlown();
      };
      map.getCanvasContainer().addEventListener('pointerdown', cancel, { once: true, passive: true });
      if (map.loaded() && map.areTilesLoaded()) startIntro();
      else map.once('idle', startIntro);
    };
    const unsubGlobe = useGlobeStore.subscribe((s, prev) => {
      if (s.status === 'ready' && prev.status !== 'ready') onGlobeReady();
    });
    if (useGlobeStore.getState().status === 'ready') onGlobeReady();

    const unsubLoc = useLocationStore.subscribe((s, prev) => {
      if (s.coarse !== prev.coarse || s.precise !== prev.precise) tryFly();
    });

    return () => {
      unsubGlobe();
      unsubLoc();
      if (introTimer) clearTimeout(introTimer);
    };
  }, []);

  return null;
}
