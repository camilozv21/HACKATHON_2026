import { beforeEach, describe, expect, it } from 'vitest';
import type { RadioSegment } from '@/lib/api/contract';
import { placeProgram, upgradeProgram } from './programClient';
import { useRadioStore } from './store';

const seg = (id: string, extra: Partial<RadioSegment> = {}): RadioSegment => ({
  id,
  type: 'tip',
  title: id,
  durationSec: 10,
  transcript: `${id}.`,
  regionId: 'x',
  ...extra,
});

const ids = () => useRadioStore.getState().segments.map((s) => s.id);

describe('programa en la cola de la radio', () => {
  beforeEach(() => {
    useRadioStore.setState({ segments: [seg('grabado-1'), seg('grabado-2')], index: 0 });
  });

  it('va delante si la radio aún no suena', () => {
    placeProgram([seg('p:intro'), seg('p:clima')], false);
    expect(ids()).toEqual(['p:intro', 'p:clima', 'grabado-1', 'grabado-2']);
    expect(useRadioStore.getState().index).toBe(0);
  });

  it('entra después del segmento que suena, sin repetir bloques', () => {
    placeProgram([seg('p:intro')], true);
    placeProgram([seg('p:intro'), seg('p:clima')], true);
    expect(ids()).toEqual(['grabado-1', 'p:clima', 'p:intro', 'grabado-2']);
  });

  it('la versión de Claude reemplaza solo lo que aún no sonó', () => {
    useRadioStore.setState({ segments: [seg('p:intro'), seg('p:clima'), seg('grabado-1')], index: 0 });
    upgradeProgram([seg('p:intro', { title: 'nuevo' }), seg('p:clima', { title: 'nuevo' })], true);
    const s = useRadioStore.getState().segments;
    expect(s[0]!.title).toBe('p:intro');
    expect(s[1]!.title).toBe('nuevo');
    expect(s[2]!.id).toBe('grabado-1');
  });
});
