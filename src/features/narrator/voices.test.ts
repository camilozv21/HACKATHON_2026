import { describe, expect, it } from 'vitest';
import { pickVoice, speakable } from './voices';

// Así llegan en Chrome de macOS (el orden real: las robóticas primero).
const MAC_ES = [
  { name: 'Eddy (Spanish (Spain))', lang: 'es-ES', voiceURI: 'Eddy (Spanish (Spain))' },
  { name: 'Eddy (Spanish (Mexico))', lang: 'es-MX', voiceURI: 'Eddy (Spanish (Mexico))' },
  { name: 'Grandpa (Spanish (Mexico))', lang: 'es-MX', voiceURI: 'Grandpa (Spanish (Mexico))' },
  { name: 'Mónica', lang: 'es-ES', voiceURI: 'Mónica' },
  { name: 'Paulina', lang: 'es-MX', voiceURI: 'Paulina' },
  { name: 'Shelley (Spanish (Mexico))', lang: 'es-MX', voiceURI: 'Shelley (Spanish (Mexico))' },
];

describe('elegir la voz', () => {
  it('no usa las voces robóticas de Apple aunque salgan primero', () => {
    expect(pickVoice(MAC_ES, 'es')?.name).toBe('Paulina');
    const en = [
      { name: 'Albert', lang: 'en-US' },
      { name: 'Bad News', lang: 'en-US' },
      { name: 'Eddy (English (US))', lang: 'en-US' },
      { name: 'Samantha', lang: 'en-US' },
    ];
    expect(pickVoice(en, 'en')?.name).toBe('Samantha');
    // En Safari el nombre es corto, pero el voiceURI dice "eloquence".
    expect(pickVoice([{ name: 'Eddy', lang: 'es-MX', voiceURI: 'com.apple.eloquence.es-MX.Eddy' }, { name: 'Mónica', lang: 'es-ES' }], 'es')?.name).toBe('Mónica');
  });

  it('prefiere el acento de Colombia y las voces naturales o mejoradas', () => {
    const edge = [
      { name: 'Microsoft Sabina - Spanish (Mexico)', lang: 'es-MX' },
      { name: 'Microsoft Salome Online (Natural) - Spanish (Colombia)', lang: 'es-CO' },
    ];
    expect(pickVoice(edge, 'es')?.name).toMatch(/Salome/);
    const apple = [
      { name: 'Paulina', lang: 'es-MX', voiceURI: 'com.apple.voice.compact.es-MX.Paulina' },
      { name: 'Paulina (mejorada)', lang: 'es-MX', voiceURI: 'com.apple.voice.premium.es-MX.Paulina' },
    ];
    expect(pickVoice(apple, 'es')?.voiceURI).toMatch(/premium/);
  });

  it('si solo hay voces robóticas, usa una de ellas antes que quedarse sin voz', () => {
    expect(pickVoice([{ name: 'Eddy', lang: 'es-ES', voiceURI: 'com.apple.eloquence.es-ES.Eddy' }], 'es')?.name).toBe('Eddy');
    expect(pickVoice([{ name: 'Thomas', lang: 'fr-FR' }], 'es')).toBeNull();
    // "est" no es español.
    expect(pickVoice([{ name: 'x', lang: 'et-EE' }], 'es')).toBeNull();
  });
});

describe('texto para la voz', () => {
  it('quita el punto de miles para que una voz de México no lea un decimal', () => {
    expect(speakable('El kilo va en 1.917 pesos y el de aguacate en 9.123 pesos.', 'es')).toBe('El kilo va en 1917 pesos y el de aguacate en 9123 pesos.');
    expect(speakable('Un total de 12.345.678 pesos.', 'es')).toBe('Un total de 12345678 pesos.');
  });

  it('dice "coma" y "punto" en los decimales y en la frecuencia', () => {
    expect(speakable('Llovieron 2,5 pulgadas.', 'es')).toBe('Llovieron 2 coma 5 pulgadas.');
    expect(speakable('Estás escuchando Radio Campo, 96.4 FM.', 'es')).toBe('Estás escuchando Radio Campo, 96 punto 4 FM.');
    expect(speakable('Van 1.250,5 kilos.', 'es')).toBe('Van 1250 coma 5 kilos.');
  });

  it('no toca años, comas entre palabras ni el inglés', () => {
    const t = 'Hoy, 15 de noviembre. Entre 2016 a 2018, la tierra sana pasó de 98 a 96 por ciento. Llama al 123.';
    expect(speakable(t, 'es')).toBe(t);
    expect(speakable('Plantain is at 1,917 pesos; 96.4 FM.', 'en')).toBe('Plantain is at 1,917 pesos; 96.4 FM.');
  });
});
