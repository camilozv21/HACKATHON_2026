'use client';

import { LayersButton } from '@/features/layers/LayersButton';
import { SettingsButton } from './SettingsButton';

/** Arriba a la derecha (carga diferida, con el globo listo): ajustes y capas. */
export default function TopRight() {
  return (
    <div className="flex items-start gap-2">
      <SettingsButton />
      <LayersButton />
    </div>
  );
}
