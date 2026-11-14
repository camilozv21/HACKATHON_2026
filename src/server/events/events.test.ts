import { describe, expect, it } from 'vitest';
import { eventWindow, parseWindow } from '@/features/events/window';
import { HazardEvent } from '@/lib/api/contract';
import { addReport, communityEvents, redact } from './community';
import { municipio, nearestMunicipio, padCode } from './divipola';
import { toEvent } from './eonet';
import { eonetKind, ungrdKind } from './kinds';

const NOW = new Date('2026-11-11T15:00:00Z');

describe('tipos de evento', () => {
  it('UNGRD: solo eventos agroclimáticos, sin importar tildes ni mayúsculas', () => {
    expect(ungrdKind('MOVIMIENTO EN MASA')).toBe('landslide');
    expect(ungrdKind('Movimiento en Masa')).toBe('landslide');
    expect(ungrdKind('INUNDACIÓN')).toBe('flood');
    expect(ungrdKind('Creciente Subita')).toBe('flood');
    expect(ungrdKind('INCENDIO DE COBERTURA VEGETAL')).toBe('wildfire');
    expect(ungrdKind('DESABASTECIMIENTO DE AGUA')).toBe('drought');
    expect(ungrdKind('ACTIVACIÓN VOLCANICA')).toBe('volcano');
    expect(ungrdKind('INCENDIO ESTRUCTURAL')).toBeNull();
    expect(ungrdKind('ACCIDENTE TRANSPORTE TERRESTRE')).toBeNull();
  });

  it('EONET: categorías → tipo; hielo marino y eventos humanos no se muestran', () => {
    expect(eonetKind(['wildfires'])).toBe('wildfire');
    expect(eonetKind(['severeStorms'])).toBe('storm');
    expect(eonetKind(['seaLakeIce'])).toBeNull();
    expect(eonetKind(['manmade', 'floods'])).toBe('flood');
  });
});

describe('DIVIPOLA', () => {
  it('rellena el cero inicial y encuentra el municipio', () => {
    expect(padCode('5656')).toBe('05656');
    expect(municipio('63690')?.name).toBe('Salento');
    expect(municipio('5001')?.name).toBe('Medellín');
  });

  it('municipio más cercano solo en Colombia', () => {
    expect(nearestMunicipio(4.637, -75.571)?.code).toBe('63690');
    expect(nearestMunicipio(42, -93.5)).toBeNull();
  });
});

describe('periodo de eventos', () => {
  it('presente: últimos 90 días; máquina del tiempo: el mes', () => {
    expect(eventWindow(null, NOW)).toEqual({ from: '2026-08-14', to: '2026-11-11', recent: true });
    expect(eventWindow({ kind: 'month', ym: '2025-05' }, NOW)).toEqual({ from: '2025-05-01', to: '2025-05-31', recent: false });
  });

  it('valida fechas de la URL', () => {
    expect(parseWindow('2025-05-01', '2025-05-31', NOW)).toEqual({ from: '2025-05-01', to: '2025-05-31', recent: false });
    expect(parseWindow('2025-02-30', '2025-03-01', NOW)).toBeNull();
    expect(parseWindow('2025-06-01', '2025-05-01', NOW)).toBeNull();
    expect(parseWindow('2024-01-01', '2025-01-01', NOW)).toBeNull();
    expect(parseWindow('2026-11-01', '2026-12-31', NOW)?.to).toBe('2026-11-11');
  });
});

describe('EONET → evento', () => {
  it('usa la última posición dentro del periodo y enlaza a Worldview', () => {
    const e = toEvent(
      {
        id: 'EONET_1',
        title: 'Tropical Storm X',
        categories: [{ id: 'severeStorms' }],
        geometry: [
          { date: '2026-10-01T00:00:00Z', type: 'Point', coordinates: [-80, 12] },
          { date: '2026-10-03T00:00:00Z', type: 'Point', coordinates: [-81, 13], magnitudeValue: 45, magnitudeUnit: 'kts' },
          { date: '2026-10-09T00:00:00Z', type: 'Point', coordinates: [-85, 15] },
        ],
      },
      '2026-10-05',
    );
    expect(e).toMatchObject({ kind: 'storm', date: '2026-10-03', lon: -81, lat: 13, magnitude: { value: 45, unit: 'kts' } });
    expect(e?.url).toBe('https://worldview.earthdata.nasa.gov/?e=EONET_1');
    expect(HazardEvent.safeParse(e).success).toBe(true);
  });
});

describe('reportes de la comunidad', () => {
  it('quita correos, teléfonos y enlaces', () => {
    expect(redact('Llamen al 312 555 1234 o escriban a ana@correo.com, foto en https://x.co/a')).toBe('Llamen al […] o escriban a […] foto en […]');
    expect(redact('Bajaron 3 metros de tierra')).toBe('Bajaron 3 metros de tierra');
  });

  it('guarda el reporte sin verificar, redondeado y con municipio; limita el ritmo', () => {
    const now = NOW.getTime();
    const input = { kind: 'landslide' as const, date: '2026-11-10', lat: 4.63712, lon: -75.57088, impacts: ['road' as const], note: 'Tapó la vía' };
    const r = addReport(input, 'test-a', now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({ source: 'community', verified: false, lat: 4.637, lon: -75.571, place: 'Salento, Quindío' });
    expect(HazardEvent.safeParse(r.report).success).toBe(true);
    expect(communityEvents('2026-11-10', '2026-11-10').some((e) => e.id === r.report.id)).toBe(true);

    expect(addReport({ ...input, date: '2026-12-01' }, 'test-b', now)).toEqual({ ok: false, reason: 'date' });
    for (let i = 0; i < 4; i++) addReport(input, 'test-a', now);
    expect(addReport(input, 'test-a', now)).toEqual({ ok: false, reason: 'rate' });
  });
});
