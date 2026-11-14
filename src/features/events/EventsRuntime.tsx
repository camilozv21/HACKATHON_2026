'use client';

import { EventCard } from './EventCard';
import { EventsLayer } from './EventsLayer';
import { EventsSheet } from './EventsSheet';
import { PickPointBar } from './PickPointBar';
import { ReportEventSheet } from './ReportEventSheet';
import { useEventsStore } from './store';

/**
 * Eventos y emergencias (carga diferida, un solo chunk): capa del globo, detalle, lista y formulario de reporte.
 * Se monta cuando la persona activa los eventos o abre el formulario.
 */
export default function EventsRuntime() {
  const visible = useEventsStore((s) => s.visible);
  const hasSelection = useEventsStore((s) => Boolean(s.selected?.length));
  const listOpen = useEventsStore((s) => s.listOpen);
  const reporting = useEventsStore((s) => s.report !== null);
  const picking = useEventsStore((s) => s.picking);
  return (
    <>
      {visible && <EventsLayer />}
      {visible && hasSelection && !reporting && <EventCard />}
      {visible && listOpen && !reporting && <EventsSheet />}
      {reporting && !picking && <ReportEventSheet />}
      {reporting && picking && <PickPointBar />}
    </>
  );
}
