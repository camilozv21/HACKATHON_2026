'use client';

import clsx from 'clsx';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { RotationStrategy } from '@/lib/api/contract';
import { useUnits } from '@/lib/units';
import { useMonthNames } from './parts';

type Monthly = NonNullable<RotationStrategy['monthly']>;

/**
 * "Comparar 2": mes a mes, uso de agua (barras) y suelo cubierto (cuadros llenos) de dos estrategias.
 * A = verde lleno, B = celeste con puntos: se distinguen por patrón además del color.
 */
export function CompareTwo({
  strategies,
  ids,
  onChange,
  onClose,
}: {
  strategies: RotationStrategy[];
  ids: [string, string];
  onChange: (ids: [string, string]) => void;
  onClose: () => void;
}) {
  const t = useTranslations('rotations.compare');
  const months = useMonthNames();
  const u = useUnits();
  const uid = useId();
  const a = strategies.find((s) => s.id === ids[0]) ?? strategies[0]!;
  const b = strategies.find((s) => s.id === ids[1]) ?? strategies[1] ?? strategies[0]!;
  const ma = a.monthly;
  const mb = b.monthly;

  const total = (m?: Monthly) => (m ? m.reduce((x, r) => x + r.waterUseMm, 0) : 0);
  const coveredCount = (m?: Monthly) => (m ? m.filter((r) => r.soilCovered).length : 0);
  const max = Math.max(1, ...(ma ?? []).map((r) => r.waterUseMm), ...(mb ?? []).map((r) => r.waterUseMm));

  const picker = (which: 0 | 1) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className={clsx('size-3 rounded-sm', which === 0 ? 'bg-field-400' : 'pattern-dots bg-sky-glow/30 text-sky-glow')} />
        {which === 0 ? t('a') : t('b')}
      </span>
      <select
        value={ids[which]}
        onChange={(e) => onChange(which === 0 ? [e.target.value, ids[1]] : [ids[0], e.target.value])}
        className="min-h-11 w-full rounded-xl bg-white/5 px-2 text-sm font-normal ring-1 ring-line focus:ring-2 focus:ring-field-400 focus:outline-none"
      >
        {strategies.map((s) => (
          <option key={s.id} value={s.id} className="bg-space-2">
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-labelledby={`${uid}-t`} className="rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <h4 id={`${uid}-t`} className="font-bold">
          {t('title')}
        </h4>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="grid size-11 place-items-center rounded-full hover:bg-white/10"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="mt-1 flex gap-2">
        {picker(0)}
        {picker(1)}
      </div>

      {!ma || !mb ? (
        <p className="mt-3 text-sm text-ink-muted">{t('noMonthly')}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-black/20 p-2">
              <dt className="text-xs text-ink-muted">{t('waterYear')}</dt>
              <dd className="font-semibold tabular-nums">
                A {u.rain(total(ma))} · B {u.rain(total(mb))}
              </dd>
            </div>
            <div className="rounded-xl bg-black/20 p-2">
              <dt className="text-xs text-ink-muted">{t('coveredMonths')}</dt>
              <dd className="font-semibold tabular-nums">
                A {coveredCount(ma)} · B {coveredCount(mb)}
              </dd>
            </div>
          </dl>

          {/* Gráfica mes a mes (decorativa: los mismos datos van en la tabla para lectores de pantalla). */}
          <div aria-hidden className="mt-3">
            <p className="mb-1 text-xs text-ink-muted">{t('waterUse')}</p>
            <div className="grid h-24 grid-cols-12 items-end gap-1">
              {ma.map((r, i) => (
                <div key={i} className="flex h-full items-end justify-center gap-px">
                  <div className="w-1/2 rounded-t-sm bg-field-400" style={{ height: `${(r.waterUseMm / max) * 100}%` }} />
                  <div
                    className="pattern-dots w-1/2 rounded-t-sm bg-sky-glow/30 text-sky-glow"
                    style={{ height: `${(mb[i]!.waterUseMm / max) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 mb-1 text-xs text-ink-muted">{t('soilCovered')}</p>
            {[ma, mb].map((m, row) => (
              <div key={row} className="mb-1 grid grid-cols-12 gap-1">
                {m.map((r, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'h-4 rounded-sm',
                      r.soilCovered
                        ? row === 0
                          ? 'bg-field-400'
                          : 'pattern-dots bg-sky-glow/40 text-sky-glow'
                        : 'pattern-hatch text-white/20 ring-1 ring-line',
                    )}
                  />
                ))}
              </div>
            ))}
            <div className="grid grid-cols-12 gap-1 text-center text-[9px] text-ink-faint uppercase">
              {months.map((m, i) => (
                <span key={i}>{m.charAt(0)}</span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">{t('legend')}</p>
          </div>

          <table className="sr-only">
            <caption>{t('tableCaption', { a: a.name, b: b.name })}</caption>
            <thead>
              <tr>
                <th scope="col">{t('month')}</th>
                <th scope="col">{t('waterA')}</th>
                <th scope="col">{t('waterB')}</th>
                <th scope="col">{t('coverA')}</th>
                <th scope="col">{t('coverB')}</th>
              </tr>
            </thead>
            <tbody>
              {ma.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{months[i]}</th>
                  <td>{u.rain(r.waterUseMm)}</td>
                  <td>{u.rain(mb[i]!.waterUseMm)}</td>
                  <td>{r.soilCovered ? t('yes') : t('no')}</td>
                  <td>{mb[i]!.soilCovered ? t('yes') : t('no')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
