'use client';

import { Check, Undo2 } from 'lucide-react';
import { Area } from '@/components/ui/Area';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { TerraDraw, TerraDrawModeUndoRedo, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { flyTo } from '@/features/globe/camera';
import { useGlobeStore } from '@/features/globe/store';
import { polygonAreaHa } from '@/lib/area';
import { selectField } from './actions';
import { fieldFromRing } from './geometry';
import { useFieldStore } from './store';
import type { LngLatTuple } from './types';

/** Vértices únicos del polígono en curso (terra-draw repite el primero para cerrar). */
function uniqueVertices(ring: LngLatTuple[]): LngLatTuple[] {
  const out: LngLatTuple[] = [];
  for (const c of ring) {
    const last = out.at(-1);
    if (!last || last[0] !== c[0] || last[1] !== c[1]) out.push(c);
  }
  if (out.length > 1 && out[0]![0] === out.at(-1)![0] && out[0]![1] === out.at(-1)![1]) out.pop();
  return out;
}

/**
 * Dibujo del contorno con terra-draw. En móvil: vértices grandes (distancia de toque 36 px),
 * botones Deshacer / Terminar al alcance del pulgar y el área en hectáreas en vivo.
 */
export default function DrawTool() {
  const t = useTranslations('field');
  const tc = useTranslations('common');
  const locale = useLocale();
  const map = useGlobeStore((s) => s.map);
  const setMode = useFieldStore((s) => s.setMode);
  const drawRef = useRef<TerraDraw | null>(null);
  const [vertices, setVertices] = useState<LngLatTuple[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    if (!map) return;
    // Dibujar a escala de globo no tiene sentido: primero acercarse a la mira.
    if (map.getZoom() < 13) {
      const c = map.getCenter();
      flyTo({ lng: c.lng, lat: c.lat, zoom: 16 });
    }

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, prefixId: 'td' }),
      modes: [
        new TerraDrawPolygonMode({
          pointerDistance: 36,
          showCoordinatePoints: true,
          styles: {
            fillColor: '#6ee39a',
            fillOpacity: 0.22,
            outlineColor: '#9ff0b8',
            outlineWidth: 3,
            closingPointWidth: 11,
            closingPointColor: '#ffffff',
            closingPointOutlineColor: '#3fcf78',
            closingPointOutlineWidth: 3,
            coordinatePointWidth: 8,
            coordinatePointColor: '#ffffff',
            coordinatePointOutlineColor: '#3fcf78',
            coordinatePointOutlineWidth: 2,
          },
        }),
      ],
      undoRedo: { modeLevel: new TerraDrawModeUndoRedo() },
    });
    drawRef.current = draw;
    draw.start();
    draw.setMode('polygon');

    const read = () => {
      const poly = draw.getSnapshot().find((f) => f.geometry.type === 'Polygon');
      const ring = poly ? ((poly.geometry.coordinates as LngLatTuple[][])[0] ?? []) : [];
      setVertices(uniqueVertices(ring));
      setCanUndo(draw.canUndo());
    };
    draw.on('change', read);
    draw.on('finish', (id) => {
      const f = draw.getSnapshotFeature(id);
      if (f?.geometry.type === 'Polygon') finish(uniqueVertices((f.geometry.coordinates as LngLatTuple[][])[0]!));
    });

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMode('idle');
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      draw.stop();
      drawRef.current = null;
    };
    // finish usa locale; el dibujo se monta una sola vez por sesión de dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, setMode]);

  function finish(ring: LngLatTuple[]) {
    if (ring.length < 3) return;
    void selectField(fieldFromRing(ring, 'polygon'), { locale });
  }

  const undo = () => {
    drawRef.current?.undo();
    // Si el modo deja de tener historial, se refleja en la próxima lectura.
    const d = drawRef.current;
    if (d) setCanUndo(d.canUndo());
  };

  const area = vertices.length >= 3 ? polygonAreaHa(vertices) : 0;

  return (
    <div className="pointer-events-none flex w-full max-w-md flex-col items-center gap-2">
      <p role="status" aria-live="polite" className="glass rounded-2xl px-4 py-2 text-center text-sm shadow-lg">
        {vertices.length < 3 ? (
          t('drawInstruction', { n: vertices.length })
        ) : (
          <>
            <span className="font-semibold"><Area ha={area} /></span> · {t('drawReady')}
          </>
        )}
      </p>
      <div className="pointer-events-auto flex w-full gap-2">
        <button
          type="button"
          onClick={() => setMode('idle')}
          className="glass h-12 flex-1 rounded-full font-semibold shadow-lg"
        >
          {tc('cancel')}
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo && vertices.length === 0}
          className="glass flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full font-semibold shadow-lg disabled:opacity-40"
        >
          <Undo2 aria-hidden className="size-5" />
          {t('undo')}
        </button>
        <button
          type="button"
          onClick={() => finish(vertices)}
          disabled={vertices.length < 3}
          className="flex h-12 flex-[1.3] items-center justify-center gap-1.5 rounded-full bg-field-500 font-semibold text-black shadow-lg disabled:opacity-40"
        >
          <Check aria-hidden className="size-5" />
          {t('finish')}
        </button>
      </div>
    </div>
  );
}
