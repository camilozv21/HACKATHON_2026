import { useFormatter } from 'next-intl';
import { usePrefsStore, type Units } from './prefs';

/** Conversión de unidades: los datos llegan siempre en métrico (mm, °C, ha). */
export const mmToIn = (mm: number) => mm / 25.4;
export const cToF = (c: number) => (c * 9) / 5 + 32;
/** Diferencias de temperatura (anomalías, calentamiento): solo escala, sin el +32. */
export const dCToDF = (dc: number) => (dc * 9) / 5;
export const haToAc = (ha: number) => ha * 2.4710538;
export const mToFt = (m: number) => m * 3.28084;

type Fmt = ReturnType<typeof useFormatter>;

export function unitFormatters(units: Units, format: Fmt) {
  const n = (v: number, digits: number) => format.number(v, { maximumFractionDigits: digits });
  const imperial = units === 'imperial';
  return {
    units,
    /** Lluvia o agua: "843 mm" | "33.2 in". */
    rain: (mm: number) => (imperial ? `${n(mmToIn(mm), 1)} in` : `${n(mm, 0)} mm`),
    /** Temperatura: "31 °C" | "88 °F". */
    temp: (c: number) => (imperial ? `${n(cToF(c), 0)} °F` : `${n(c, 0)} °C`),
    /** Diferencia de temperatura: "0.8 °C" | "1.4 °F". */
    tempDelta: (dc: number) => (imperial ? `${n(dCToDF(dc), 1)} °F` : `${n(dc, 1)} °C`),
    /** Área: "64 ha" | "158 ac". */
    area: (ha: number) => (imperial ? `${n(haToAc(ha), ha < 4 ? 1 : 0)} ac` : `${n(ha, ha < 10 ? 1 : 0)} ha`),
    /** Altura o profundidad: "2,5 m" | "8.2 ft". */
    length: (m: number) => (imperial ? `${n(mToFt(m), mToFt(m) < 10 ? 1 : 0)} ft` : `${n(m, m < 10 ? 1 : 0)} m`),
    rainUnit: imperial ? 'in' : 'mm',
    tempUnit: imperial ? '°F' : '°C',
    /** Valor numérico de lluvia en la unidad elegida (para ejes de gráficas). */
    rainValue: (mm: number) => (imperial ? mmToIn(mm) : mm),
    tempValue: (c: number) => (imperial ? cToF(c) : c),
  };
}

/** Formateadores con la unidad que eligió la persona (métrico por defecto). */
export function useUnits() {
  const units = usePrefsStore((s) => s.units);
  const format = useFormatter();
  return unitFormatters(units, format);
}
