'use client';

import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useToastStore } from './toast';

const ICONS = { info: Info, warning: AlertTriangle, error: XCircle, success: CheckCircle2 } as const;

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const t = useTranslations('common');

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+4.5rem)] z-[60] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => {
        const Icon = ICONS[item.tone ?? 'info'];
        return (
          <div
            key={item.id}
            className={clsx(
              'glass pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl',
              item.tone === 'error' && 'border-risk-high/60',
              item.tone === 'warning' && 'border-risk-medium/60',
              item.tone === 'success' && 'border-risk-low/60',
            )}
          >
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
            <p className="flex-1">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label={t('close')}
              className="-m-2 grid size-9 place-items-center rounded-full hover:bg-white/10"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
