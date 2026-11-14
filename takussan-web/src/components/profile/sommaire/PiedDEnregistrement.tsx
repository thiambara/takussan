'use client';

import { useEffect, useRef } from 'react';
import type * as React from 'react';
import { useTranslations } from 'next-intl';

import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { REQUETE_DE_LA_BARRE } from '@/components/layout/plein-ecran';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';

interface PiedDEnregistrementProps {
  /** Le nombre de réglages modifiés et pas encore enregistrés : 0, la ligne se tait. */
  readonly modifications: number;
  /**
   * LE bouton « Enregistrer » de la section — `type="submit"` ET `form="<id du formulaire>"` : au
   * téléphone, il est rendu dans la barre d'action de la coque, hors du `<form>` dans le DOM.
   */
  readonly bouton: React.ReactNode;
  /** Les retours de l'enregistrement (enregistré, échec), à côté du bouton. */
  readonly children?: React.ReactNode;
  readonly className?: string;
}

/**
 * TCK-2635 — LE pied d'une section du profil (maquette `app-profil`) : un seul « Enregistrer » par
 * section, actif seulement s'il y a une modification (c'est à l'appelant de le dire).
 *
 * - Au bureau (`PIED_ENREGISTRER`) : sous la section, après un filet — le bouton, puis
 *   « 1 modification non enregistrée ».
 * - Au téléphone, TANT QU'IL Y A des modifications non enregistrées (`EcranApp sansOnglets
 *   bas={ENREGISTRER}`) : le bouton en pleine largeur dans la barre d'action de la coque, qui prend
 *   la place de la barre d'onglets ; le compte et les retours restent sous le formulaire.
 * - Au téléphone, sans modification : la navigation reste — la barre d'onglets est là, et le pied
 *   est celui du bureau, sous la section (arbitrage du 2026-11-12 : la barre d'onglets ne s'efface
 *   que devant un enregistrement à faire).
 *
 * Un seul des deux est rendu : deux « Enregistrer » dans le DOM se liraient deux fois. Au rendu
 * serveur, le pied sous la section (la page s'ouvre sans modification).
 *
 * Clavier : quand l'enregistrement aboutit, le bouton de la barre disparaît avec elle. Si le focus y
 * était (il tombe alors sur `<body>`), il est rendu au pied, qui porte le retour « Enregistré ».
 */
export function PiedDEnregistrement({ modifications, bouton, children, className }: PiedDEnregistrementProps) {
  const t = useTranslations('profile.sommaire');
  const telephone = useMatchesMedia(REQUETE_DE_LA_BARRE);
  const enBarre = telephone && modifications > 0;
  const pied = useRef<HTMLDivElement>(null);
  const etaitEnBarre = useRef(false);
  useEffect(() => {
    const quitteLaBarre = etaitEnBarre.current && !enBarre;
    etaitEnBarre.current = enBarre;
    if (!quitteLaBarre) return;
    const actif = document.activeElement;
    if (!actif || actif === document.body) pied.current?.focus();
  }, [enBarre]);
  const compte =
    modifications > 0 ? (
      <span className="text-ui text-muted-foreground" aria-live="polite">
        {t('nonEnregistrees', { n: modifications })}
      </span>
    ) : null;

  if (enBarre) {
    return (
      <>
        <DeclarerEnTete formulaire />
        {compte || children ? (
          <div data-slot="pied-d-enregistrement" className={cn('mt-4 flex flex-wrap items-center gap-3', className)}>
            {compte}
            {children}
          </div>
        ) : null}
        <BarreDAction>{bouton}</BarreDAction>
      </>
    );
  }

  return (
    <div
      ref={pied}
      tabIndex={-1}
      data-slot="pied-d-enregistrement"
      className={cn('mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4 outline-none', className)}
    >
      {bouton}
      {compte}
      {children}
    </div>
  );
}
