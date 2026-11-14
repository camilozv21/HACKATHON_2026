'use client';

import clsx from 'clsx';
import { Square, Volume2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { isSpeechSupported, speak, stop, type NarratorLang } from './narrator';
import { useNarratorStore } from './store';

/**
 * Botón "Escuchar" / "Detener" del locutor (≥ 44 px). `text` se calcula al tocar, con lo que hay en pantalla.
 * Sin voz en el navegador no se muestra. `compact`: solo ícono (con nombre accesible), para mensajes del chat.
 */
export function SpeakButton({
  id,
  text,
  label,
  compact = false,
  className,
}: {
  id: string;
  text: () => string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('narrator');
  const lang = useLocale() as NarratorLang;
  const [supported] = useState(isSpeechSupported);
  const speaking = useNarratorStore((s) => s.speakingId === id);
  if (!supported) return null;
  const name = speaking ? t('stop') : (label ?? t('listen'));
  return (
    <button
      type="button"
      aria-pressed={speaking}
      aria-label={compact ? name : undefined}
      title={compact ? name : undefined}
      onClick={() => (speaking ? stop() : speak(text(), { lang, id }))}
      className={clsx(
        'flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold',
        compact ? 'size-11' : 'min-h-11 px-3 text-sm',
        speaking ? 'bg-field-500 text-black' : 'bg-white/10 hover:bg-white/15',
        className,
      )}
    >
      {speaking ? <Square aria-hidden className="size-4 fill-current" /> : <Volume2 aria-hidden className="size-5" />}
      {!compact && <span>{name}</span>}
    </button>
  );
}
