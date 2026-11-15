'use client';

import clsx from 'clsx';
import { BookOpen, Check, Download, GraduationCap, Languages, LayoutGrid, MapPin, PlayCircle, Ruler, Satellite, Sun, UserRound, Volume2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isSpeechSupported, speak, stop, type NarratorLang } from '@/features/narrator/narrator';
import { useProfileStore } from '@/features/onboarding/profile';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { usePrefsStore, type Contrast, type Mode, type Units } from '@/lib/prefs';
import { canInstall, promptInstall, subscribeInstall } from '@/lib/pwa';

function Choice<T extends string>({
  name,
  value,
  current,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
  label: string;
  hint?: string;
}) {
  const checked = value === current;
  return (
    <label
      className={clsx(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ring-1',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-field-300',
        checked ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={() => onChange(value)} className="sr-only" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={clsx('grid size-6 shrink-0 place-items-center rounded-full ring-2', checked ? 'bg-field-400 ring-field-400' : 'ring-line-strong')}
      >
        {checked && <Check className="size-4 text-space" />}
      </span>
    </label>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-1.5">
      <p id={id} className="flex items-center gap-2 font-bold">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * Ajustes: modo sol (alto contraste), modo sencillo o completo, locutor (voz que lee en voz alta), unidades, puntos
 * del globo (fincas de ejemplo y emisoras), idioma, perfil y preguntas de inicio, glosario e instalar la app.
 */
export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const contrast = usePrefsStore((s) => s.contrast);
  const units = usePrefsStore((s) => s.units);
  const mapMarkers = usePrefsStore((s) => s.mapMarkers);
  const mode = usePrefsStore((s) => s.mode);
  const narrator = usePrefsStore((s) => s.narrator);
  const role = useProfileStore((s) => s.profile?.role ?? null);
  const [canSpeak] = useState(isSpeechSupported);
  const { setContrast, setUnits, setOnboarded, setMapMarkers, setMode, setNarrator } = usePrefsStore.getState();
  const installable = useSyncExternalStore(subscribeInstall, canInstall, () => false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  const switchLocale = (l: string) => {
    if (l === locale) return;
    // Mantiene la finca, la cámara y las prioridades (están en la URL).
    router.replace(`${pathname}${window.location.search}`, { locale: l as (typeof routing.locales)[number] });
    onClose();
  };

  return createPortal(
    <div data-overlay-dialog className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" tabIndex={-1} aria-label={t('close')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="panel relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl sm:m-4 sm:rounded-3xl"
      >
        <header className="flex items-center gap-2 px-5 pt-4 pb-2">
          <h2 id="settings-title" className="flex-1 text-xl font-bold">
            {t('title')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="grid size-11 place-items-center rounded-full hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-[calc(var(--safe-bottom)+1.25rem)]">
          <Group icon={<Sun aria-hidden className="size-5 text-sun" />} title={t('contrast.title')}>
            {(['auto', 'high', 'normal'] as Contrast[]).map((c) => (
              <Choice key={c} name="contrast" value={c} current={contrast} onChange={setContrast} label={t(`contrast.${c}`)} hint={t(`contrast.${c}Hint`)} />
            ))}
          </Group>

          <Group icon={<LayoutGrid aria-hidden className="size-5 text-field-300" />} title={t('mode.title')}>
            {(['lite', 'full'] as Mode[]).map((m) => (
              <Choice key={m} name="mode" value={m} current={mode} onChange={setMode} label={t(`mode.${m}`)} hint={t(`mode.${m}Hint`)} />
            ))}
          </Group>

          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 font-bold">
              <Volume2 aria-hidden className="size-5 text-field-300" />
              {t('narrator.title')}
            </p>
            {canSpeak ? (
              <button
                type="button"
                role="switch"
                aria-checked={narrator}
                aria-describedby="settings-narrator-hint"
                onClick={() => {
                  const on = !narrator;
                  setNarrator(on);
                  // Confirmación hablada: quien no lee sabe que la voz quedó encendida.
                  if (on) speak(`${t('narrator.label')}. ${t('narrator.hint')}`, { lang: locale as NarratorLang, id: 'settings' });
                  else stop();
                }}
                className={clsx(
                  'flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1',
                  narrator ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t('narrator.label')}</span>
                  <span id="settings-narrator-hint" className="block text-xs text-ink-muted">
                    {t('narrator.hint')}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={clsx(
                    'grid size-6 shrink-0 place-items-center rounded-full ring-2',
                    narrator ? 'bg-field-400 ring-field-400' : 'ring-line-strong',
                  )}
                >
                  {narrator && <Check className="size-4 text-space" />}
                </span>
              </button>
            ) : (
              <p className="text-sm text-ink-muted">{t('narrator.unsupported')}</p>
            )}
          </div>

          <Group icon={<Ruler aria-hidden className="size-5 text-field-300" />} title={t('units.title')}>
            {(['metric', 'imperial'] as Units[]).map((u) => (
              <Choice key={u} name="units" value={u} current={units} onChange={setUnits} label={t(`units.${u}`)} hint={t(`units.${u}Hint`)} />
            ))}
          </Group>

          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 font-bold">
              <MapPin aria-hidden className="size-5 text-field-300" />
              {t('markers.title')}
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={mapMarkers}
              aria-describedby="settings-markers-hint"
              onClick={() => setMapMarkers(!mapMarkers)}
              className={clsx(
                'flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1',
                mapMarkers ? 'bg-field-500/15 ring-2 ring-field-400' : 'bg-white/5 ring-line',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t('markers.label')}</span>
                <span id="settings-markers-hint" className="block text-xs text-ink-muted">
                  {t('markers.hint')}
                </span>
              </span>
              <span
                aria-hidden
                className={clsx(
                  'grid size-6 shrink-0 place-items-center rounded-full ring-2',
                  mapMarkers ? 'bg-field-400 ring-field-400' : 'ring-line-strong',
                )}
              >
                {mapMarkers && <Check className="size-4 text-space" />}
              </span>
            </button>
          </div>

          <Group icon={<Languages aria-hidden className="size-5 text-sky-glow" />} title={t('language')}>
            {routing.locales.map((l) => (
              <Choice key={l} name="locale" value={l} current={locale as typeof l} onChange={switchLocale} label={t(`languages.${l}`)} />
            ))}
          </Group>

          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm">
              <UserRound aria-hidden className="size-5 text-field-300" />
              <span className="font-bold">{t('profile.title')}:</span>
              <span className="text-ink-muted">{role ? t(`profile.${role}`) : t('profile.none')}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setOnboarded(false);
                onClose();
                window.dispatchEvent(new Event('fieldshift:replay-onboarding'));
              }}
              className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/5 px-3 font-semibold ring-1 ring-line hover:bg-white/10"
            >
              <PlayCircle aria-hidden className="size-5 text-field-300" />
              {t('replayIntro')}
            </button>
            <a
              href={`/${locale}/academy`}
              className="flex min-h-12 items-center gap-2 rounded-2xl bg-field-500/15 px-3 font-semibold ring-1 ring-field-500/50 hover:bg-field-500/25"
            >
              <GraduationCap aria-hidden className="size-5 text-field-300" />
              {t('academy')}
            </a>
            <a
              href={`/${locale}/glossary`}
              className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/5 px-3 font-semibold ring-1 ring-line hover:bg-white/10"
            >
              <BookOpen aria-hidden className="size-5 text-field-300" />
              {t('glossary')}
            </a>
            <a
              href={`/${locale}/about`}
              className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/5 px-3 font-semibold ring-1 ring-line hover:bg-white/10"
            >
              <Satellite aria-hidden className="size-5 text-field-300" />
              {t('about')}
            </a>
            {installable && (
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="flex min-h-12 items-center gap-2 rounded-2xl bg-field-500 px-3 font-semibold text-black hover:bg-field-400"
              >
                <Download aria-hidden className="size-5" />
                {t('install')}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
