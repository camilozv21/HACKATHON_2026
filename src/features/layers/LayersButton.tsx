'use client';

import { Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLayerStore } from './store';

/** Botón "Capas" (JS inicial mínimo: el catálogo se carga al abrirlo). */
export function LayersButton() {
  const t = useTranslations('layers');
  const n = useLayerStore((s) => s.active.length);
  const open = useLayerStore((s) => s.catalogOpen);
  const setOpen = useLayerStore((s) => s.setCatalogOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={t('openAria', { n })}
      className="glass pointer-events-auto relative flex h-12 items-center gap-2 rounded-full px-4 font-semibold shadow-lg"
    >
      <Layers aria-hidden className="size-5" />
      <span className="hidden sm:inline">{t('open')}</span>
      {n > 0 && (
        <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-field-500 text-xs font-bold text-black">
          {n}
        </span>
      )}
    </button>
  );
}
