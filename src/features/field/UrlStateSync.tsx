'use client';

import { useLocale } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { useEffect, useRef } from 'react';
import { isAutoRotateEvent } from '@/features/globe/autoRotate';
import { flyTo } from '@/features/globe/camera';
import { useGlobeStore } from '@/features/globe/store';
import { useLocationStore } from '@/features/location/store';
import { cameraParams, fieldParams, urlOptions } from '@/lib/urlState';
import { flyToField, selectField } from './actions';
import { demoFieldsById } from './demoFarms';
import { fieldParam, parseFieldParam } from './geometry';
import { useFieldStore } from './store';

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Sincroniza cámara y finca con la URL (nuqs):
 *  - Al abrir un enlace compartido: vuela a lat/lon/z y restaura la finca.
 *  - Después: cada movimiento terminado y cada cambio de finca actualiza la URL (replace, sin historial).
 */
export function UrlStateSync() {
  const locale = useLocale();
  const [params, setParams] = useQueryStates({ ...cameraParams, ...fieldParams }, urlOptions);
  const map = useGlobeStore((s) => s.map);
  const ready = useGlobeStore((s) => s.status === 'ready');
  const restored = useRef(false);
  const initial = useRef(params);

  // 1) Restaurar desde la URL una sola vez, cuando el globo está listo.
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const { lat, lon, z, field, view } = initial.current;
    const hasCamera = lat != null && lon != null;
    const restoredField = field ? parseFieldParam(field, demoFieldsById(locale)) : null;

    if (hasCamera || restoredField) useLocationStore.getState().markFlown();
    if (restoredField) {
      void selectField(restoredField, { fly: !hasCamera, locale, remember: false });
      // Enlace a una pestaña del análisis (p. ej. las opciones de rotación): abre el sheet ahí.
      if (view) {
        const fs = useFieldStore.getState();
        fs.setAnalyzing(true);
        fs.setPanelTab(view);
      }
    }
    if (hasCamera) {
      flyTo({ lng: lon, lat, zoom: z ?? 12 }, { instant: true });
    } else if (restoredField) {
      flyToField(restoredField, { instant: true });
    }
  }, [ready, locale]);

  // 2) Cámara → URL al terminar cada movimiento (nunca durante).
  useEffect(() => {
    if (!map) return;
    const onMoveEnd = (e: object) => {
      if (isAutoRotateEvent(e) || !restored.current) return;
      const c = map.getCenter();
      void setParams({ lat: r5(c.lat), lon: r5(c.lng), z: Math.round(map.getZoom() * 100) / 100 });
    };
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
    };
  }, [map, setParams]);

  // 3) Finca y pestaña del análisis → URL.
  useEffect(
    () =>
      useFieldStore.subscribe((s, prev) => {
        const fieldChanged = s.field?.id !== prev.field?.id || s.field?.demoId !== prev.field?.demoId;
        const viewChanged = s.analyzing !== prev.analyzing || s.panelTab !== prev.panelTab;
        if (!fieldChanged && !viewChanged) return;
        void setParams({
          field: s.field ? fieldParam(s.field) : null,
          view: s.field && s.analyzing ? s.panelTab : null,
        });
      }),
    [setParams],
  );

  return null;
}
