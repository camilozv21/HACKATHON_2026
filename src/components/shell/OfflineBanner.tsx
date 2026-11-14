'use client';

import { WifiOff } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { readLastAnalysis } from '@/lib/api/offline';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Aviso "estás sin conexión" (con la fecha del último análisis guardado, si hay). */
export function OfflineBanner() {
  const t = useTranslations('offline');
  const format = useFormatter();
  const offline = useSyncExternalStore(subscribe, () => !navigator.onLine, () => false);
  if (!offline) return null;
  const saved = readLastAnalysis();

  return (
    <div role="status" className="glass pointer-events-auto flex max-w-[min(92vw,28rem)] items-start gap-2 rounded-2xl px-3 py-2 text-sm shadow-lg ring-1 ring-risk-medium/50">
      <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0 text-risk-medium" />
      <p>
        {saved ? t('banner') : t('bannerNoData')}
        {saved && (
          <span className="block text-xs text-ink-muted">
            {t('savedOn', { date: format.dateTime(new Date(saved.savedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
          </span>
        )}
      </p>
    </div>
  );
}
