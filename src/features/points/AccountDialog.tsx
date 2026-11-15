'use client';

import clsx from 'clsx';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Eye,
  EyeOff,
  Globe2,
  Layers,
  LogOut,
  MapPin,
  MessageCircle,
  Radio,
  Star,
  Store,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { toast } from '@/components/ui/toast';
import { levelOf, PASSWORD_MAX, PASSWORD_MIN, POINT_ACTIONS, POINT_RULES, pointsFor, QUEST_MAX_STARS, USERNAME_RE, type PointAction } from '@/lib/points';
import { authenticate, logout, refreshAccount, type AccountDetails } from './client';
import { LevelIcon } from './LevelIcon';
import { pendingTotal, usePointsStore } from './store';

const ACTION_ICONS: Record<PointAction, LucideIcon> = {
  signup: UserRound,
  quest: Star,
  visit: CalendarCheck,
  field: MapPin,
  analyze: BarChart3,
  region: Globe2,
  layer: Layers,
  radio: Radio,
  ask: MessageCircle,
  glossary: BookOpen,
  report: TriangleAlert,
  publish: Store,
};

/**
 * "Tu puntaje": puntos, nivel y avance; crear cuenta o entrar (solo usuario y contraseña); cómo ganar puntos.
 * Radix Dialog (tiene campos de texto): su trampa de foco pausa la del sheet de la finca si está abierto.
 */
export default function AccountDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('points');
  const account = usePointsStore((s) => s.account);
  const pending = usePointsStore((s) => s.pending);
  const [details, setDetails] = useState<AccountDetails | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const username = account?.username;

  useEffect(() => {
    if (!username) return;
    let alive = true;
    void refreshAccount().then((d) => alive && setDetails(d));
    return () => {
      alive = false;
    };
  }, [username]);

  const points = account ? account.points : pendingTotal(pending);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <div data-overlay-dialog className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <Dialog.Overlay className="absolute inset-0 bg-black/50" />
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              headingRef.current?.focus();
            }}
            className="panel relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl outline-none sm:m-4 sm:rounded-3xl"
          >
            <header className="flex items-start gap-2 px-5 pt-4 pb-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wider text-sun uppercase">{t('dialog.kicker')}</p>
                <Dialog.Title ref={headingRef} tabIndex={-1} className="truncate text-xl font-bold outline-none">
                  {account ? t('dialog.titleSignedIn', { username: account.username }) : t('dialog.titleGuest')}
                </Dialog.Title>
              </div>
              <button type="button" onClick={onClose} aria-label={t('dialog.close')} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10">
                <X aria-hidden className="size-5" />
              </button>
            </header>
            <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-[calc(var(--safe-bottom)+1.25rem)]">
              <ScoreSummary points={points} saved={account !== null} />
              {account ? (
                <>
                  <p className="text-sm">{t('dialog.farmNote')}</p>
                  <EarnList breakdown={details?.breakdown ?? null} />
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      toast(t('dialog.loggedOut'), 'info');
                    }}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/5 px-4 font-semibold ring-1 ring-line hover:bg-white/10"
                  >
                    <LogOut aria-hidden className="size-4" />
                    {t('dialog.logout')}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm">{t('dialog.guestNote')}</p>
                  <AuthForm />
                  <details className="group rounded-2xl bg-white/5 ring-1 ring-line">
                    <summary className="flex min-h-12 cursor-pointer items-center px-4 font-bold">{t('earn.title')}</summary>
                    <div className="px-3 pb-3">
                      <EarnList breakdown={null} bare />
                    </div>
                  </details>
                </>
              )}
              <p className="text-xs text-ink-muted">{t('farm.what')}</p>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Puntos, nivel y cuánto falta para el siguiente. */
function ScoreSummary({ points, saved }: { points: number; saved: boolean }) {
  const t = useTranslations('points');
  const locale = useLocale();
  const fmt = (n: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO').format(n);
  const lv = levelOf(points);
  const nextId = lv.next !== null ? levelOf(lv.next).id : null;
  return (
    <section aria-label={t('dialog.summary')} className="rounded-2xl bg-sun/10 p-4 ring-1 ring-sun/40">
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sun/20 text-sun">
          <LevelIcon level={lv.id} className="size-8" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-3xl leading-none font-bold tabular-nums">{t('dialog.points', { points: fmt(points) })}</p>
          <p className="mt-1 text-sm font-semibold text-sun">
            {t('dialog.level', { rank: lv.rank, level: t(`levels.${lv.id}`) })}
            {!saved && points > 0 && <span className="ml-1.5 rounded-full bg-white/10 px-2 py-0.5 text-xs text-ink">{t('dialog.unsaved')}</span>}
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={t('dialog.progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(lv.progress * 100)}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/30"
      >
        <div className="h-full rounded-full bg-sun" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        {lv.next !== null && nextId ? t('dialog.toNext', { points: fmt(lv.next - points), level: t(`levels.${nextId}`) }) : t('dialog.topLevel')}
      </p>
    </section>
  );
}

/** Crear cuenta o entrar: usuario y contraseña, nada más. */
function AuthForm() {
  const t = useTranslations('points');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const u = username.trim();
    if (!USERNAME_RE.test(u)) return setError(t('errors.username'));
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return setError(t('errors.password', { min: PASSWORD_MIN }));
    setBusy(true);
    setError(null);
    const res = await authenticate(mode, u, password);
    setBusy(false);
    if (!res.ok) return setError(t(`errors.${res.reason}`, { min: PASSWORD_MIN }));
    toast(mode === 'signup' ? t('dialog.welcome', { username: u }) : t('dialog.welcomeBack', { username: u }), 'success');
  };

  const tab = (m: 'signup' | 'login') => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={clsx('min-h-11 flex-1 rounded-full px-3 text-sm font-bold', mode === m ? 'bg-field-500 text-black' : 'text-ink-muted hover:bg-white/10')}
    >
      {t(`form.${m}Tab`)}
    </button>
  );

  const input =
    'mt-1 block min-h-12 w-full rounded-xl bg-black/30 px-3 text-base ring-1 ring-line outline-none focus-visible:ring-2 focus-visible:ring-field-300';

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-line">
      <div className="flex gap-1 rounded-full bg-black/30 p-1">
        {tab('signup')}
        {tab('login')}
      </div>
      <div className="text-sm font-semibold">
        <label htmlFor={`${uid}-user`}>{t('form.username')}</label>
        <input
          id={`${uid}-user`}
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          aria-describedby={`${uid}-u`}
          className={input}
        />
        <p id={`${uid}-u`} className="mt-1 text-xs font-normal text-ink-muted">
          {t('form.usernameHint')}
        </p>
      </div>
      <div className="text-sm font-semibold">
        <label htmlFor={`${uid}-pass`}>{t('form.password')}</label>
        <div className="relative mt-1">
          <input
            id={`${uid}-pass`}
            name="password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            maxLength={PASSWORD_MAX}
            aria-describedby={`${uid}-p`}
            className={clsx(input, 'mt-0 pr-12')}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? t('form.hidePassword') : t('form.showPassword')}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-ink-muted hover:text-ink"
          >
            {show ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        </div>
        <p id={`${uid}-p`} className="mt-1 text-xs font-normal text-ink-muted">
          {t('form.passwordHint', { min: PASSWORD_MIN })}
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-risk-high/15 p-2.5 text-sm font-semibold ring-1 ring-risk-high/40">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="flex min-h-12 items-center justify-center rounded-full bg-sun px-4 font-bold text-black disabled:opacity-60">
        {busy ? t('form.busy') : mode === 'signup' ? t('form.signupSubmit', { points: pointsFor('signup') }) : t('form.loginSubmit')}
      </button>
      <p className="text-xs text-ink-muted">{t('form.privacy')}</p>
    </form>
  );
}

/** Cómo se ganan puntos (y, con cuenta, cuántos lleva en cada cosa). */
function EarnList({ breakdown, bare = false }: { breakdown: Partial<Record<PointAction, number>> | null; bare?: boolean }) {
  const t = useTranslations('points');
  const locale = useLocale();
  const fmt = (n: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO').format(n);
  const list = (
    <ul className="flex flex-col gap-1.5">
      {POINT_ACTIONS.map((a) => {
        const Icon = ACTION_ICONS[a];
        const earned = breakdown?.[a] ?? 0;
        const value = a === 'quest' ? t('earn.questPoints', { base: POINT_RULES.quest.points, max: fmt(pointsFor('quest', QUEST_MAX_STARS)) }) : t('earn.plus', { points: POINT_RULES[a].points });
        return (
          <li key={a} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
            <Icon aria-hidden className="size-5 shrink-0 text-field-300" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t(`actions.${a}.label`)}</span>
              <span className="block text-xs text-ink-muted">
                {t(`actions.${a}.rule`)}
                {breakdown && earned > 0 && <> · {t('earn.earned', { points: fmt(earned) })}</>}
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold text-sun tabular-nums">{value}</span>
          </li>
        );
      })}
    </ul>
  );
  if (bare) return list;
  return (
    <section aria-labelledby="earn-title" className="flex flex-col gap-2">
      <h3 id="earn-title" className="font-bold">
        {t('earn.title')}
      </h3>
      {list}
    </section>
  );
}
