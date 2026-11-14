import { describe, expect, it } from 'vitest';
import type { CropSeason, DataRequest } from '@/lib/api/contract';
import { answeredNeeds, pendingNeeds, toSoilInfo, type NeedState } from './needs';

const EMPTY: NeedState = { soil: undefined, rotation: null, irrigationKnown: false };
const ROT: CropSeason[] = [{ crop: 'maize', startMonth: 4, endMonth: 9, year: 1, role: 'cash' }];
const needs = (s: NeedState, backend?: DataRequest[] | null) => pendingNeeds(s, backend).map((n) => n.need);

describe('datos que faltan', () => {
  it('sin respuesta del backend pide todo, en orden: rotación, tierra, riego, encharcamiento y análisis', () => {
    expect(needs(EMPTY)).toEqual(['current-rotation', 'soil-type', 'irrigation', 'drainage', 'soil-test']);
  });

  it('lo que la persona ya contestó no se vuelve a pedir ("no sé" y "no tengo análisis" también cuentan)', () => {
    const s: NeedState = { soil: { texture: 'unknown', noTest: true }, rotation: ROT, irrigationKnown: true };
    expect(needs(s)).toEqual(['drainage']);
    expect(answeredNeeds(s)).toEqual(['current-rotation', 'soil-type', 'irrigation', 'soil-test']);
  });

  it('el backend manda en los datos de la finca, pero el riego lo sabe el cliente', () => {
    const backend: DataRequest[] = [{ need: 'soil-test', impact: 'low', reason: 'Para la cal.' }];
    const list = pendingNeeds(EMPTY, backend);
    expect(list.map((n) => n.need)).toEqual(['irrigation', 'soil-test']);
    expect(list[1]).toMatchObject({ impact: 'low', reason: 'Para la cal.' });
    // [] = al backend no le falta nada: solo queda el riego si no se ha contestado.
    expect(needs(EMPTY, [])).toEqual(['irrigation']);
    expect(needs({ ...EMPTY, irrigationKnown: true }, [])).toEqual([]);
  });

  it('un dato contestado deja de pedirse aunque el análisis anterior todavía lo pida', () => {
    const backend: DataRequest[] = [{ need: 'soil-type', impact: 'high', reason: 'x' }];
    expect(needs({ ...EMPTY, soil: { texture: 'clay' }, irrigationKnown: true }, backend)).toEqual([]);
  });

  it('el suelo solo viaja al backend si hay algún dato, con la textura "unknown" si no la dijo', () => {
    expect(toSoilInfo(undefined)).toBeUndefined();
    expect(toSoilInfo({ noTest: true })).toBeUndefined();
    expect(toSoilInfo({ drainage: 'poor' })).toEqual({ texture: 'unknown', drainage: 'poor' });
    expect(toSoilInfo({ texture: 'sandy', ph: 5.4, organicMatterPct: undefined, noTest: undefined })).toEqual({ texture: 'sandy', ph: 5.4 });
  });
});
