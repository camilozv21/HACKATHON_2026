'use client';

import { useLocale, useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useRef } from 'react';
import { useToastStore } from '@/components/ui/toast';
import { latestDate, layerDateFor } from '@/features/layers/dates';
import type { LayerId } from '@/features/layers/ids';
import { LAYER_BY_ID } from '@/features/layers/layers.config';
import { useLayerStore } from '@/features/layers/store';
import { urlOptions } from '@/lib/urlState';
import { parseTimeParam, periodLabel, representativeDate, toTimeParam, type TimeSel } from './period';
import { useTimeStore } from './store';

/**
 * Máquina del tiempo sin UI propia:
 *  - ?t=2026-05 (o un día) ↔ store, para compartir el enlace.
 *  - Las capas NASA activas (y las que se activen después) saltan a la fecha elegida; si una capa no tiene
 *    datos para esa fecha se avisa. Al volver a hoy, cada capa vuelve a su dato más reciente.
 */
export default function TimeRuntime() {
  const t = useTranslations('time');
  const tl = useTranslations('layers.items');
  const locale = useLocale();
  const [param, setParam] = useQueryState('t', parseAsString.withOptions(urlOptions));
  const initial = useRef(param);
  const msgs = useRef({ t, tl, locale });
  useEffect(() => {
    msgs.current = { t, tl, locale };
  }, [t, tl, locale]);

  useEffect(() => {
    const toast = useToastStore.getState().push;

    const applyLayer = (id: LayerId, sel: TimeSel) => {
      const cfg = LAYER_BY_ID[id];
      if (!cfg || cfg.kind !== 'gibs') return;
      const date = layerDateFor(cfg, representativeDate(sel));
      if (!date) {
        const m = msgs.current;
        toast(m.t('layerNoData', { layer: m.tl(`${id}.name`), period: periodLabel(sel, m.locale) }), 'warning', 7000);
        return;
      }
      if (useLayerStore.getState().dates[id] !== date) useLayerStore.getState().setDate(id, date);
    };

    const restoreLatest = () => {
      const { active, setDate } = useLayerStore.getState();
      for (const id of active) {
        const cfg = LAYER_BY_ID[id];
        const latest = cfg?.kind === 'gibs' ? latestDate(cfg) : null;
        if (latest) setDate(id, latest);
      }
    };

    // Restaurar desde el enlace una sola vez.
    const fromUrl = parseTimeParam(initial.current);
    if (fromUrl) {
      useTimeStore.getState().set(fromUrl);
      useLayerStore.getState().active.forEach((id) => applyLayer(id, fromUrl));
    }

    const unsubTime = useTimeStore.subscribe((s, prev) => {
      if (s.sel === prev.sel) return;
      void setParam(s.sel ? toTimeParam(s.sel) : null);
      if (s.sel) useLayerStore.getState().active.forEach((id) => applyLayer(id, s.sel!));
      else if (prev.sel) restoreLatest();
    });
    const unsubLayers = useLayerStore.subscribe((s, prev) => {
      const sel = useTimeStore.getState().sel;
      if (!sel || s.active === prev.active) return;
      s.active.filter((id) => !prev.active.includes(id)).forEach((id) => applyLayer(id, sel));
    });
    return () => {
      unsubTime();
      unsubLayers();
    };
  }, [setParam]);

  return null;
}
