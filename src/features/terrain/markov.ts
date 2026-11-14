/**
 * Cadena de Markov del terreno: cómo pasa el área de un estado a otro entre el periodo inicial y el final.
 *
 * - `t[i][j]` = fracción del área que estaba en el estado i al inicio y en el j al final (GEE, píxel a píxel).
 * - `P[i][j]` = t[i][j] / Σj t[i][j]: probabilidad de que un pedazo en el estado i termine en el j (filas suman 1).
 * - Proyección: p(k pasos) = p · P^k, suponiendo que los cambios siguen igual (cada paso = `stepYears` años).
 */
import { LAND_STATES, type LandState } from './kinds';

export type Vec = number[];
export type Matrix = number[][];

const N = LAND_STATES.length;

/** Pasa de milésimas (o cualquier escala) a fracciones que suman 1. Sin datos → reparto vacío (ceros). */
export function normalize(v: readonly number[]): Vec {
  const sum = v.reduce((a, b) => a + Math.max(0, b), 0);
  return sum > 0 ? v.map((x) => Math.max(0, x) / sum) : v.map(() => 0);
}

/**
 * Matriz de transición y estados inicial/final a partir de las 16 fracciones conjuntas (fila por fila).
 * Una fila sin área (ese estado no existía al inicio) se deja como "se queda igual": no inventa cambios.
 */
export function fromJoint(t: readonly number[]): { P: Matrix; p0: Vec; p1: Vec } {
  if (t.length !== N * N) throw new Error(`markov: se esperaban ${N * N} valores`);
  const joint = normalize(t);
  const P: Matrix = [];
  const p0: Vec = [];
  for (let i = 0; i < N; i++) {
    const row = joint.slice(i * N, i * N + N);
    const mass = row.reduce((a, b) => a + b, 0);
    p0.push(mass);
    P.push(mass > 0 ? row.map((x) => x / mass) : row.map((_, j) => (j === i ? 1 : 0)));
  }
  const p1 = LAND_STATES.map((_, j) => joint.reduce((acc, x, k) => (k % N === j ? acc + x : acc), 0));
  return { P, p0, p1 };
}

/** Un paso: p · P. */
export function step(p: readonly number[], P: Matrix): Vec {
  return LAND_STATES.map((_, j) => p.reduce((acc, pi, i) => acc + pi * (P[i]?.[j] ?? 0), 0));
}

/** k pasos hacia adelante (k ≥ 0). */
export function project(p: readonly number[], P: Matrix, k: number): Vec {
  let out = [...p];
  for (let s = 0; s < k; s++) out = step(out, P);
  return out;
}

/**
 * Estado al que tiende el terreno si los cambios siguieran igual para siempre (distribución estacionaria),
 * por iteración de potencias desde el reparto uniforme. Con estados que nunca se dejan, gana el que absorbe.
 */
export function stationary(P: Matrix, maxIter = 2000, tol = 1e-10): Vec {
  let p: Vec = LAND_STATES.map(() => 1 / N);
  for (let it = 0; it < maxIter; it++) {
    const next = step(p, P);
    const diff = next.reduce((acc, x, i) => acc + Math.abs(x - p[i]!), 0);
    p = next;
    if (diff < tol) break;
  }
  return normalize(p);
}

export type Transition = { from: LandState; to: LandState; /** P[i][j] */ prob: number; /** p0[i]·P[i][j]: parte del área total */ share: number };

/** Cambios entre estados distintos, de mayor a menor área movida. `min` filtra por probabilidad. */
export function transitions(p0: readonly number[], P: Matrix, min = 0.05): Transition[] {
  const out: Transition[] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const prob = P[i]?.[j] ?? 0;
      const share = (p0[i] ?? 0) * prob;
      if (prob >= min && (p0[i] ?? 0) >= 0.01) out.push({ from: LAND_STATES[i]!, to: LAND_STATES[j]!, prob, share });
    }
  return out.sort((a, b) => b.share - a.share);
}

export type ChangeSummary = {
  /** Estado que más cambió de tamaño (en puntos porcentuales). */
  biggest: { state: LandState; from: number; to: number; delta: number };
  /** Mayor flujo de área entre dos estados distintos. */
  mainFlow: Transition | null;
  /** Lo que se mantiene de cada estado (diagonal de P). */
  stay: Record<LandState, number>;
  /** Mejora = más vegetación sana y menos suelo expuesto; ±3 puntos se considera estable. */
  trend: 'improving' | 'worsening' | 'stable';
};

export function summarize(p0: readonly number[], p1: readonly number[], P: Matrix): ChangeSummary {
  let biggest: ChangeSummary['biggest'] = { state: LAND_STATES[0], from: p0[0] ?? 0, to: p1[0] ?? 0, delta: (p1[0] ?? 0) - (p0[0] ?? 0) };
  LAND_STATES.forEach((state, i) => {
    const delta = (p1[i] ?? 0) - (p0[i] ?? 0);
    if (Math.abs(delta) > Math.abs(biggest.delta)) biggest = { state, from: p0[i] ?? 0, to: p1[i] ?? 0, delta };
  });
  const iHealthy = LAND_STATES.indexOf('healthy');
  const iBare = LAND_STATES.indexOf('bare');
  const score = (p: readonly number[]) => (p[iHealthy] ?? 0) - (p[iBare] ?? 0);
  const d = score(p1) - score(p0);
  const stay = Object.fromEntries(LAND_STATES.map((s, i) => [s, P[i]?.[i] ?? 0])) as Record<LandState, number>;
  return {
    biggest,
    mainFlow: transitions(p0, P, 0).find((t) => t.share >= 0.005) ?? null,
    stay,
    trend: d > 0.03 ? 'improving' : d < -0.03 ? 'worsening' : 'stable',
  };
}

/** Porcentaje entero para mostrar (0,486 → 49). */
export const pct = (x: number) => Math.round(x * 100);
