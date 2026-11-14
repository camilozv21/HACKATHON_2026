'use client';

import { Sprout } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useGlobeStore } from '@/features/globe/store';
import { useFieldStore } from './store';

const DrawTool = dynamic(() => import('./DrawTool'), { ssr: false });
const Chooser = dynamic(() => import('./FieldModes').then((m) => m.Chooser), { ssr: false });
const PinMode = dynamic(() => import('./FieldModes').then((m) => m.PinMode), { ssr: false });

/**
 * Botón "Mi finca" (zona inferior, alcanzable con el pulgar) y las tres formas de elegir la finca:
 * mi ubicación, tocar el mapa (pin) o dibujar el contorno.
 */
export function FieldLauncher() {
  const t = useTranslations('field');
  const mode = useFieldStore((s) => s.mode);
  const field = useFieldStore((s) => s.field);
  const sheet = useFieldStore((s) => s.sheet);
  const analyzing = useFieldStore((s) => s.analyzing);
  const setMode = useFieldStore((s) => s.setMode);
  const setSheet = useFieldStore((s) => s.setSheet);
  const ready = useGlobeStore((s) => s.status === 'ready');

  if (!ready) return null;
  if (mode === 'choose') return <Chooser />;
  if (mode === 'pin') return <PinMode />;
  if (mode === 'draw') return <DrawTool />;
  if (sheet) return null;

  return (
    <button
      type="button"
      onClick={() => (field ? setSheet(analyzing ? 'full' : 'peek') : setMode('choose'))}
      className="glass pointer-events-auto flex h-12 items-center gap-2 rounded-full pr-5 pl-4 font-semibold shadow-lg ring-1 ring-field-500/50 active:scale-95"
    >
      <Sprout aria-hidden className="size-5 text-field-400" />
      {field ? t('openMyField') : t('myField')}
    </button>
  );
}
