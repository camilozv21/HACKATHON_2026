import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import es from '../messages/es.json';

/** Lista de claves "a.b.c" de un árbol de mensajes. */
function keys(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** Variables ICU de un mensaje: {name} o {name, plural…} → name (sin contar el texto de las ramas). */
const vars = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]))].sort();

describe('traducciones', () => {
  const esKeys = keys(es);
  const enKeys = keys(en);

  it('español e inglés tienen exactamente las mismas claves', () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it('cada mensaje usa las mismas variables en los dos idiomas', () => {
    const get = (o: Record<string, unknown>, k: string) => k.split('.').reduce<unknown>((a, p) => (a as Record<string, unknown>)?.[p], o);
    const diff = esKeys.filter((k) => JSON.stringify(vars(String(get(es, k)))) !== JSON.stringify(vars(String(get(en, k)))));
    expect(diff).toEqual([]);
  });
});
