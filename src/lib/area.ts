/**
 * Área geodésica de un anillo [lng, lat] en m² (fórmula de exceso esférico, la misma que usa Turf).
 * Error < 0.5 % para parcelas agrícolas.
 */
const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

export function ringAreaM2(ring: [number, number][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lowerLng] = ring[i]!;
    const [, middleLat] = ring[(i + 1) % n]!;
    const [upperLng] = ring[(i + 2) % n]!;
    total += (rad(upperLng) - rad(lowerLng)) * Math.sin(rad(middleLat));
  }
  return Math.abs((total * R * R) / 2);
}

/** Área en hectáreas del anillo exterior de un polígono (acepta anillo cerrado o abierto). */
export function polygonAreaHa(ring: [number, number][]): number {
  const open =
    ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  return ringAreaM2(open) / 10_000;
}

/** Centroide simple (promedio de vértices) — suficiente para centrar la cámara en una parcela. */
export function ringCentroid(ring: [number, number][]): [number, number] {
  const open = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  const [sx, sy] = open.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
  return [sx / open.length, sy / open.length];
}

export function ringBounds(ring: [number, number][]): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}
