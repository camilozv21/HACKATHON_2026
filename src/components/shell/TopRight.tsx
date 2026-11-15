'use client';

import { LayersButton } from '@/features/layers/LayersButton';
import { PointsButton } from '@/features/points/PointsButton';
import { SettingsButton } from './SettingsButton';

/** Arriba a la derecha (carga diferida, con el globo listo): puntos, ajustes y capas. */
export default function TopRight() {
  return (
    <div className="flex items-start gap-2">
      <PointsButton />
      <SettingsButton />
      <LayersButton />
    </div>
  );
}
