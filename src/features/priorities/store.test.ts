import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIORITIES } from '@/lib/api/contract';
import { cleanMarket, decodePriorities, encodePriorities, usePrioritiesStore } from './store';

describe('prioridades en la URL', () => {
  it('ida y vuelta conserva pesos, riego, maquinaria y mercados', () => {
    const p = {
      ...DEFAULT_PRIORITIES,
      waterSaving: 5,
      income: 1,
      constraints: { irrigation: 'limited' as const, equipment: ['tractor', 'seed-drill'], markets: ['maize', 'Queso fresco'] },
    };
    const { pr, eq, mk } = encodePriorities(p);
    expect(pr).toBe('531132l');
    expect(decodePriorities(pr, eq, mk)).toEqual(p);
  });

  it('rechaza valores mal formados y filtra maquinaria desconocida', () => {
    expect(decodePriorities('99', null, null)).toBeNull();
    expect(decodePriorities('533132x', null, null)).toBeNull();
    expect(decodePriorities('533132n', ['tractor', 'rocket'], null)?.constraints.equipment).toEqual(['tractor']);
  });

  it('limpia el texto libre de mercados', () => {
    expect(cleanMarket('  leche,  queso |  ')).toBe('leche queso');
    expect(cleanMarket('x'.repeat(50))).toHaveLength(30);
  });
});

describe('store de prioridades', () => {
  it('mucho/algo/poco guarda 5/3/1 y no repite mercados', () => {
    const s = usePrioritiesStore.getState();
    s.setLevel('forage', 'high');
    expect(usePrioritiesStore.getState().priorities.forage).toBe(5);
    s.setLevel('forage', 'low');
    expect(usePrioritiesStore.getState().priorities.forage).toBe(1);
    expect(s.addMarket('Café especial')).toBe(true);
    expect(usePrioritiesStore.getState().addMarket('café ESPECIAL')).toBe(false);
    expect(usePrioritiesStore.getState().addMarket('   ')).toBe(false);
  });
});
