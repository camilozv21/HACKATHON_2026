'use client';

import { Mic, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAgentStore } from './store';

/**
 * Barra del chat (abajo al centro). Es liviana: el panel de conversación, Motion y el markdown
 * se cargan al tocarla. Se pinta desde el servidor.
 */
export function ChatBar() {
  const t = useTranslations('agent');
  const open = useAgentStore((s) => s.expanded && !s.flying);
  const hasMessages = useAgentStore((s) => s.messages.length > 0);
  const setExpanded = useAgentStore((s) => s.setExpanded);
  const requestVoice = useAgentStore((s) => s.requestVoice);
  if (open) return null;

  return (
    <div className="glass pointer-events-auto flex h-13 min-h-12 items-center gap-1 rounded-full py-1 pr-1 pl-1 shadow-xl">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-left text-ink-muted hover:text-ink"
      >
        <Sparkles aria-hidden className="size-5 shrink-0 text-sky-glow" />
        {/* El nombre accesible empieza con el texto visible (WCAG 2.5.3) y luego dice qué hace. */}
        <span className="truncate">{t('placeholder')}</span>
        <span className="sr-only"> — {t('openAria')}</span>
        {hasMessages && <span aria-hidden className="size-2 shrink-0 rounded-full bg-field-400" />}
      </button>
      <button
        type="button"
        onClick={requestVoice}
        aria-label={t('voice')}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/15"
      >
        <Mic aria-hidden className="size-5" />
      </button>
    </div>
  );
}
