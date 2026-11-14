import clsx from 'clsx';

/**
 * Globo de espera dibujado en SVG desde el servidor: cuenta como primer pintado con contenido (FCP)
 * y evita que el LCP dependa de WebGL.
 */
export function GlobeSkeleton({ hidden }: { hidden?: boolean }) {
  return (
    <div
      aria-hidden
      className={clsx(
        'pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-700',
        hidden ? 'opacity-0' : 'opacity-100',
      )}
      style={{ paddingTop: 'var(--map-pad-top, 0px)', paddingBottom: 'var(--map-pad-bottom, 0px)' }}
    >
      <svg
        viewBox="0 0 200 200"
        className={clsx(
          'globe-skeleton aspect-square w-[min(72vw,72dvh)] rounded-full',
          !hidden && 'globe-skeleton--breathe',
        )}
      >
        <defs>
          <radialGradient id="gs-body" cx="36%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#23497a" />
            <stop offset="45%" stopColor="#0f2242" />
            <stop offset="75%" stopColor="#08101f" />
            <stop offset="100%" stopColor="#05070d" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="100" fill="url(#gs-body)" />
        <g fill="none" stroke="rgb(124 196 255 / 0.12)" strokeWidth="0.6">
          <ellipse cx="100" cy="100" rx="100" ry="34" />
          <ellipse cx="100" cy="100" rx="100" ry="70" />
          <ellipse cx="100" cy="100" rx="34" ry="100" />
          <ellipse cx="100" cy="100" rx="70" ry="100" />
        </g>
      </svg>
    </div>
  );
}
