'use client';

import clsx from 'clsx';
import { Check, Info, Lock, Pointer, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/** Lo que recibe cada minijuego. `onFinish` recibe los errores: de ahí salen las estrellas. */
export type GameProps = {
  /** Mostrar la ciencia (fórmulas, misiones): técnicos o quien eligió "con todos los datos". */
  detail: boolean;
  reduced: boolean;
  /** Lee en voz alta si el locutor está encendido. */
  say: (text: string) => void;
  onFinish: (mistakes: number) => void;
};

export type Tone = 'ok' | 'bad' | 'info';
export type Message = { tone: Tone; text: string } | null;

/** Vibración corta al acertar o fallar (Android). Sin soporte o bloqueada, no pasa nada. */
export function buzz(tone: Tone) {
  try {
    if (tone === 'ok') navigator.vibrate?.(18);
    else if (tone === 'bad') navigator.vibrate?.([30, 40, 30]);
  } catch {
    /* sin vibración */
  }
}

/**
 * `later(fn, ms)`: un setTimeout que se cancela solo si el reto se desmonta (saltar el reto o cerrar el inicio no
 * deja un `onFinish` pendiente que cambie de pantalla después).
 */
export function useLater() {
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
}

/** Foco en el título del reto al aparecer: el lector de pantalla lo anuncia. */
export function useFocusRef<T extends HTMLElement>() {
  return useCallback((el: T | null) => el?.focus({ preventScroll: true }), []);
}

/**
 * Animaciones CSS de los juegos (vapor que sube, viento, sacudida, barrido del satélite). Viven en un <style> que
 * existe solo mientras hay un reto montado: ninguna animación infinita queda repintando fuera de la vista.
 * Con prefers-reduced-motion se apagan.
 */
export function GameStyles() {
  return (
    <style>{`
@keyframes fsq-rise{0%{transform:translateY(0);opacity:0}20%{opacity:.9}100%{transform:translateY(-34px);opacity:0}}
@keyframes fsq-wind{0%{stroke-dashoffset:60}100%{stroke-dashoffset:0}}
@keyframes fsq-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@keyframes fsq-ping{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.5);opacity:0}}
@keyframes fsq-twinkle{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes fsq-glow{0%,100%{box-shadow:0 0 0 0 rgb(255 255 255/0)}50%{box-shadow:0 0 0 3px rgb(255 255 255/.8)}}
.fsq-rise{animation:fsq-rise 2.2s ease-out infinite}
.fsq-wind{stroke-dasharray:22 38;animation:fsq-wind 1.1s linear infinite}
.fsq-shake{animation:fsq-shake .35s ease-in-out 2}
.fsq-ping{animation:fsq-ping 1.4s ease-out infinite}
.fsq-twinkle{animation:fsq-twinkle 2.6s ease-in-out infinite}
.fsq-glow{animation:fsq-glow 1.4s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.fsq-rise,.fsq-wind,.fsq-shake,.fsq-ping,.fsq-twinkle,.fsq-glow{animation:none}}
`}</style>
  );
}

/** Título del reto (es el nombre del diálogo) e instrucción corta. */
export function GameHeading({ title, task, kicker }: { title: string; task: string; kicker?: ReactNode }) {
  const ref = useFocusRef<HTMLHeadingElement>();
  return (
    <div className="flex flex-col gap-1">
      {kicker}
      <h2 id="quiz-title" ref={ref} tabIndex={-1} className="text-2xl leading-tight font-bold outline-none">
        {title}
      </h2>
      <p className="text-base text-ink-muted">{task}</p>
    </div>
  );
}

const TONE: Record<Tone, { Icon: LucideIcon; cls: string }> = {
  ok: { Icon: Check, cls: 'bg-field-500/15 ring-field-400 text-ink' },
  bad: { Icon: X, cls: 'bg-risk-high/15 ring-risk-high text-ink' },
  info: { Icon: Info, cls: 'bg-sky-glow/10 ring-sky-glow/60 text-ink' },
};

/** Mensaje del juego (acierto, error o pista). Siempre con ícono y texto: no depende solo del color. */
export function Feedback({ message, className }: { message: Message; className?: string }) {
  const tone = message ? TONE[message.tone] : null;
  return (
    <div role="status" aria-live="polite" className={clsx('min-h-12', className)}>
      {message && tone && (
        <p key={message.text} className={clsx('flex items-start gap-2 rounded-2xl p-3 text-sm font-semibold ring-1', tone.cls)}>
          <tone.Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{message.text}</span>
        </p>
      )}
    </div>
  );
}

type TwoWayOption<V extends string> = { value: V; label: string; Icon: LucideIcon };

/**
 * Interruptor de dos opciones (radio nativo: flechas del teclado funcionan). `locked` lo deja fijo con un candado
 * (por ejemplo, "el sol no lo puedes cambiar").
 */
export function TwoWay<V extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  locked,
  lockedLabel,
}: {
  name: string;
  legend: string;
  options: readonly [TwoWayOption<V>, TwoWayOption<V>];
  value: V;
  onChange: (v: V) => void;
  locked?: boolean;
  lockedLabel?: string;
}) {
  return (
    <fieldset className="flex items-center gap-2" disabled={locked}>
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden className="flex w-16 shrink-0 items-center gap-1 text-sm font-semibold text-ink-muted">
        {legend}
        {locked && <Lock className="size-3.5" />}
      </span>
      {locked && <span className="sr-only">{lockedLabel}</span>}
      <div className="grid flex-1 grid-cols-2 gap-1.5">
        {options.map(({ value: v, label, Icon }) => {
          const checked = v === value;
          return (
            <label
              key={v}
              className={clsx(
                'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ring-1',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
                checked ? 'bg-field-500/20 ring-2 ring-field-400' : 'bg-white/5 ring-line hover:bg-white/10',
                locked && 'cursor-not-allowed opacity-60',
              )}
            >
              <input type="radio" name={name} value={v} checked={checked} onChange={() => onChange(v)} className="sr-only" />
              <Icon aria-hidden className="size-4 shrink-0" />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Botón principal de los retos (verde, grande). Queda fijo abajo del panel aunque el reto sea más alto que la
 * pantalla: la acción principal siempre a mano (mitad inferior, una mano).
 */
export function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 bg-gradient-to-t from-surface-strong from-70% to-transparent px-1 pt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-field-500 px-5 text-lg font-semibold text-black shadow-lg shadow-black/30 hover:bg-field-400 disabled:opacity-40"
      >
        {children}
      </button>
    </div>
  );
}

/** Opción de respuesta (pregunta de varias opciones dentro de un reto). */
export function AnswerButton({
  children,
  onClick,
  Icon,
  state = 'idle',
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  Icon?: LucideIcon;
  state?: 'idle' | 'right' | 'wrong';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={state !== 'idle' ? true : undefined}
      className={clsx(
        'flex min-h-13 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-base font-semibold ring-1',
        state === 'right' && 'bg-field-500/20 ring-2 ring-field-400',
        state === 'wrong' && 'fsq-shake bg-risk-high/15 ring-2 ring-risk-high',
        state === 'idle' && 'bg-white/5 ring-line hover:bg-white/10',
        disabled && state === 'idle' && 'opacity-50',
      )}
    >
      {Icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-field-500/15 text-field-300">
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      <span className="flex-1">{children}</span>
      {state === 'right' && <Check aria-hidden className="size-5 shrink-0 text-field-300" />}
      {state === 'wrong' && <X aria-hidden className="size-5 shrink-0 text-risk-high" />}
    </button>
  );
}

/**
 * Pasos de un reto (1 · 2 · 3): el actual resaltado, los hechos con ✓. Siempre visibles, para que se sepa en qué
 * va y cuánto falta. No depende del color: número o ✓ y el nombre del paso.
 */
export function Steps({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  const compact = steps.length > 3;
  return (
    <ol aria-label={label} className="flex gap-1.5">
      {steps.map((name, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li
            key={name}
            aria-current={now ? 'step' : undefined}
            className={clsx(
              'flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-full px-1.5 text-xs font-bold ring-1',
              compact && !now ? 'w-11 flex-none' : 'flex-1',
              now ? 'bg-field-500 text-black ring-field-300' : done ? 'bg-field-500/20 text-field-300 ring-field-500/50' : 'bg-white/5 text-ink-muted ring-line',
            )}
          >
            <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-black/15">
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={compact && !now ? 'sr-only' : 'truncate'}>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** "Ahora:" la instrucción del paso actual, grande y con una mano que señala. Cambia en cada paso (se anuncia). */
export function NowBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div aria-live="polite" className="flex items-start gap-2.5 rounded-2xl bg-sun/10 p-3 ring-2 ring-sun/60">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sun text-black">
        <Pointer aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wider text-sun uppercase">{title}</p>
        <div className="text-base leading-snug font-semibold">{children}</div>
      </div>
    </div>
  );
}
