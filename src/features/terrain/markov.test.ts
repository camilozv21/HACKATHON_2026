import { fromJoint, normalize, project, stationary, step, summarize, transitions } from './markov';

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe('markov', () => {
  // 1000 = todo el área. Fila = estado inicial (sana, estrés, expuesto, agua), columna = estado final.
  const t = [
    400, 80, 20, 0, // sana 500
    50, 250, 50, 0, // estrés 350
    0, 30, 70, 0, // expuesto 100
    0, 0, 0, 50, // agua 50
  ];

  it('saca la matriz y los estados inicial y final de las fracciones conjuntas', () => {
    const { P, p0, p1 } = fromJoint(t);
    const milli = (v: number[]) => v.map((x) => Math.round(x * 1000));
    expect(milli(p0)).toEqual([500, 350, 100, 50]);
    expect(milli(p1)).toEqual([450, 360, 140, 50]);
    for (const row of P) expect(sum(row)).toBeCloseTo(1, 10);
    expect(milli(P[0]!)).toEqual([800, 160, 40, 0]);
  });

  it('una fila sin área se queda en su estado (no inventa cambios)', () => {
    const { P } = fromJoint([500, 0, 0, 0, 0, 500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(P[2]).toEqual([0, 0, 1, 0]);
    expect(P[3]).toEqual([0, 0, 0, 1]);
  });

  it('un paso desde el estado inicial da el estado final', () => {
    const { P, p0, p1 } = fromJoint(t);
    step(p0, P).forEach((x, i) => expect(x).toBeCloseTo(p1[i]!, 10));
    expect(project(p0, P, 0)).toEqual(p0);
    expect(sum(project(p1, P, 3))).toBeCloseTo(1, 10);
  });

  it('la distribución estacionaria no cambia con un paso más', () => {
    const { P } = fromJoint(t);
    const pi = stationary(P);
    expect(sum(pi)).toBeCloseTo(1, 8);
    step(pi, P).forEach((x, i) => expect(x).toBeCloseTo(pi[i]!, 6));
  });

  it('lista los cambios de mayor a menor área y resume la tendencia', () => {
    const { P, p0, p1 } = fromJoint(t);
    const flows = transitions(p0, P, 0.05);
    expect(flows[0]).toMatchObject({ from: 'healthy', to: 'stressed' });
    expect(flows.every((f) => f.prob >= 0.05)).toBe(true);
    const s = summarize(p0, p1, P);
    expect(s.trend).toBe('worsening'); // sana −5, expuesto +4
    expect(s.biggest.state).toBe('healthy');
    expect(s.stay.water).toBe(1);
  });

  it('normaliza ceros sin dividir por cero', () => {
    expect(normalize([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    expect(() => fromJoint([1, 2, 3])).toThrow();
  });
});
