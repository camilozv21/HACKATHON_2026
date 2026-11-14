/**
 * Convierte un sistema de la biblioteca en temporadas concretas para esta finca: elige el cultivo de cada ranura
 * (el que mejor se da con el clima), calcula meses de siembra y cosecha, y extiende las coberturas hasta la
 * siguiente siembra. Si dos cultivos principales se pisan, el sistema no cabe en la temporada de la finca.
 */
import type { CropId, CropSeason } from '@/lib/api/contract';
import type { MonthlyClimate } from '@/features/rotations/mixed/climate';
import { crop, monthFit } from './agronomy';
import { absOf, coolStart, cycleFor, seasonAbs, seasonLength, shift, toSeason, type Windows } from './schedule';
import type { Irrigation } from './score';
import type { Site } from './site';
import type { Slot, SystemTpl } from './systems';

export type Placed = { seasons: CropSeason[]; picks: CropId[]; fits: boolean };

type Pos = { abs: number; len: number };

/** Ajuste rápido de un cultivo en unos meses (temperatura × lluvia frente a lo que pide), para elegir opciones. */
export function quickFit(site: Site, clim: MonthlyClimate, irrigation: Irrigation, id: CropId, startMonth: number, len: number): number {
  const c = crop(id);
  const months = Array.from({ length: len }, (_, k) => shift(startMonth, k));
  const thermal = months.reduce((a, m) => a + monthFit(id, m, clim, irrigation), 0) / len;
  if (irrigation === 'full') return thermal;
  const need = months.reduce((a, m) => a + site.months[m - 1]!.et0 * c.a.kc, 0);
  const rain = months.reduce((a, m) => a + site.months[m - 1]!.peff, 0) + 40;
  const water = Math.min(1, rain / Math.max(1, need));
  const eff = irrigation === 'limited' ? 1 - (1 - water) * 0.5 : water;
  return thermal * Math.max(0, 1 - c.a.ky * (1 - eff));
}

const isMain = (role: CropSeason['role']) => role === 'cash' || role === 'forage' || role === 'perennial';

export function placeSystem(sys: SystemTpl, site: Site, w: Windows, clim: MonthlyClimate, irrigation: Irrigation): Placed {
  const years = sys.years;
  const total = years * 12;
  const placed: (Pos & { crop: CropId; slot: Slot })[] = [];

  const lastMainEnd = (): number | null => {
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i]!;
      if (isMain(p.slot.role) && p.slot.at !== 'all') return p.abs + p.len - 1;
    }
    return null;
  };

  const position = (slot: Slot, id: CropId): Pos => {
    const year = slot.year ?? 1;
    const at = slot.at;
    if (at === 'all') return { abs: absOf(year, 1), len: 12 };
    if (at === 'main') {
      const abs = absOf(year, w.main.start);
      return { abs, len: cycleFor(site, id, w.main.start) };
    }
    if (at === 'second' && w.second) {
      const abs = absOf(year, w.second.start);
      return { abs, len: cycleFor(site, id, w.second.start) };
    }
    if (at === 'second' || at === 'after') {
      const prev = lastMainEnd();
      const abs = prev == null ? absOf(year, w.main.start) : prev + 1;
      return { abs, len: cycleFor(site, id, (abs % 12) + 1) };
    }
    if (at === 'cool') {
      const prev = lastMainEnd();
      const from = prev == null ? absOf(year, shift(w.main.start, Math.min(11, w.main.len))) : prev + 1;
      const m = coolStart(site, (from % 12) + 1);
      const abs = from + ((m - ((from % 12) + 1) + 12) % 12);
      return { abs, len: cycleFor(site, id, m) };
    }
    if ('with' in at) {
      const ref = placed[at.with]!;
      const abs = ref.abs + (at.offset ?? 0);
      return { abs, len: cycleFor(site, id, (((abs % 12) + 12) % 12) + 1) };
    }
    const ref = placed[at.relay]!;
    const abs = ref.abs + ref.len - 1 + (at.offset ?? 0);
    return { abs, len: cycleFor(site, id, (abs % 12) + 1) };
  };

  /** Una ranura del año 2 o 3 no puede caer meses antes de ese año (pasa en climas frescos todo el año). */
  const inYear = (slot: Slot, pos: Pos): Pos => {
    if (!slot.year || slot.year === 1 || slot.at === 'all') return pos;
    let abs = pos.abs;
    while (abs < absOf(slot.year, 1) - 2) abs += 12;
    return { ...pos, abs };
  };

  for (const slot of sys.slots) {
    const options = (Array.isArray(slot.crop) ? slot.crop : [slot.crop]) as CropId[];
    let best: (Pos & { crop: CropId; fit: number }) | null = null;
    for (const id of options) {
      const pos = inYear(slot, position(slot, id));
      const climate = quickFit(site, clim, irrigation, id, (pos.abs % 12) + 1, Math.min(12, pos.len));
      // En una ranura de venta también cuenta lo que se puede vender (una vicia no es un cultivo de venta).
      const fit = slot.role === 'cash' ? climate * (0.6 + 0.4 * Math.min(1, crop(id).a.value / 60)) : climate;
      if (!best || fit > best.fit + 0.02) best = { ...pos, crop: id, fit };
    }
    placed.push({ abs: best!.abs, len: best!.len, crop: best!.crop, slot });
  }

  // Las coberturas se quedan hasta la siguiente siembra principal (se terminan antes de sembrar).
  for (const p of placed) {
    if (p.slot.role !== 'cover' || p.slot.at === 'all') continue;
    const nexts = placed
      .filter((q) => q !== p && isMain(q.slot.role) && q.slot.at !== 'all')
      .map((q) => (((q.abs - p.abs) % total) + total) % total)
      .filter((d) => d > 0);
    const until = nexts.length ? Math.min(...nexts) : 12;
    p.len = Math.max(p.len, Math.min(11, until));
    if (until < 2) p.len = 0;
  }

  const kept = placed.filter((p) => p.len >= 1);
  const seasons = kept.map((p) => toSeason(p.crop, p.slot.role, p.abs, p.len, years));

  // ¿Se pisan dos cultivos principales anuales?
  let fits = true;
  const occ = new Array<number>(total).fill(0);
  for (const s of seasons) {
    if (!(s.role === 'cash' || s.role === 'forage') || seasonLength(s) >= 12) continue;
    const a = seasonAbs(s);
    for (let k = 0; k < seasonLength(s); k++) {
      const q = (a + k) % total;
      occ[q]!++;
      if (occ[q]! > 1) fits = false;
    }
  }
  return { seasons, picks: placed.map((p) => p.crop), fits };
}
