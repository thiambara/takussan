'use client';

import { useRef, type PointerEvent } from 'react';
import { Handshake } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';

/** La durée d'un appui long, au téléphone. */
export const DUREE_DE_L_APPUI_LONG = 500;

/**
 * TCK-2972 — l'appui long d'un doigt sur une bulle ouvre ses gestes (au téléphone). Un geste de souris
 * n'y passe pas : au bureau, le geste est dans la barre du survol ({@link BoutonNoter}).
 */
export function useAppuiLong(surAppuiLong: (() => void) | undefined) {
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const depart = useRef<{ x: number; y: number } | null>(null);
  const arreter = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  };
  if (!surAppuiLong) return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      arreter();
      depart.current = { x: e.clientX, y: e.clientY };
      minuteur.current = setTimeout(() => {
        minuteur.current = null;
        surAppuiLong();
      }, DUREE_DE_L_APPUI_LONG);
    },
    onPointerUp: arreter,
    onPointerLeave: arreter,
    onPointerCancel: arreter,
    // Le tremblement du doigt ne l'annule pas : seul un glissement de plus de 10 px (un défilement).
    onPointerMove: (e: PointerEvent) => {
      const d = depart.current;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) arreter();
    },
  };
}

/**
 * TCK-2972 — « Noter un engagement » dans la barre du survol d'un message, au bureau (dès `md`). Visible au
 * survol de la bulle (`group/bulle`) et au clavier ; absent au téléphone, où l'appui long le remplace.
 */
export function BoutonNoter({ onNoter }: { readonly onNoter: () => void }) {
  const t = useTranslations('messaging.engagements.noter');
  return (
    <button
      type="button"
      onClick={onNoter}
      data-testid="noter-un-engagement-depuis-le-message"
      className="inline-flex h-8 flex-none items-center gap-1 self-center rounded-md bg-secondary px-2 text-xs font-semibold text-primary-deep opacity-0 outline-none group-hover/bulle:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring max-md:hidden"
    >
      <Handshake className="size-4" strokeWidth={1.75} aria-hidden="true" />
      {t('geste')}
    </button>
  );
}

/** TCK-2972 — les gestes d'un message, à l'appui long (téléphone) : « Noter un engagement ». */
export function GestesDuMessage({
  open,
  onOpenChange,
  onNoter,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onNoter: () => void;
}) {
  const t = useTranslations('messaging.engagements.noter');
  return (
    <FeuilleDuBas open={open} onOpenChange={onOpenChange} titre={t('gestesDuMessage')}>
      <button
        type="button"
        onClick={onNoter}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-corps font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Handshake className="size-5 text-primary-deep" strokeWidth={1.75} aria-hidden="true" />
        {t('geste')}
      </button>
    </FeuilleDuBas>
  );
}
