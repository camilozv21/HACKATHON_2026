'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Dock } from '@/components/shell/Dock';
import { ChatBar } from '@/features/agent/ChatBar';
import { useAgentStore } from '@/features/agent/store';
import { useToastStore } from '@/components/ui/toast';
import { FieldLauncher } from '@/features/field/FieldLauncher';
import { SearchBar } from '@/features/field/SearchBar';
import { useFieldStore } from '@/features/field/store';
import { Crosshair } from '@/features/globe/Crosshair';
import { Globe } from '@/features/globe/Globe';
import { useGlobeStore } from '@/features/globe/store';
import { useLayerStore } from '@/features/layers/store';
import { useRegionStore } from '@/features/region/store';
import { LocationBootstrap } from '@/features/location/LocationBootstrap';
import { UserLocationMarker } from '@/features/location/UserLocationMarker';
import { useLocateUser } from '@/features/location/useUserLocation';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';

// Todo lo pesado o que no se ve en el primer pintado se carga bajo demanda.
// Piezas que solo aparecen con el globo ya cargado: fuera del JS inicial.
// Agrupadas en pocos módulos: cada import diferido también suma bytes al JS inicial.
const TopRight = dynamic(() => import('@/components/shell/TopRight'), { ssr: false });
const TopCenter = dynamic(() => import('@/components/shell/TopCenter'), { ssr: false });
const FirstLayer = dynamic(() => import('@/components/shell/FirstLayer'), { ssr: false });
const GlobeControls = dynamic(() => import('@/features/globe/GlobeControls').then((m) => m.GlobeControls), { ssr: false });
// Los avisos se cargan con el primer aviso.
const Toaster = dynamic(() => import('@/components/ui/Toaster').then((m) => m.Toaster), { ssr: false });
const FieldSheet = dynamic(() => import('@/features/field/FieldSheet'), { ssr: false });
const FieldRuntime = dynamic(() => import('@/features/field/FieldRuntime'), { ssr: false });
const LayerRuntime = dynamic(() => import('@/features/layers/LayerRuntime'), { ssr: false });
const LayerCatalog = dynamic(() => import('@/features/layers/LayerCatalog'), { ssr: false });
const LayerBar = dynamic(() => import('@/features/layers/LayerBar'), { ssr: false });
const CompareCurtain = dynamic(() => import('@/features/layers/CompareCurtain'), { ssr: false });
const RegionRuntime = dynamic(() => import('@/features/region/RegionRuntime'), { ssr: false });
const RegionDrawer = dynamic(() => import('@/features/region/RegionDrawer'), { ssr: false });
const ChatPanel = dynamic(() => import('@/features/agent/ChatPanel'), { ssr: false });
const RadioRuntime = dynamic(() => import('@/features/radio/RadioRuntime'), { ssr: false });

/**
 * Mapa de pantalla (móvil), sin superponer cosas:
 *  arriba búsqueda + capas · centro globo con mira · abajo radio + chat (dock) · derecha drawer de región.
 * La finca usa el botón "Mi finca" abajo a la izquierda y un bottom sheet (panel derecho en desktop).
 * Las capas flotantes usan pointer-events solo donde hay controles, para no robar gestos al globo.
 */
export function AppShell() {
  const locateUser = useLocateUser();
  const isDesktop = useIsDesktop();
  const hasField = useFieldStore((s) => s.field !== null);
  const fieldMode = useFieldStore((s) => s.mode);
  const sheetOpen = useFieldStore((s) => s.sheet !== null);
  const sheetFull = useFieldStore((s) => s.sheet === 'full');
  const globeReady = useGlobeStore((s) => s.status === 'ready');
  const layerCount = useLayerStore((s) => s.active.length);
  const catalogOpen = useLayerStore((s) => s.catalogOpen);
  const regionOpen = useRegionStore((s) => s.target !== null);
  const hasToasts = useToastStore((s) => s.toasts.length > 0);
  const chatOpen = useAgentStore((s) => s.expanded);
  const [regionMounted, setRegionMounted] = useState(false);
  if (regionOpen && !regionMounted) setRegionMounted(true);
  // En móvil el sheet de la finca y el catálogo tapan la parte de abajo: la barra de capa se oculta mientras tanto.
  const showLayerBar = layerCount > 0 && fieldMode === 'idle' && (isDesktop || (!sheetOpen && !catalogOpen));

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {globeReady && <FirstLayer />}
      <Globe />
      {isDesktop && layerCount > 1 && globeReady && <CompareCurtain />}
      <Crosshair forceVisible={fieldMode === 'pin'} />

      {/* Lógica sin UI propia */}
      <LocationBootstrap />
      <UserLocationMarker />
      {globeReady && <FieldRuntime />}
      {globeReady && <LayerRuntime />}
      {globeReady && <RegionRuntime />}
      {globeReady && <RadioRuntime />}

      {/* Zona superior: búsqueda, capas y avisos de contexto */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+0.75rem)] z-30 flex flex-col gap-2 pr-[calc(var(--map-pad-right,0px)+0.75rem)] pl-3">
        <div className="flex items-start justify-between gap-3">
          <SearchBar />
          {globeReady && <TopRight />}
        </div>
        {globeReady && (isDesktop || !sheetFull) && <TopCenter />}
      </div>

      {/* Zona inferior (encima del dock de radio + chat) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(var(--dock-h,0px),var(--safe-bottom))+2rem)] z-20 flex flex-col gap-2 pr-[calc(var(--map-pad-right,0px)+0.75rem)] pl-3">
        <div className="flex items-end gap-3">
          <div className={fieldMode === 'idle' ? 'flex min-w-0 flex-1' : 'flex min-w-0 flex-1 justify-center'}>
            <FieldLauncher />
          </div>
          {globeReady && fieldMode === 'idle' && (isDesktop || !sheetOpen) && <GlobeControls onLocate={locateUser} />}
        </div>
        {showLayerBar && <LayerBar />}
      </div>

      <Dock chat={<ChatBar />} />
      {chatOpen && <ChatPanel />}

      {catalogOpen && <LayerCatalog />}
      {hasField && <FieldSheet />}
      {/* Se monta al abrir la primera región y queda montado para animar la salida */}
      {regionMounted && <RegionDrawer />}
      {hasToasts && <Toaster />}
    </main>
  );
}
