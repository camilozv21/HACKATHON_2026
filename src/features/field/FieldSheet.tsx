'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { Drawer } from 'vaul';
import { setMapPadding } from '@/features/globe/camera';
import { setGlobeOccluded } from '@/features/globe/runtime';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { QueryProvider } from '@/lib/query/client';
import { FieldSummary } from './FieldSummary';
import { DESKTOP_PANEL_W, FULL_FRACTION, HALF_FRACTION, PEEK_PX, sheetPadding } from './sheetLayout';
import { useFieldStore } from './store';
import type { SheetSnap } from './types';

const FieldPanel = dynamic(() => import('./FieldPanel'), { ssr: false });

/** Alturas del sheet en móvil: peek (resumen), media y completa. */
const SNAP: Record<SheetSnap, number | string> = { peek: `${PEEK_PX}px`, half: HALF_FRACTION, full: FULL_FRACTION };
const SNAP_POINTS = [SNAP.peek, SNAP.half, SNAP.full];
const DESKTOP_W = DESKTOP_PANEL_W;

function snapFromValue(v: number | string | null): SheetSnap | null {
  if (v === SNAP.peek) return 'peek';
  if (v === SNAP.half) return 'half';
  if (v === SNAP.full) return 'full';
  return null;
}

/**
 * Sheet de la finca. Móvil: bottom sheet (vaul) con tres alturas y el globo interactivo detrás.
 * Desktop: panel lateral derecho. Se carga bajo demanda (next/dynamic) con TanStack Query dentro.
 */
export default function FieldSheet() {
  const isDesktop = useIsDesktop();
  const sheet = useFieldStore((s) => s.sheet);
  const field = useFieldStore((s) => s.field);

  // El centro visible del mapa (la mira) queda por encima/izquierda del panel.
  useEffect(() => {
    if (!field || !sheet) {
      setMapPadding({ bottom: 0, right: 0 });
      setGlobeOccluded('field-sheet', false);
      return;
    }
    setMapPadding(sheetPadding(sheet, isDesktop));
    setGlobeOccluded('field-sheet', !isDesktop && sheet === 'full');
  }, [field, sheet, isDesktop]);

  useEffect(
    () => () => {
      setMapPadding({ bottom: 0, right: 0 });
      setGlobeOccluded('field-sheet', false);
    },
    [],
  );

  if (!field) return null;

  return (
    <QueryProvider>{isDesktop ? <DesktopPanel open={sheet !== null} /> : <MobileSheet />}</QueryProvider>
  );
}

function DesktopPanel({ open }: { open: boolean }) {
  const t = useTranslations('field');
  if (!open) return null;
  return (
    <aside
      aria-label={t('panelLabel')}
      className="panel fixed top-[calc(var(--safe-top)+0.75rem)] right-[calc(var(--safe-right)+0.75rem)] bottom-3 z-40 flex flex-col overflow-hidden rounded-3xl shadow-2xl"
      style={{ width: DESKTOP_W - 24 }}
    >
      <div className="flex-1 overflow-y-auto overscroll-contain p-5">
        <FieldSummary variant="panel">
          <AnalysisSlot />
        </FieldSummary>
      </div>
    </aside>
  );
}

function MobileSheet() {
  const t = useTranslations('field');
  const sheet = useFieldStore((s) => s.sheet);
  const setSheet = useFieldStore((s) => s.setSheet);

  return (
    <Drawer.Root
      open={sheet !== null}
      onOpenChange={(o) => !o && setSheet(null)}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={sheet ? SNAP[sheet] : null}
      setActiveSnapPoint={(v) => setSheet(snapFromValue(v) ?? 'peek')}
      modal={false}
      dismissible
      noBodyStyles
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          style={{ paddingBottom: `${Math.round((1 - FULL_FRACTION) * 100)}dvh` }}
          // Si hay un diálogo propio encima (tabla comparativa, glosario), Esc lo cierra a él y no al sheet.
          onEscapeKeyDown={(e) => {
            if (document.querySelector('[data-overlay-dialog]')) e.preventDefault();
          }}
          className="panel fixed inset-x-0 bottom-0 z-40 flex h-[96dvh] flex-col rounded-t-[var(--radius-sheet)] border-b-0 shadow-[var(--shadow-panel)] outline-none"
        >
          <Drawer.Handle className="mx-auto mt-2 mb-1 !h-1.5 !w-12 shrink-0 !bg-white/30" aria-label={t('dragHandle')} />
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--safe-bottom)+1rem)]"
            data-vaul-no-drag={sheet === 'full' ? '' : undefined}
          >
            <FieldSummary variant="sheet" titleAs={Drawer.Title}>
              <AnalysisSlot />
            </FieldSummary>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Análisis de la finca (Fases 7–9): se carga bajo demanda con las gráficas. */
function AnalysisSlot() {
  const analyzing = useFieldStore((s) => s.analyzing);
  if (!analyzing) return null;
  return <FieldPanel />;
}
