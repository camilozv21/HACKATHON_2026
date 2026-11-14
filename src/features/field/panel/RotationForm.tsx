'use client';

import clsx from 'clsx';
import { Bean, Cherry, Circle, Citrus, Coffee, Flower2, Leaf, Plus, Search, Sprout, Trash2, Trees, Wheat, Carrot, Check, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { CROP_IDS, type CropId, type CropSeason } from '@/lib/api/contract';
import { CROPS, type CropIcon as CropIconName } from '../crops';

const ICONS: Record<CropIconName, LucideIcon> = { Wheat, Bean, Coffee, Sprout, Leaf, Trees, Carrot, Flower2, Cherry, Citrus, Circle };

export function CropIcon({ crop, className }: { crop: CropId; className?: string }) {
  const Icon = ICONS[CROPS[crop].icon];
  return <Icon aria-hidden className={className} style={{ color: CROPS[crop].color }} />;
}

function CropPicker({ value, onPick, onClose }: { value: CropId; onPick: (c: CropId) => void; onClose: () => void }) {
  const t = useTranslations('panel');
  const tc = useTranslations('crops');
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = CROP_IDS.filter((c) => !q || norm(tc(c)).includes(norm(q)));
  return (
    <div className="mt-2 rounded-2xl bg-space-2/80 p-2 ring-1 ring-line">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-white/5 px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-field-400">
        <Search aria-hidden className="size-4 text-ink-muted" />
        <span className="sr-only">{t('rotation.searchCrop')}</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder={t('rotation.searchCrop')}
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </label>
      <ul className="mt-2 grid max-h-60 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
        {list.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => onPick(c)}
              aria-pressed={c === value}
              className={clsx(
                'flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl p-1.5 text-center text-xs ring-1',
                c === value ? 'bg-field-500/20 ring-field-400' : 'ring-line hover:bg-white/5',
              )}
            >
              <CropIcon crop={c} className="size-6" />
              <span className="leading-tight">{tc(c)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Tu rotación actual": cultivos por temporada con íconos grandes y buscador, meses aproximados de siembra
 * y cosecha. Al guardar, el análisis se recalcula con esta rotación.
 */
export function RotationForm({
  initial,
  usingDefault,
  onSave,
}: {
  initial: CropSeason[];
  usingDefault: boolean;
  onSave: (r: CropSeason[]) => void;
}) {
  const t = useTranslations('panel');
  const tc = useTranslations('crops');
  const format = useFormatter();
  const id = useId();
  const [rows, setRows] = useState<CropSeason[]>(() => initial.filter((s) => (s.year ?? 1) === 1 && s.role !== 'fallow'));
  const [picking, setPicking] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const months = Array.from({ length: 12 }, (_, i) => format.dateTime(new Date(Date.UTC(2025, i, 15)), { month: 'long' }));

  const update = (i: number, patch: Partial<CropSeason>) => {
    setSaved(false);
    setRows((r) => r.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };

  return (
    <div>
      {usingDefault && <p className="mb-2 rounded-xl bg-sun/10 p-2.5 text-sm ring-1 ring-sun/30">{t('rotation.defaultNote')}</p>}
      <ol className="flex flex-col gap-2">
        {rows.map((s, i) => (
          <li key={i} className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPicking(picking === i ? null : i)}
                aria-expanded={picking === i}
                className="flex min-h-12 flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-white/5"
              >
                <CropIcon crop={s.crop} className="size-8" />
                <span>
                  <span className="block font-semibold">{tc(s.crop)}</span>
                  <span className="block text-xs text-ink-muted">{t('rotation.change')}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaved(false);
                  setRows((r) => r.filter((_, j) => j !== i));
                }}
                aria-label={t('rotation.remove', { crop: tc(s.crop) })}
                className="grid size-11 place-items-center rounded-full text-ink-muted hover:bg-white/10"
              >
                <Trash2 aria-hidden className="size-5" />
              </button>
            </div>
            {picking === i && (
              <CropPicker
                value={s.crop}
                onClose={() => setPicking(null)}
                onPick={(c) => {
                  update(i, { crop: c, role: CROPS[c].family === 'cover' ? 'cover' : CROPS[c].family === 'perennial' ? 'perennial' : 'cash' });
                  setPicking(null);
                }}
              />
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-muted" htmlFor={`${id}-s${i}`}>
                {t('rotation.sow')}
                <select
                  id={`${id}-s${i}`}
                  value={s.startMonth}
                  onChange={(e) => update(i, { startMonth: Number(e.target.value) })}
                  className="mt-1 block h-11 w-full rounded-xl bg-white/5 px-2 text-base text-ink capitalize ring-1 ring-line"
                >
                  {months.map((m, k) => (
                    <option key={m} value={k + 1} className="bg-space-2">
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-muted" htmlFor={`${id}-e${i}`}>
                {t('rotation.harvest')}
                <select
                  id={`${id}-e${i}`}
                  value={s.endMonth}
                  onChange={(e) => update(i, { endMonth: Number(e.target.value) })}
                  className="mt-1 block h-11 w-full rounded-xl bg-white/5 px-2 text-base text-ink capitalize ring-1 ring-line"
                >
                  {months.map((m, k) => (
                    <option key={m} value={k + 1} className="bg-space-2">
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setRows((r) => [...r, { crop: 'maize', startMonth: 4, endMonth: 8, year: 1, role: 'cash' }]);
            setPicking(rows.length);
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-4 text-sm font-semibold ring-1 ring-line hover:bg-white/10"
        >
          <Plus aria-hidden className="size-4" />
          {t('rotation.add')}
        </button>
        <button
          type="button"
          disabled={!rows.length}
          onClick={() => {
            onSave(rows);
            setSaved(true);
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-field-500 px-4 text-sm font-bold text-black disabled:opacity-40"
        >
          {saved ? <Check aria-hidden className="size-4" /> : null}
          {saved ? t('rotation.saved') : t('rotation.save')}
        </button>
      </div>
    </div>
  );
}
