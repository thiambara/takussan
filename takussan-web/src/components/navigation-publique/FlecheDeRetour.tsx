'use client';

import { ArrowLeft } from 'lucide-react';
import type { MouseEvent } from 'react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { peutRevenirSurLeSite } from '@/components/shared/BoutonRetour';
import { cn } from '@/lib/utils';

/**
 * TCK-2617 — LA flèche de retour, pour tout le produit (site public et `/app`) : `ArrowLeft` de 20 px
 * dans une cible ronde de 44 px, à l'encre principale, au trait 2 PARTOUT (`stroke-2` : la portée de
 * `/app` ramène le défaut de lucide à 1,75, TCK-2685 ; la maquette `app-coque` a-2 garde 2 au retour,
 * comme le site public — une seule flèche, le même glyphe). Sa variante sur photo prend le fond de carte et
 * l'ombre de `BoutonSurPhoto`. La garde `fleche-de-retour-unique.tck-2617.test.ts` refuse toute autre
 * flèche de retour hors de ce fichier (liste fermée d'exceptions : période, pagination, carrousel…).
 *
 * Ce fichier ne lit AUCUN espace de traduction, et c'est voulu : la messagerie (atteignable depuis la
 * racine, par le widget de discussion) et la coque de `/app` l'importent, et un `useTranslations`
 * ici ferait transporter `navigationPublique` à toutes leurs pages (`check-i18n-namespaces`).
 * L'appelant nomme la flèche ; `BoutonRetourDePage` (`EnTeteDePage.tsx`) pose « Retour » par défaut.
 */
export function classesDeLaFleche(surPhoto = false, className?: string): string {
  return cn(
    'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-[background-color,scale] hover:bg-muted active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    surPhoto && 'bg-card shadow-bouton-photo hover:bg-card',
    className,
  );
}

export interface LienFlecheDeRetourProps {
  /** Où aller quand rien du site ne précède cette page dans l'onglet (lien partagé, moteur). */
  readonly repli: string;
  /** Le nom accessible. */
  readonly libelle: string;
  /** Rond, sur fond de carte : posé sur une photo (44 px aussi : la cible tactile ne rétrécit pas). */
  readonly surPhoto?: boolean;
  readonly className?: string;
  /**
   * TCK-2598 — quand revenir par l'historique plutôt que suivre le lien. Défaut : une page du site
   * précède (`peutRevenirSurLeSite`). La connexion la resserre au seul site PUBLIC
   * (`entreePrecedenteEstPublique`, TCK-568) : après une déconnexion, la page précédente est la console.
   */
  readonly peutRevenir?: () => boolean;
}

/**
 * Le retour d'un en-tête : un vrai `<a href={repli}>` — clic molette et « ouvrir dans un onglet »
 * marchent —, qui revient en arrière quand la page précédente de l'onglet est du site (filtres et
 * défilement retrouvés), comme `BoutonRetour`.
 */
export function LienFlecheDeRetour({ repli, libelle, surPhoto = false, className, peutRevenir = peutRevenirSurLeSite }: LienFlecheDeRetourProps) {
  function auClic(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey || evenement.button !== 0) return;
    if (!peutRevenir()) return;
    evenement.preventDefault();
    // `history.back()` et non `router.back()` : le routeur de Next écoute `popstate`, et un retour
    // sans routeur monté (rendu isolé d'une fiche, en test) ne lève pas.
    window.history.back();
  }

  return (
    <LienLocalise href={repli} onClick={auClic} aria-label={libelle} className={classesDeLaFleche(surPhoto, className)}>
      <ArrowLeft className="size-5 stroke-2" aria-hidden="true" />
    </LienLocalise>
  );
}

/**
 * La même flèche quand le retour est un ÉTAT de la page et non une adresse (la liste des
 * conversations qui revient, au téléphone) : un `<button>`, nommé par l'appelant.
 */
export function BoutonFlecheDeRetour({
  libelle,
  onClick,
  className,
  ...reste
}: {
  readonly libelle: string;
  readonly onClick: () => void;
  readonly className?: string;
  readonly 'data-testid'?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={libelle} className={classesDeLaFleche(false, className)} {...reste}>
      <ArrowLeft className="size-5 stroke-2" aria-hidden="true" />
    </button>
  );
}
