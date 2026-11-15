'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { starsFor, type GameId } from '@/features/onboarding/games/catalog';
import { Learned, useLearnedSpoken } from '@/features/onboarding/games/Learned';
import { GAME_COMPONENTS } from '@/features/onboarding/games/registry';
import { GameStyles } from '@/features/onboarding/games/ui';
import { useAcademyStore } from './progress';

/**
 * Práctica: un reto del glosario del inicio, solo, para jugarlo otra vez (Radix Dialog). Al terminar muestra la
 * misma tarjeta "¡Lo aprendiste!" y guarda la mejor marca. Con `detail`, también "La ciencia".
 */
export function PracticeDialog({
  id,
  detail,
  reduced,
  say,
  onClose,
}: {
  id: GameId;
  detail: boolean;
  reduced: boolean;
  say: (text: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('academy');
  const tg = useTranslations('onboarding.games');
  const learnedSpoken = useLearnedSpoken();
  const [stars, setStars] = useState<1 | 2 | 3 | null>(null);
  const Game = GAME_COMPONENTS[id];

  const finish = (mistakes: number) => {
    const s = starsFor(mistakes);
    setStars(s);
    useAcademyStore.getState().recordGame(id, s);
    say(learnedSpoken(id, s));
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <Dialog.Overlay className="absolute inset-0 bg-black/60" />
          <Dialog.Content
            aria-describedby={undefined}
            // El reto pone el foco en su propio título al aparecer.
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="panel relative flex max-h-[96dvh] w-full max-w-md flex-col rounded-t-3xl shadow-2xl outline-none sm:m-4 sm:rounded-3xl"
          >
            <GameStyles />
            <header className="flex items-center gap-2 px-4 pt-3">
              <p className="flex-1 text-xs font-semibold tracking-wider text-field-300 uppercase">{t('practice.kicker')}</p>
              <Dialog.Title className="sr-only">{tg(`${id}.name`)}</Dialog.Title>
              <Dialog.Close
                aria-label={t('lesson.close')}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white/5 ring-1 ring-line hover:bg-white/10"
              >
                <X aria-hidden className="size-5" />
              </Dialog.Close>
            </header>
            <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+1rem)]">
              {stars === null ? (
                <Game detail={detail} reduced={reduced} say={say} onFinish={finish} />
              ) : (
                <Learned id={id} stars={stars} detail={detail} reduced={reduced} nextLabel={t('practice.back')} onNext={onClose} />
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
