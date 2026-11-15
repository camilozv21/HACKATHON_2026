import { describe, expect, it } from 'vitest';
import { localCell, localFrequency, localStation, localStationId, parseLocalStationId, shortPlace } from './local';
import { sentenceAt, sentenceStarts, speechSeconds, splitSentences } from './sentences';
import { termsIn } from './terms';

describe('splitSentences', () => {
  it('corta en puntos, signos y puntos suspensivos', () => {
    expect(splitSentences('Hola. ¿Cómo va la lluvia? ¡Bien! Sigue…  Fin')).toEqual(['Hola.', '¿Cómo va la lluvia?', '¡Bien!', 'Sigue…', 'Fin']);
  });

  it('no parte números ni abreviaturas', () => {
    expect(splitSentences('El kilo va en 1.250 pesos. Subió 3.5 por ciento aprox. este mes.')).toEqual([
      'El kilo va en 1.250 pesos.',
      'Subió 3.5 por ciento aprox. este mes.',
    ]);
  });

  it('texto vacío → sin frases', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('frases de un mp3', () => {
  it('reparte la duración según el largo de cada frase', () => {
    const starts = sentenceStarts(['aaaa', 'aaaa', 'aaaaaaaa'], 16);
    expect(starts).toEqual([0, 4, 8]);
    expect(sentenceAt(starts, 0)).toBe(0);
    expect(sentenceAt(starts, 5)).toBe(1);
    expect(sentenceAt(starts, 15.9)).toBe(2);
  });

  it('estima la duración leída en voz alta', () => {
    expect(speechSeconds('uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece')).toBe(5);
    expect(speechSeconds('hola')).toBe(2);
  });
});

describe('emisora de la zona', () => {
  it('agrupa en celdas de 0,25° con un id estable', () => {
    expect(localCell(4.53, -75.68)).toEqual({ lat: 4.5, lon: -75.75 });
    expect(localStationId(4.53, -75.68)).toBe('local:4.50,-75.75');
    expect(localStationId(4.6, -75.7)).toBe(localStationId(4.55, -75.8));
    expect(parseLocalStationId('local:4.50,-75.75')).toEqual({ lat: 4.5, lon: -75.75 });
    expect(parseLocalStationId('quindio')).toBeNull();
  });

  it('da una frecuencia FM estable y válida', () => {
    const f = localFrequency(4.53, -75.68);
    expect(f).toBe(localFrequency(4.55, -75.7));
    const n = Number(f.replace(' FM', ''));
    expect(n).toBeGreaterThanOrEqual(88.1);
    expect(n).toBeLessThanOrEqual(107.9);
    expect(Math.round(n * 10) % 2).toBe(1);
  });

  it('nombra la emisora por el lugar', () => {
    expect(shortPlace('Salento, Quindío')).toBe('Salento');
    const s = localStation(4.6, -75.6, 'Salento, Quindío', 'es');
    expect(s).toMatchObject({ name: 'Radio Campo Salento', region: 'Salento, Quindío', local: true, language: 'es' });
    expect(localStation(42, -93.6, 'Ames, Iowa', 'en').name).toBe('Farm Radio Ames');
  });
});

describe('términos del locutor', () => {
  it('encuentra los términos técnicos de una frase', () => {
    expect(termsIn('Es lo que los técnicos llaman NDVI: el verdor de las plantas.')).toEqual(['ndvi']);
    expect(termsIn('El satélite SMAP ve la humedad del suelo baja.')).toEqual(['soil-moisture']);
    expect(termsIn('Hola a todos.')).toEqual([]);
    expect(termsIn(undefined)).toEqual([]);
  });
});
