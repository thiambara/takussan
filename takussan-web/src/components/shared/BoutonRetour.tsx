'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { cn } from '@/lib/utils';

export interface BoutonRetourProps {
  /** Où aller quand il n'y a rien sur le site à quoi revenir — la liste, typiquement. */
  readonly repli: string;
  /** Libellé traduit par l'appelant : la page serveur tient déjà ses traductions. */
  readonly libelle: string;
  readonly className?: string;
}

/**
 * Y a-t-il, dans l'historique de cet onglet, une page DU SITE juste avant celle-ci ?
 *
 * ⚠ `history.length > 1` ne le dit pas : arriver depuis un moteur de recherche donne 2, et
 * `router.back()` ferait quitter le site. La Navigation API répond exactement (elle ne liste que
 * les entrées de la même origine) ; à défaut, le référent de la première page chargée.
 */
function peutRevenirSurLeSite(): boolean {
  const navigation = (window as Window & { navigation?: { canGoBack?: unknown } }).navigation;
  if (typeof navigation?.canGoBack === 'boolean') return navigation.canGoBack;
  try {
    return document.referrer !== '' && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Le retour des fiches publiques d'agent et d'agence — retour d'administration du 2026-09-16.
 *
 * On y arrive depuis une fiche de bien, une liste, une équipe d'agence : revenir en arrière rend
 * la page quittée, filtres et défilement compris. Un visiteur arrivé directement (lien partagé)
 * n'a rien à retrouver — le lien le mène alors à la liste, ce qui en fait un vrai `<a>` : clic
 * molette et « ouvrir dans un onglet » fonctionnent.
 */
export function BoutonRetour({ repli, libelle, className }: BoutonRetourProps) {
  const router = useRouter();

  function auClic(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey || evenement.button !== 0) return;
    if (!peutRevenirSurLeSite()) return;
    evenement.preventDefault();
    router.back();
  }

  // `min-h-11` (TCK-560) : 32 px de haut mesurés au navigateur, à 390 comme à 1366 — sous les
  // 44 px d'une cible tactile. Le retour est le geste qu'on cherche au pouce sur une fiche.
  // Posé APRÈS `className` : `cn` (tailwind-merge) garde la dernière classe d'un même groupe, et un
  // `min-h-8` d'appelant aurait sinon rabaissé la cible sans qu'aucun test ne le voie (vérification
  // de TCK-560, W3). Un plancher qu'un appelant peut raboter n'est pas un plancher.
  return (
    <LienLocalise
      href={repli}
      onClick={auClic}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 -ml-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
        'min-h-11',
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {libelle}
    </LienLocalise>
  );
}
