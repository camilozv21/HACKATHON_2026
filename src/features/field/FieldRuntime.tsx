'use client';

import { UrlStateProvider } from '@/lib/url/UrlStateProvider';
import { DemoMarkers } from './DemoMarkers';
import { FieldOverlay } from './FieldOverlay';
import { UrlStateSync } from './UrlStateSync';

/**
 * Piezas de la finca que solo tienen sentido con el globo ya cargado (sincronización con la URL,
 * dibujo de la finca y puntos demo). Se cargan en un chunk aparte para no engordar el JS inicial.
 */
export default function FieldRuntime() {
  return (
    <>
      <UrlStateProvider>
        <UrlStateSync />
      </UrlStateProvider>
      <FieldOverlay />
      <DemoMarkers />
    </>
  );
}
