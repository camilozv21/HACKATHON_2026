'use client';

import type { Marker } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useGlobeStore } from '@/features/globe/store';
import { useRegionStore } from '@/features/region/store';
import { usePrefsStore } from '@/lib/prefs';
import { DEMO_FARMS } from './demoFarms';
import { useFieldStore } from './store';

const markerDisplay = (id: string, v: { show: boolean; selectedDemo?: string }) =>
  !v.show || id === v.selectedDemo ? 'none' : '';

/**
 * Puntos brillantes de las fincas demo (inspiración radio.garden, estilo propio).
 * Son <button> reales: se pueden usar con teclado y lector de pantalla. Se ocultan desde Ajustes.
 */
export function DemoMarkers() {
  const t = useTranslations('field');
  const locale = useLocale();
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const selectedDemo = useFieldStore((s) => s.field?.demoId);
  const show = usePrefsStore((s) => s.mapMarkers);
  const markers = useRef<Map<string, Marker>>(new Map());
  const visibility = useRef({ show, selectedDemo });

  useEffect(() => {
    if (!map || !ready) return;
    let cancelled = false;
    const created = markers.current;

    (async () => {
      const { Marker } = await import('maplibre-gl');
      if (cancelled) return;
      for (const demo of DEMO_FARMS) {
        if (created.has(demo.id)) continue;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'demo-marker';
        el.style.display = markerDisplay(demo.id, visibility.current);
        const name = locale === 'en' ? demo.name.en : demo.name.es;
        const region = locale === 'en' ? demo.region.en : demo.region.es;
        const hook = locale === 'en' ? demo.hook.en : demo.hook.es;
        el.setAttribute('aria-label', t('demoAria', { name, region, hook }));
        el.title = `${region} · ${hook}`;
        el.innerHTML =
          '<span class="demo-marker__halo"></span><span class="demo-marker__core"></span><span class="demo-marker__label"></span>';
        (el.querySelector('.demo-marker__label') as HTMLElement).textContent = region;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          // Abre la región (drawer de sensores); desde ahí se entra a la finca demo.
          const rect = el.getBoundingClientRect();
          useRegionStore.getState().openRegion({
            lat: demo.center[1],
            lon: demo.center[0],
            demoId: demo.id,
            name: region,
            tap: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          });
        });
        created.set(
          demo.id,
          new Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat(demo.center).addTo(map),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [map, ready, locale, t]);

  // La finca demo abierta ya se dibuja como polígono: se oculta su punto. En Ajustes se pueden ocultar todos.
  useEffect(() => {
    visibility.current = { show, selectedDemo };
    markers.current.forEach((m, id) => {
      m.getElement().style.display = markerDisplay(id, visibility.current);
    });
  }, [show, selectedDemo]);

  useEffect(() => {
    const created = markers.current;
    return () => {
      created.forEach((m) => m.remove());
      created.clear();
    };
  }, [map, locale]);

  return null;
}
