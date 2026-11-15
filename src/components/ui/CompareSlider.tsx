'use client';

import clsx from 'clsx';
import { MoveHorizontal } from 'lucide-react';
import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export type CompareSide = { src: string; alt: string; label: string };

type Props = {
  /** Imagen de la izquierda (el antes). */
  before: CompareSide;
  /** Imagen de la derecha (el después), recortada desde la línea. */
  after: CompareSide;
  /** Nombre accesible del deslizador. */
  label: string;
  /** Texto accesible del valor: `pct` es el % del ancho que muestra la imagen de la izquierda. */
  valueText: (pct: number) => string;
  /** Aviso si una imagen no carga. */
  errorText: (label: string) => string;
  /** Píxeles grandes y nítidos (datos de ~1 km). */
  pixelated?: boolean;
  /** Encima de las dos imágenes (p. ej. un recuadro); no recibe toques. */
  overlay?: ReactNode;
  className?: string;
};

/** Un desplazamiento menor a esto en un toque cuenta como "tocar", no como "arrastrar". */
const TAP = 8;
const clamp = (v: number) => Math.min(100, Math.max(0, v));
const KEY_STEP: Record<string, number> = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -25, PageUp: 25 };

/**
 * Comparador antes/después con una línea que se desliza. Mientras se arrastra no hay renders de React: la posición
 * va a una variable CSS (--pos) y a los atributos ARIA; el estado solo se fija al soltar. En pantallas táctiles un
 * gesto vertical sigue desplazando la página (touch-action: pan-y) y solo uno horizontal mueve la línea.
 */
export function CompareSlider({ before, after, label, valueText, errorText, pixelated, overlay, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(50);
  const live = useRef(50);
  const drag = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  const apply = (pct: number) => {
    const v = clamp(pct);
    live.current = v;
    rootRef.current?.style.setProperty('--pos', `${v}%`);
    const h = handleRef.current;
    if (h) {
      h.setAttribute('aria-valuenow', String(Math.round(v)));
      h.setAttribute('aria-valuetext', valueText(v));
    }
  };
  const commit = (pct: number) => {
    apply(pct);
    setValue(live.current);
  };
  const pctAt = (clientX: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 100;
  };
  /** Sin transición mientras se arrastra; con una corta al tocar o usar el teclado. */
  const setDragging = (on: boolean) => rootRef.current?.toggleAttribute('data-dragging', on);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Con ratón arrastra de una vez; con el dedo espera a ver si el gesto es horizontal.
    const active = e.pointerType === 'mouse';
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active };
    if (active) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      apply(pctAt(e.clientX));
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) {
      const dx = Math.abs(e.clientX - d.x);
      if (dx < TAP || dx < Math.abs(e.clientY - d.y)) return;
      d.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    apply(pctAt(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    // Un toque sin arrastrar lleva la línea hasta ahí.
    const tapped = !d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP;
    commit(d.active || tapped ? pctAt(e.clientX) : live.current);
  };
  const onPointerCancel = () => {
    // El navegador tomó el gesto (desplazar la página): la línea se queda donde iba.
    if (drag.current?.active) commit(live.current);
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : e.key in KEY_STEP ? value + KEY_STEP[e.key]! : null;
    if (next === null) return;
    e.preventDefault();
    commit(next);
  };

  const onStatus = useCallback(
    (src: string, ok: boolean) =>
      setFailed((f) => {
        if (f.has(src) !== ok) return f;
        const n = new Set(f);
        if (ok) n.delete(src);
        else n.add(src);
        return n;
      }),
    [],
  );
  const failedLabels = [before, after].filter((s) => failed.has(s.src)).map((s) => s.label);
  const moving = 'duration-200 group-data-[dragging]:duration-0';

  return (
    <div className={className}>
      <div
        ref={rootRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ '--pos': `${value}%` } as CSSProperties}
        className="group relative aspect-square w-full touch-pan-y overflow-hidden rounded-2xl bg-[#0b0f17] select-none"
      >
        <Picture key={before.src} side={before} pixelated={pixelated} onStatus={onStatus} />
        <div className={clsx('absolute inset-0 bg-[#0b0f17] transition-[clip-path] [clip-path:inset(0_0_0_var(--pos))]', moving)}>
          <Picture key={after.src} side={after} pixelated={pixelated} onStatus={onStatus} />
        </div>
        {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}

        <span aria-hidden className="pointer-events-none absolute top-3 left-3 rounded-lg bg-black/75 px-2.5 py-1 text-sm font-bold text-white tabular-nums">
          {before.label}
        </span>
        <span aria-hidden className="pointer-events-none absolute top-3 right-3 rounded-lg bg-black/75 px-2.5 py-1 text-sm font-bold text-white tabular-nums">
          {after.label}
        </span>

        <div
          aria-hidden
          className={clsx(
            'pointer-events-none absolute inset-y-0 left-(--pos) w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgb(0_0_0/0.6)] transition-[left]',
            moving,
          )}
        />
        <div
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
          aria-valuetext={valueText(value)}
          onKeyDown={onKeyDown}
          className={clsx(
            // El botón no se sale del borde aunque la línea llegue a 0 % o 100 %.
            'absolute top-1/2 left-[clamp(1.5rem,var(--pos),calc(100%_-_1.5rem))] grid size-12 -translate-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-black shadow-[0_2px_12px_rgb(0_0_0/0.55)] ring-2 ring-black/20 transition-[left]',
            moving,
          )}
        >
          <MoveHorizontal aria-hidden className="size-6" />
        </div>
      </div>
      {failedLabels.length > 0 && (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {failedLabels.map((l) => errorText(l)).join(' ')}
        </p>
      )}
    </div>
  );
}

/** Una imagen con su brillo mientras carga. El padre le da `key={src}` para reiniciar el estado al cambiar. */
function Picture({ side, pixelated, onStatus }: { side: CompareSide; pixelated?: boolean; onStatus: (src: string, ok: boolean) => void }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const done = useCallback(
    (ok: boolean) => {
      setState(ok ? 'ok' : 'error');
      onStatus(side.src, ok);
    },
    [onStatus, side.src],
  );
  // Si la imagen llegó antes de hidratar, onLoad ya no se dispara: se revisa al montar.
  const ref = useCallback((img: HTMLImageElement | null) => void (img?.complete && done(img.naturalWidth > 0)), [done]);
  return (
    <>
      {state === 'loading' && <div aria-hidden className="shimmer absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element -- mosaico WMS externo, sin optimizar */}
      <img
        ref={ref}
        src={side.src}
        alt={side.alt}
        width={640}
        height={640}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => done(true)}
        onError={() => done(false)}
        className={clsx(
          'pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-300',
          state === 'ok' ? 'opacity-100' : 'opacity-0',
          pixelated && '[image-rendering:pixelated]',
        )}
      />
    </>
  );
}
