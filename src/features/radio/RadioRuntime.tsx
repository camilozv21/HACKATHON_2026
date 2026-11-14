'use client';

import type { Marker } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/features/agent/store';
import { isAutoRotateEvent } from '@/features/globe/autoRotate';
import { useGlobeStore } from '@/features/globe/store';
import { getUserLocation } from '@/features/location/store';
import { useNarratorStore } from '@/features/narrator/store';
import { RadioSegmentsResponse, RadioStationsResponse, type RadioStation } from '@/lib/api/contract';
import { haversineKm } from '@/lib/geo';
import { usePrefsStore } from '@/lib/prefs';
import { radioEngine } from './engine';
import { useRadioStore } from './store';

/** Radio de sintonía según el zoom: con el globo entero se "escucha" lejos; de cerca, solo lo local. */
const tuneRadiusKm = (zoom: number) => Math.max(250, 4500 / 2 ** Math.max(0, zoom - 2));

function nearestStation(stations: RadioStation[], lng: number, lat: number, zoom: number) {
  let best: RadioStation | null = null;
  let bestD = Infinity;
  for (const s of stations) {
    if (s.lat == null || s.lon == null) continue;
    const d = haversineKm({ lng, lat }, { lng: s.lon, lat: s.lat });
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (best && bestD <= tuneRadiusKm(zoom)) return best;
  return stations.find((s) => s.lat == null) ?? best;
}

async function loadSegments(id: string) {
  const res = await fetch(`/api/radio/stations/${encodeURIComponent(id)}/segments`);
  if (!res.ok) throw new Error(String(res.status));
  return RadioSegmentsResponse.parse(await res.json()).segments;
}

/**
 * Emisoras en el globo (puntos con ondas que pulsan) y sintonía: la emisora es la más cercana al centro.
 * Al cambiar de emisora suena una estática breve; si ya estaba sonando, la nueva sigue sola.
 */
export default function RadioRuntime() {
  const t = useTranslations('radio');
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const markers = useRef<Marker[]>([]);
  const tuning = useRef(0);

  // Emisoras (una vez).
  useEffect(() => {
    const loc = getUserLocation();
    const q = loc ? `?lat=${loc.lat.toFixed(2)}&lon=${loc.lon.toFixed(2)}` : '';
    fetch(`/api/radio/stations${q}`)
      .then((r) => r.json())
      .then((j) => useRadioStore.getState().setStations(RadioStationsResponse.parse(j).stations))
      .catch(() => useRadioStore.getState().setStatus('error'));
  }, []);

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
        el.style.display = usePrefsStore.getState().mapMarkers ? '' : 'none';
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', t('stationAria', { name: s.name, freq: s.frequencyLabel }));
        el.innerHTML = '<span class="radio-marker__wave"></span><span class="radio-marker__wave radio-marker__wave--2"></span><span class="radio-marker__dot"></span>';
        markers.current.push(new Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([s.lon, s.lat]).addTo(map));
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
    };
  }, [map, ready, stations, t]);

  // Sintonía al terminar cada movimiento.
  useEffect(() => {
    if (!map || !stations.length) return;
    const retune = async (e?: object) => {
      if (e && isAutoRotateEvent(e)) return;
      const c = map.getCenter();
      const target = nearestStation(stations, c.lng, c.lat, map.getZoom());
      const store = useRadioStore.getState();
      if (!target || target.id === store.tunedId) return;
      const seq = ++tuning.current;
      const wasPlaying = radioEngine.isPlaying();
      if (wasPlaying) {
        radioEngine.pause();
        await radioEngine.staticBurst();
      }
      try {
        const segments = await loadSegments(target.id);
        if (seq !== tuning.current) return;
        useRadioStore.getState().tune(target.id, segments);
        document.querySelectorAll('.radio-marker').forEach((m) => m.classList.remove('is-tuned'));
        const i = stations.filter((s) => s.lat != null).findIndex((s) => s.id === target.id);
        if (i >= 0) markers.current[i]?.getElement().classList.add('is-tuned');
        if (wasPlaying && useRadioStore.getState().activated) void radioEngine.play();
        else useRadioStore.getState().setStatus(segments.length ? 'paused' : 'empty');
      } catch {
        useRadioStore.getState().setStatus('error');
      }
    };
    void retune();
    map.on('moveend', retune);
    return () => {
      map.off('moveend', retune);
    };
  }, [map, stations]);

  // Baja el volumen mientras el asistente responde o el locutor lee. Si la radio suena con su voz de respaldo
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
