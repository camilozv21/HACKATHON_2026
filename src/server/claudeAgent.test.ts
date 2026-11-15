// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { expandActions } from './claudeAgent';

describe('expandActions (salida { type, args } del agente de Claude)', () => {
  it('desarma los campos de args en la acción del contrato', () => {
    expect(
      expandActions([
        { type: 'flyTo', args: '{"lat": 4.64, "lon": -75.57, "zoom": 9, "label": "Salento"}' },
        { type: 'setLayer', args: '{"layerId": "rain"}' },
        { type: 'clearLayers', args: '{}' },
        { type: 'setTime', args: '{"when": null}' },
      ]),
    ).toEqual([
      { type: 'flyTo', lat: 4.64, lon: -75.57, zoom: 9, label: 'Salento' },
      { type: 'setLayer', layerId: 'rain' },
      { type: 'clearLayers' },
      { type: 'setTime', when: null },
    ]);
  });

  it('acepta args vacío como acción sin campos', () => {
    expect(expandActions([{ type: 'clearLayers', args: '' }])).toEqual([{ type: 'clearLayers' }]);
  });

  it('descarta las acciones con args ilegible o que no validan, sin perder las demás', () => {
    expect(
      expandActions([
        { type: 'flyTo', args: '{lat: 4' },
        { type: 'setLayer', args: '{"layerId": "no-existe"}' },
        { type: 'openRegion', args: '[1, 2]' },
        { type: 'inventada', args: '{}' },
        { type: 'openRegion', args: '{"lat": 4.6, "lon": -75.5, "name": "Salento"}' },
      ]),
    ).toEqual([{ type: 'openRegion', lat: 4.6, lon: -75.5, name: 'Salento' }]);
  });

  it('el type de la acción manda sobre un type dentro de args', () => {
    expect(expandActions([{ type: 'clearLayers', args: '{"type": "flyTo"}' }])).toEqual([{ type: 'clearLayers' }]);
  });

  it('sin lista devuelve vacío', () => {
    expect(expandActions(undefined)).toEqual([]);
    expect(expandActions('flyTo')).toEqual([]);
  });
});
