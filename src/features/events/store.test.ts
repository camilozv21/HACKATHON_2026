import { beforeEach, describe, expect, it } from 'vitest';
import { useEventsStore } from './store';

describe('formulario de reporte', () => {
  beforeEach(() => useEventsStore.getState().closeReport());

  it('una respuesta tardía (nombre del lugar) no reabre el formulario cerrado', () => {
    const s = useEventsStore.getState();
    s.openReport({ lat: 4.6, lon: -75.6 });
    s.closeReport();
    s.updateReport({ place: 'Salento' });
    s.setReportPlace(4.6, -75.6, 'Salento');
    expect(useEventsStore.getState().report).toBeNull();
  });

  it('el nombre solo se aplica al mismo punto', () => {
    const s = useEventsStore.getState();
    s.openReport({ lat: 4.6, lon: -75.6 });
    s.setReportPlace(5, -74, 'Otro lugar');
    expect(useEventsStore.getState().report?.place).toBeUndefined();
    s.setReportPlace(4.6, -75.6, 'Salento');
    expect(useEventsStore.getState().report?.place).toBe('Salento');
  });
});
