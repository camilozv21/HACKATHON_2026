'use client';

import { Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SelectedField } from '@/features/field/types';
import { inColombiaBox } from '@/lib/market/colombia';
import { myListingFor, useListingsStore } from './store';

/**
 * "Publicar mi finca" (o "Mi publicación" si ya la publicó desde este teléfono). Solo fincas reales en Colombia:
 * las demo no se publican. Va como fila completa en el resumen de la finca (en 360 px no cabe un 4.º botón).
 */
export function PublishEntry({ field }: { field: SelectedField }) {
  const t = useTranslations('listings');
  const mine = useListingsStore((s) => myListingFor(s.mine, field.id));
  const [lon, lat] = field.center;
  if (field.demoId || !inColombiaBox(lat, lon)) return null;

  const open = () => {
    const s = useListingsStore.getState();
    if (mine) s.openManage(mine.id);
    else s.openPublish({ fieldId: field.id, lat, lon, name: field.name ?? null, areaHa: field.areaHa ?? null });
  };

  return (
    <button
      type="button"
      onClick={open}
      className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-left ring-1 ring-line hover:bg-white/10"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-field-500/15 text-field-300">
        <Store aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{mine ? t('myListing') : t('publish')}</span>
        {!mine && <span className="block text-xs text-ink-muted">{t('publishHint')}</span>}
      </span>
    </button>
  );
}
