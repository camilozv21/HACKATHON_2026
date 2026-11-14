'use client';

import { Settings } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { initPwa } from '@/lib/pwa';

const SettingsSheet = dynamic(() => import('./SettingsSheet'), { ssr: false });

let pwaReady = false;

/** Botón de ajustes (se carga con el globo listo; la hoja de ajustes, al abrirla). También inicia la PWA. */
export function SettingsButton() {
  const t = useTranslations('settings');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pwaReady) return;
    pwaReady = true;
    initPwa();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('open')}
        className="glass pointer-events-auto grid size-12 place-items-center rounded-full shadow-lg"
      >
        <Settings aria-hidden className="size-5" />
      </button>
      {open && <SettingsSheet onClose={() => setOpen(false)} />}
    </>
  );
}
