'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { EventsUrlSync } from '@/features/events/EventsUrlSync';
import { useEventsStore } from '@/features/events/store';
import { ListingsUrlSync } from '@/features/listings/ListingsUrlSync';
import { listingsActive, useListingsStore } from '@/features/listings/store';
import PlacesAlternative from '@/features/globe/PlacesAlternative';
import IntroFlight from '@/features/location/IntroFlight';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import PointsRuntime from '@/features/points/PointsRuntime';
import { useTimeStore } from '@/features/time/store';
import TimeRuntime from '@/features/time/TimeRuntime';
import { UrlStateProvider } from '@/lib/url/UrlStateProvider';

// El recorrido guiado solo se descarga con ?demo=1 (la bienvenida va en el HTML: OnboardingScript; las preguntas
// de inicio, en OnboardingGate, se descargan cuando la bienvenida está abierta).
const DemoTour = dynamic(() => import('@/features/demo/DemoTour'), { ssr: false });
const TimeSheet = dynamic(() => import('@/features/time/TimeSheet'), { ssr: false });
// Eventos y emergencias (capa, detalle, lista y reporte): se descargan al activarlos o al abrir el reporte.
const EventsRuntime = dynamic(() => import('@/features/events/EventsRuntime'), { ssr: false });
// Fincas que venden y "Publicar mi finca" (capa, tarjeta, formulario): se descargan al activarlos.
const ListingsRuntime = dynamic(() => import('@/features/listings/ListingsRuntime'), { ssr: false });

/**
 * Primera capa de la página (carga diferida, con el globo listo): vuelo de la intro hacia tu zona, alternativa
 * textual al globo, la máquina del tiempo (?t=), los eventos y emergencias (?ev=), las fincas que venden (?shop=) y
 * el recorrido guiado con ?demo=1. También el puntaje (PointsRuntime: cuenta lo que hace la persona).
 */
export default function FirstLayer() {
  const pickerOpen = useTimeStore((s) => s.pickerOpen);
  const eventsActive = useEventsStore((s) => s.visible || s.report !== null);
  const shopActive = useListingsStore(listingsActive);
  const [demo] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1');
  return (
    <>
      <IntroFlight />
      <UrlStateProvider>
        <TimeRuntime />
        <EventsUrlSync />
        <ListingsUrlSync />
      </UrlStateProvider>
      {pickerOpen && <TimeSheet />}
      {eventsActive && <EventsRuntime />}
      {shopActive && <ListingsRuntime />}
      <PlacesAlternative />
      <PointsRuntime />
      <OnboardingGate />
      {demo && <DemoTour />}
    </>
  );
}
