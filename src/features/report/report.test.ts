import { describe, expect, it } from 'vitest';
import type { ClimateProfile } from '@/lib/api/contract';
import type { PowerDay } from '@/lib/api/power';
import { buildReport, parseReportQuery, reportCsv, reportHref, reportPeriod } from './report';

const NOW = new Date('2026-11-11T15:00:00Z');

const metric = (value: number | null, unit = '') => ({ value, unit, source: 'NASA POWER' as const, resolution: '0.5°', period: '2001–2020', confidence: 'medium' as const });
// Mayo: 155 mm normales (5 mm/día), temperatura media normal 20 °C, suelo 60 %.
const climate = {
  months: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    precip: metric(i === 4 ? 155 : 90, 'mm'),
    tMean: metric(20, '°C'),
    soilMoisture: metric(60, '%'),
  })),
} as unknown as ClimateProfile;

const day = (d: number, precip: number | null, tmax = 27, tmin = 15, soil = 55, tmean = 21): PowerDay => ({
  date: `2025-05-${String(d).padStart(2, '0')}`,
  precip,
  tmax,
  tmin,
  tmean,
  soil,
});

describe('informe agroclimático', () => {
  it('periodo: un mes con la máquina del tiempo o los últimos 30 días con datos', () => {
    expect(reportPeriod('2025-05', NOW)).toMatchObject({ start: '2025-05-01', end: '2025-05-31', days: 31, partial: false });
    expect(reportPeriod('2025-05-14', NOW)).toMatchObject({ start: '2025-05-01', end: '2025-05-31' });
    expect(reportPeriod(null, NOW)).toMatchObject({ start: '2026-10-10', end: '2026-11-08', days: 30, sel: null });
    expect(reportPeriod('2030-01', NOW).sel).toBeNull();
  });

  it('enlace y lectura de la URL', () => {
    const href = reportHref('es', { lat: 4.63712, lon: -75.57088, name: 'Salento, Quindío', when: '2025-05' });
    expect(href).toBe('/es/report?lat=4.6371&lon=-75.5709&name=Salento%2C+Quind%C3%ADo&t=2025-05');
    const q = parseReportQuery(new URL(`http://x${href}`).searchParams);
    expect(q).toEqual({ lat: 4.6371, lon: -75.5709, name: 'Salento, Quindío', when: '2025-05' });
    expect(parseReportQuery(new URLSearchParams('lat=99&lon=0'))).toBeNull();
    expect(parseReportQuery(new URLSearchParams('lon=0'))).toBeNull();
  });

  it('mes seco: lluvia bajo lo normal, racha seca y temperaturas contra lo normal', () => {
    const days = Array.from({ length: 31 }, (_, i) => day(i + 1, i < 10 ? 0 : 3, 29, 16, 40));
    const r = buildReport(days, climate, 31);
    expect(r.summary.totalMm).toBe(63);
    expect(r.summary.normalMm).toBe(155);
    expect(r.summary.pct).toBe(-59);
    expect(r.summary.events.some((e) => e.kind === 'drySpell' && e.days === 10)).toBe(true);
    expect(r).toMatchObject({ tmaxAvg: 29, tminAvg: 16, tmeanAvg: 21, tmeanNormal: 20, soilAvg: 40, soilNormal: 60, daysWithData: 31 });
    expect(r.watch[0]).toBe('dry');
  });

  it('sin señales fuertes: "calm"; sin climatología no inventa lo normal', () => {
    const days = Array.from({ length: 31 }, (_, i) => day(i + 1, 5));
    expect(buildReport(days, climate, 31).watch).toEqual(['calm']);
    const r = buildReport(days, null, 31);
    expect(r.summary.normalMm).toBeNull();
    expect(r.tmeanNormal).toBeNull();
  });

  it('CSV: punto y coma con coma decimal en español, con BOM y encabezado de fuente', () => {
    const csv = reportCsv([day(1, 12.34), day(2, null)], climate, { place: 'Salento; Quindío', lat: 4.6, lon: -75.6, start: '2025-05-01', end: '2025-05-02', generated: '2026-11-11' }, 'es');
    expect(csv.startsWith('﻿# Informe agroclimático')).toBe(true);
    expect(csv).toContain('fecha;lluvia_mm;lluvia_normal_mm;temp_media_c;temp_media_normal_c;temp_max_c;temp_min_c;humedad_suelo_raices_pct');
    expect(csv).toContain('2025-05-01;12,3;5,0;21,0;20,0;27,0;15,0;55');
    expect(csv).toContain('2025-05-02;;5,0;21,0;20,0;27,0;15,0;55');
    const en = reportCsv([day(1, 12.34)], climate, { place: 'Salento', lat: 4.6, lon: -75.6, start: '2025-05-01', end: '2025-05-01', generated: '2026-11-11' }, 'en');
    expect(en).toContain('2025-05-01,12.3,5.0,21.0,20.0,27.0,15.0,55');
  });
});
