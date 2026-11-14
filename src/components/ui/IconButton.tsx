'use client';

import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  size?: 'md' | 'lg';
  active?: boolean;
};

/** Botón de ícono accesible: siempre con aria-label y área táctil ≥ 44 px. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, children, className, size = 'md', active, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'glass grid shrink-0 place-items-center rounded-full text-ink shadow-lg transition-[background-color,transform] duration-150 active:scale-95 disabled:opacity-50',
        size === 'md' ? 'size-12' : 'size-14',
        active ? 'bg-field-500/30 ring-2 ring-field-400' : 'hover:bg-surface-raised',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
