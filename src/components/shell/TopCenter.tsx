'use client';

import { EventsChip } from '@/features/events/EventsChip';
import { PlacePill } from '@/features/globe/PlacePill';
import { PreciseLocationChip } from '@/features/location/PreciseLocationChip';
import { TimeChip } from '@/features/time/TimeChip';
import { OfflineBanner } from './OfflineBanner';

/** Avisos de contexto arriba al centro (carga diferida): lugar mirado, fecha que se revisa, eventos activos, ubicación exacta y sin conexión. */
export default function TopCenter() {
  return (
    <div className="flex flex-col items-center gap-2">
      <PlacePill />
      <TimeChip />
      <EventsChip />
      <PreciseLocationChip />
      <OfflineBanner />
    </div>
  );
}
