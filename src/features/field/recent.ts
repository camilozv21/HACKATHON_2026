import type { SelectedField } from './types';

const KEY = 'fieldshift:recent-fields:v1';
const MAX = 5;

/** Últimas 5 fincas en localStorage (siempre con try/catch: modo privado, cuota llena, etc.). */
export function readRecentFields(): SelectedField[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SelectedField[];
    return Array.isArray(list) ? list.filter((f) => f && typeof f.id === 'string' && f.geometry).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentField(field: SelectedField): SelectedField[] {
  const next = [field, ...readRecentFields().filter((f) => f.id !== field.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // sin almacenamiento disponible: no pasa nada, solo no recordamos
  }
  return next;
}

export function removeRecentField(id: string): SelectedField[] {
  const next = readRecentFields().filter((f) => f.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignorar
  }
  return next;
}
