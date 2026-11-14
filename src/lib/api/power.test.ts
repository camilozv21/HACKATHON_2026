import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/power-monthly-quindio.json';
import { ClimateProfile } from './contract';
import { estimateHeatDays, PowerMonthlyResponse, powerCacheKey, powerToClimate } from './power';

// Respuesta real de NASA POWER (mensual, comunidad AG, 2001–2025) para la finca demo de Quindío.
const raw = PowerMonthlyResponse.parse(fixture);
const climate = powerToClimate(raw, { lat: 4.54, lon: -75.77 });

describe('NASA POWER → ClimateProfile', () => {
  it('produce un perfil que cumple el contrato', () => {
    const parsed = ClimateProfile.safeParse(climate);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3)));
    expect(climate.months).toHaveLength(12);
  });

  it('usa el último año completo como "reciente" y el resto como línea base', () => {
    expect(climate.latestYear).toBe(2025);
    expect(climate.baselinePeriod).toBe('2001–2024');
    expect(climate.trend[0]!.year).toBe(2001);
    expect(climate.trend.at(-1)!.year).toBe(2025);
  });

  it('la lluvia mensual promedio suma la lluvia anual promedio', () => {
    const sumMonths = climate.months.reduce((a, m) => a + (m.precip.value ?? 0), 0);
    expect(sumMonths).toBeGreaterThan(1200);
    expect(Math.abs(sumMonths - (climate.summary.annualPrecipMm ?? 0))).toBeLessThan(25);
  });

  it('convierte EVPTRNS (MJ/m²/día) a mm/mes y GWETROOT (0–1) a %', () => {
    const july = climate.months[6]!;
    expect(july.et.unit).toBe('mm');
    expect(july.et.value).toBeGreaterThan(20);
    expect(july.et.value).toBeLessThan(200);
    expect(july.soilMoisture.unit).toBe('%');
    expect(july.soilMoisture.value).toBeGreaterThan(0);
    expect(july.soilMoisture.value).toBeLessThanOrEqual(100);
  });

  it('cada métrica dice su fuente; NDVI queda vacío porque POWER no lo tiene', () => {
    expect(climate.months[0]!.tMean.source).toBe('NASA POWER');
    expect(climate.months[0]!.ndvi.value).toBeNull();
    expect(climate.months[0]!.heatDays.estimated).toBe(true);
  });

  it('guarda la elevación de la celda y calcula tendencias', () => {
    expect(climate.location.elevationM).toBeGreaterThan(1000);
    expect(climate.summary.tempChangeC).not.toBeNull();
    expect(climate.summary.precipChangePct).not.toBeNull();
  });
});

describe('utilidades', () => {
  it('días de calor: casi 0 con máximas de 25 °C, muchos con 38 °C', () => {
    expect(estimateHeatDays(25)).toBeLessThan(0.1);
    expect(estimateHeatDays(38)!).toBeGreaterThan(20);
  });
  it('cachea por celda de 0.1°', () => {
    expect(powerCacheKey(4.5412, -75.7689)).toEqual(['power', '4.5', '-75.8']);
  });
});
