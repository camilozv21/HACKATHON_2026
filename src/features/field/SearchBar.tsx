'use client';

import clsx from 'clsx';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { fitBounds, flyTo } from '@/features/globe/camera';
import type { GeocodeResult } from '@/lib/geocoding';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';

type Status = 'idle' | 'loading' | 'done' | 'error';

/**
 * Búsqueda de lugares (MapTiler si hay clave; si no, Nominatim con debounce de 400 ms).
 * En móvil está colapsada a un ícono; en desktop siempre abierta. Patrón combobox accesible.
 */
export function SearchBar() {
  const t = useTranslations('search');
  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const expanded = isDesktop || open;

  useEffect(() => {
    const q = query.trim();
    // Con menos de 3 letras no se busca (la lista se oculta con showList).
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        // El módulo de geocoding se descarga con la primera búsqueda.
        const { searchPlaces } = await import('@/lib/geocoding');
        const r = await searchPlaces(q, locale, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setResults(r);
          setActive(r.length ? 0 : -1);
          setStatus('done');
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error');
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, locale]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setStatus('idle');
  };

  const choose = (r: GeocodeResult) => {
    if (r.bbox && r.zoom < 12) fitBounds(r.bbox, { maxZoom: r.zoom + 1 });
    else flyTo({ lng: r.lng, lat: r.lat, zoom: r.zoom });
    inputRef.current?.blur();
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active]!);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label={t('open')}
        className="glass pointer-events-auto grid size-12 place-items-center rounded-full shadow-lg"
      >
        <Search aria-hidden className="size-5" />
      </button>
    );
  }

  const showList = query.trim().length >= 3 && status !== 'idle';

  return (
    <div className="pointer-events-auto relative w-full max-w-md">
      <div className="glass flex h-12 items-center gap-2 rounded-full pr-1 pl-4 shadow-lg focus-within:ring-2 focus-within:ring-field-400">
        <Search aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t('label')}
          placeholder={t('placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          enterKeyHint="search"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
        />
        {status === 'loading' && <Loader2 aria-hidden className="size-5 animate-spin text-ink-muted" />}
        {(!isDesktop || query) && (
          <button
            type="button"
            onClick={close}
            aria-label={t('close')}
            className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        )}
      </div>

      {showList && (
        <div className="glass absolute inset-x-0 top-14 overflow-hidden rounded-2xl shadow-2xl">
          <ul id={listId} role="listbox" aria-label={t('results')} className="max-h-[50dvh] overflow-y-auto py-1">
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                className={clsx(
                  'flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2',
                  i === active && 'bg-white/10',
                )}
              >
                <MapPin aria-hidden className="size-4 shrink-0 text-field-400" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  {r.context && <span className="block truncate text-sm text-ink-muted">{r.context}</span>}
                </span>
              </li>
            ))}
          </ul>
          {status === 'done' && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-muted">{t('noResults')}</p>
          )}
          {status === 'error' && <p className="px-4 py-3 text-sm text-risk-medium">{t('error')}</p>}
        </div>
      )}
    </div>
  );
}
