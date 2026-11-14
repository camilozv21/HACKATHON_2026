'use client';

import { animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef } from 'react';

/**
 * Número que cuenta desde 0 hasta el valor (escribe en el DOM, sin re-render por frame).
 * Si el valor cambia después (otro periodo, datos actualizados), pasa del número que se ve al nuevo.
 */
export function CountUp({
  value,
  decimals = 0,
  locale,
  delay = 0,
  durationMs = 650,
  format,
}: {
  value: number;
  decimals?: number;
  locale: string;
  delay?: number;
  durationMs?: number;
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const fmt = (v: number) =>
    format ? format(v) : new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(v);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = fmt(value);
      shown.current = value;
      return;
    }
    const from = shown.current;
    const controls = animate(from ?? 0, value, {
      duration: (from == null ? durationMs : Math.min(durationMs, 450)) / 1000,
      delay: from == null ? delay : 0,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
    // fmt depende de locale/decimals, que ya están en las dependencias por valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, locale, reduced, delay, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {fmt(reduced ? value : 0)}
    </span>
  );
}

/** Sparkline que se dibuja de izquierda a derecha; con una serie nueva del mismo largo, la línea se transforma. */
export function Sparkline({ series, delay = 0, label }: { series: number[]; delay?: number; label: string }) {
  const reduced = useReducedMotion();
  const gid = useId();
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * 100, 28 - ((v - min) / span) * 24] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${d} L100,32 L0,32 Z`;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} className="h-10 w-full overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(110 227 154 / 0.35)" />
          <stop offset="100%" stopColor="rgb(110 227 154 / 0)" />
        </linearGradient>
      </defs>
      <motion.path
        key={`a${series.length}`}
        fill={`url(#${gid})`}
        initial={{ opacity: reduced ? 1 : 0, d: area }}
        animate={{ opacity: 1, d: area }}
        transition={{ opacity: { duration: 0.4, delay: delay + 0.35 }, d: { duration: reduced ? 0 : 0.45, ease: 'easeOut' } }}
      />
      <motion.path
        key={`l${series.length}`}
        fill="none"
        stroke="rgb(159 240 184)"
        strokeWidth={1.8}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduced ? 1 : 0, d }}
        animate={{ pathLength: 1, d }}
        transition={{ pathLength: { duration: 0.6, delay, ease: 'easeOut' }, d: { duration: reduced ? 0 : 0.45, ease: 'easeOut' } }}
      />
    </svg>
  );
}

const ORBITS: Record<string, { tilt: number; sats: number; color: string }> = {
  SMAP: { tilt: 78, sats: 1, color: '#7cc4ff' },
  GPM: { tilt: 35, sats: 1, color: '#9fd8ff' },
  MODIS: { tilt: 62, sats: 2, color: '#ffd166' },
  POWER: { tilt: 20, sats: 1, color: '#c3a6ff' },
  ECOSTRESS: { tilt: 8, sats: 1, color: '#ff9e7a' },
  GRACE: { tilt: 80, sats: 2, color: '#6ee39a' },
  SRTM: { tilt: 45, sats: 1, color: '#e6e6e6' },
};

/** Pequeña órbita animada que indica la misión (ícono propio, no logos oficiales). */
export function OrbitBadge({ mission }: { mission: string }) {
  const key = Object.keys(ORBITS).find((k) => mission.toUpperCase().includes(k)) ?? 'POWER';
  const o = ORBITS[key]!;
  return (
    <span aria-hidden className="relative grid size-11 shrink-0 place-items-center">
      <svg viewBox="0 0 44 44" className="absolute inset-0">
        <circle cx="22" cy="22" r="7" fill="#1d4f8c" />
        <circle cx="20" cy="20" r="2.5" fill="#6ee39a" opacity="0.8" />
        <ellipse
          cx="22"
          cy="22"
          rx="18"
          ry="7"
          fill="none"
          stroke={o.color}
          strokeOpacity="0.45"
          strokeDasharray="2 3"
          transform={`rotate(${o.tilt} 22 22)`}
        />
      </svg>
      <span className="orbit-spin absolute inset-0" style={{ transform: `rotate(${o.tilt}deg) scaleY(0.39)` }}>
        {Array.from({ length: o.sats }, (_, i) => (
          <span
            key={i}
            className="orbit-sat absolute top-1/2 left-1/2 block size-1.5 rounded-[1px]"
            style={{ background: o.color, animationDelay: `${-i * 1.1}s`, boxShadow: `0 0 6px ${o.color}` }}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Onda de luz que viaja desde el punto tocado hasta el borde del drawer (SVG absoluto sobre el mapa,
 * solo transform/opacity/pathLength).
 */
export function LightWave({ from, toX }: { from: { x: number; y: number }; toX: number }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const toY = Math.max(80, Math.min(window.innerHeight - 80, from.y - 40));
  const cx = (from.x + toX) / 2;
  const d = `M${from.x},${from.y} C${cx},${from.y - 120} ${cx},${toY} ${toX},${toY}`;
  return (
    <svg className="pointer-events-none fixed inset-0 z-[45] h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="wave-grad" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#6ee39a" />
        </linearGradient>
      </defs>
      <motion.circle
        cx={from.x}
        cy={from.y}
        fill="none"
        stroke="#9ff0b8"
        strokeWidth={2}
        initial={{ r: 4, opacity: 0.9 }}
        animate={{ r: 46, opacity: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke="url(#wave-grad)"
        strokeWidth={3}
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 6px rgb(110 227 154 / 0.9))' }}
        initial={{ pathLength: 0, opacity: 1 }}
        animate={{ pathLength: 1, opacity: [1, 1, 0] }}
        transition={{ pathLength: { duration: 0.45, ease: 'easeInOut' }, opacity: { duration: 0.85, times: [0, 0.6, 1] } }}
      />
    </svg>
  );
}
