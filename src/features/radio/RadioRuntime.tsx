'use client';

import type { Marker } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/features/agent/store';
import { onFlyStart } from '@/features/globe/camera';
import { useGlobeStore } from '@/features/globe/store';
import { getUserLocation } from '@/features/location/store';
import { useNarratorStore } from '@/features/narrator/store';
import { RadioStationsResponse } from '@/lib/api/contract';
import { usePrefsStore } from '@/lib/prefs';
import { radioSteering } from './cues';
import { radioEngine } from './engine';
import { useRadioLive } from './live';
import { ensureProgram } from './programClient';
import { currentSegment, useRadioStore } from './store';
import { markTuned, stationFor, tuneTo } from './tune';

/** La radio está contando su programa y moviendo el mapa: sus propios vuelos no cambian de emisora. */
function radioDriving() {
  if (radioSteering()) return true;
  const live = useRadioLive.getState();
  return radioEngine.isPlaying() && live.follow && !live.held && Boolean(currentSegment()?.topic);
}

/**
 * Emisoras en el globo (puntos con ondas que pulsan) y sintonía: la emisora es la de lo que está bajo la mira
 * (fija, de la zona o la nacional; ver tune.ts). Al cambiar de emisora suena una estática breve; si ya estaba
 * sonando, la nueva sigue sola. Mientras suena el programa del día, la radio mueve el mapa (cues.ts) hasta que la
 * persona lo toma.
 */
export default function RadioRuntime() {
  const t = useTranslations('radio');
  const locale = useLocale() === 'en' ? 'en' : 'es';
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const markers = useRef<Marker[]>([]);

  // Emisoras (una vez).
  useEffect(() => {
    const loc = getUserLocation();
    const q = loc ? `?lat=${loc.lat.toFixed(2)}&lon=${loc.lon.toFixed(2)}` : '';
    fetch(`/api/radio/stations${q}`)
      .then((r) => r.json())
      .then((j) => useRadioStore.getState().setStations(RadioStationsResponse.parse(j).stations))
      .catch(() => useRadioStore.getState().setStatus('error'));
  }, []);

  // El motor pide el programa al empezar una emisora y se identifica en voz mientras llega.
  useEffect(() => {
    radioEngine.setHooks({
      beforePlay: () => ensureProgram(),
      ident: () => {
        const st = useRadioStore.getState().station;
        return st ? t('ident', { name: st.name, freq: st.frequencyLabel }) : null;
      },
    });
    return () => radioEngine.setHooks({});
  }, [t]);

  // Puntos de emisora en el globo (se ocultan desde Ajustes; la radio sigue sonando en el mini reproductor).
  const stations = useRadioStore((s) => s.stations);
  const show = usePrefsStore((s) => s.mapMarkers);
  useEffect(() => {
    markers.current.forEach((m) => {
      m.getElement().style.display = show ? '' : 'none';
    });
  }, [show]);
  useEffect(() => {
    if (!map || !ready || !stations.length) return;
    let cancelled = false;
    (async () => {
      const { Marker } = await import('maplibre-gl');
      if (cancelled) return;
      for (const s of stations) {
        if (s.lat == null || s.lon == null) continue;
        const el = document.createElement('div');
        el.className = 'radio-marker';
        el.dataset.stationId = s.id;
        el.style.display = usePrefsStore.getState().mapMarkers ? '' : 'none';
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', t('stationAria', { name: s.name, freq: s.frequencyLabel }));
        el.innerHTML = '<span class="radio-marker__wave"></span><span class="radio-marker__wave radio-marker__wave--2"></span><span class="radio-marker__dot"></span>';
        markers.current.push(new Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([s.lon, s.lat]).addTo(map));
      }
      const tuned = useRadioStore.getState().tunedId;
      if (tuned) markTuned(tuned);
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
    };
  }, [map, ready, stations, t]);

  // Sintonía: cada vez que cambia lo que está bajo la mira (fin de un movimiento y, luego, el nombre del lugar).
  useEffect(() => {
    if (!stations.length) return;
    const retune = () => {
      if (radioDriving()) return;
      const g = useGlobeStore.getState();
      // Al abrir con una posición en la URL aún no hubo moveend: se usa la cámara (sin nombre de lugar todavía).
      const mc = g.map?.getCenter();
      const stale = mc && Math.abs(mc.lat - g.center.lat) + Math.abs(mc.lng - g.center.lng) > 0.01;
      const center = stale && g.map ? { lng: mc.lng, lat: mc.lat, zoom: g.map.getZoom(), label: null, labelStatus: 'loading' as const } : g.center;
      const target = stationFor(stations, center, locale);
      if (!target || target === 'wait' || target.id === useRadioStore.getState().tunedId) return;
      void tuneTo(target, { resume: radioEngine.isPlaying() });
    };
    retune();
    return useGlobeStore.subscribe((s, prev) => {
      if (s.center !== prev.center) retune();
    });
  }, [stations, locale, map, ready]);

  // La persona toma el mapa mientras la radio lo mueve: las pistas esperan ("Seguir a la radio").
  useEffect(() => {
    const hold = () => {
      if (radioSteering() || !radioEngine.isPlaying() || !currentSegment()?.topic) return;
      const live = useRadioLive.getState();
      if (live.follow && !live.held) live.setHeld(true);
    };
    const offFly = onFlyStart(hold);
    if (!map) return () => void offFly();
    const onGesture = (e: { originalEvent?: unknown }) => e.originalEvent && hold();
    const events = ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const;
    events.forEach((ev) => map.on(ev, onGesture));
    return () => {
      offFly();
      events.forEach((ev) => map.off(ev, onGesture));
    };
  }, [map]);

  // Baja el volumen mientras el asistente responde o el locutor lee. Si la radio suena con la voz del teléfono
  // (misma speechSynthesis que el locutor), se pausa: las dos voces no pueden sonar a la vez.
  useEffect(() => {
    const duck = () => radioEngine.duck(useAgentStore.getState().busy || useNarratorStore.getState().speakingId !== null);
    const offAgent = useAgentStore.subscribe((s, prev) => s.busy !== prev.busy && duck());
    const offNarrator = useNarratorStore.subscribe((s, prev) => {
      if ((s.speakingId === null) === (prev.speakingId === null)) return;
      if (s.speakingId && useRadioStore.getState().usingVoice && radioEngine.isPlaying()) radioEngine.pause();
      duck();
    });
    return () => {
      offAgent();
      offNarrator();
    };
  }, []);

  useEffect(() => () => radioEngine.dispose(), []);

  return null;
}
