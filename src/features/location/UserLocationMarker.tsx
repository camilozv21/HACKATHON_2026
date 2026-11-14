'use client';

import type { Marker } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useGlobeStore } from '@/features/globe/store';
import { useUserLocation } from './useUserLocation';

/**
 * Punto "Tú estás aquí" con pulso suave (CSS; sin pulso con reduced-motion).
 * Es un Marker DOM de MapLibre: se posiciona por transform, sin re-render de React por frame.
 * maplibre-gl se importa dinámicamente para no meterlo en el bundle inicial.
 */
export function UserLocationMarker() {
  const t = useTranslations('location');
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const { location } = useUserLocation();
  const markerRef = useRef<Marker | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  const label = location?.accuracy === 'precise' ? t('youAreHere') : t('aroundHere');

  useEffect(() => {
    if (!map || !ready || !location) return;
    let cancelled = false;

    (async () => {
      const { Marker } = await import('maplibre-gl');
      if (cancelled) return;
      if (!markerRef.current) {
        const el = document.createElement('div');
        el.className = 'user-marker';
        el.setAttribute('role', 'img');
        el.innerHTML = '<span class="user-marker__pulse"></span><span class="user-marker__dot"></span>';
        const text = document.createElement('span');
        text.className = 'user-marker__label';
        el.appendChild(text);
        labelRef.current = text;
        markerRef.current = new Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' })
          .setLngLat([location.lon, location.lat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([location.lon, location.lat]);
      }
      const el = markerRef.current.getElement();
      el.dataset.accuracy = location.accuracy;
      el.setAttribute('aria-label', label);
      if (labelRef.current) labelRef.current.textContent = label;
    })();

    return () => {
      cancelled = true;
    };
  }, [map, ready, location, label]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [map],
  );

  return null;
}
