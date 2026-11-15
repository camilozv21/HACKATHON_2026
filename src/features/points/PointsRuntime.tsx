'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/features/agent/store';
import { useEventsStore } from '@/features/events/store';
import { useFieldStore } from '@/features/field/store';
import { useGlossaryStore } from '@/features/glossary/terms';
import { useLayerStore } from '@/features/layers/store';
import { useListingsStore } from '@/features/listings/store';
import { useRadioStore } from '@/features/radio/store';
import { useRegionStore, type RegionTarget } from '@/features/region/store';
import { award, refreshAccount } from './client';
import { usePointsStore } from './store';

/**
 * Resultado de los retos de inicio guardado en el perfil (`profile.quest`). Se lee sin depender del tipo: el perfil
 * puede no traerlo (versiones sin retos) y entonces no suma nada.
 */
function questOf(profile: unknown): { stars: number } | null {
  const q = (profile as { quest?: { stars?: unknown } } | null)?.quest;
  return q && typeof q.stars === 'number' ? (q as { stars: number }) : null;
}

/** Referencia de una región: su municipio o departamento, la finca demo o el punto redondeado (~11 km). */
const regionRef = (t: RegionTarget) => t.admin?.code ?? t.demoId ?? `${t.lat.toFixed(1)},${t.lon.toFixed(1)}`;

/**
 * Cuenta lo que hace la persona escuchando los stores que ya existen (sin tocar cada función, sin re-renders):
 * visitar, activar capas, abrir regiones, escuchar la radio, preguntar al asistente, marcar y analizar la finca,
 * aprender términos, reportar eventos, publicar la finca y terminar los retos de inicio.
 */
export default function PointsRuntime() {
  useEffect(() => {
    // Con cuenta guardada en el teléfono: se confirma la sesión (y el total) con el servidor.
    if (usePointsStore.getState().account) void refreshAccount();
    award('visit', 'today');

    const unsubs = [
      useLayerStore.subscribe((s, prev) => {
        for (const id of s.active) if (!prev.active.includes(id)) award('layer', id);
      }),
      useRegionStore.subscribe((s, prev) => {
        if (s.target && s.target !== prev.target && regionRef(s.target) !== (prev.target && regionRef(prev.target))) award('region', regionRef(s.target));
      }),
      useRadioStore.subscribe((s, prev) => {
        if (s.status === 'playing' && prev.status !== 'playing') award('radio', 'today');
      }),
      useAgentStore.subscribe((s, prev) => {
        if (s.messages.length <= prev.messages.length) return;
        const last = s.messages.at(-1);
        if (last?.role === 'user') award('ask', last.id);
      }),
      useFieldStore.subscribe((s, prev) => {
        const f = s.field;
        if (f && f.id !== prev.field?.id && !f.demoId) award('field', f.id);
        if (f && s.analyzing && !prev.analyzing) award('analyze', f.id);
      }),
      useGlossaryStore.subscribe((s, prev) => {
        if (s.open && s.open !== prev.open) award('glossary', s.open);
      }),
      useEventsStore.subscribe((s, prev) => {
        for (const e of s.mine) if (!prev.mine.some((m) => m.id === e.id)) award('report', e.id);
      }),
      useListingsStore.subscribe((s, prev) => {
        for (const m of s.mine) if (!prev.mine.some((p) => p.id === m.id)) award('publish', m.id);
      }),
    ];

    // Retos de inicio: el perfil guarda las estrellas al terminar (módulo compartido con la radio y el chat).
    let alive = true;
    void import('@/features/onboarding/profile').then(({ useProfileStore }) => {
      if (!alive) return;
      const first = questOf(useProfileStore.getState().profile);
      if (first) award('quest', 'intro', first.stars);
      unsubs.push(
        useProfileStore.subscribe((s, prev) => {
          const q = questOf(s.profile);
          if (q && q !== questOf(prev.profile)) award('quest', 'intro', q.stars);
        }),
      );
    });

    return () => {
      alive = false;
      unsubs.forEach((u) => u());
    };
  }, []);

  return null;
}
