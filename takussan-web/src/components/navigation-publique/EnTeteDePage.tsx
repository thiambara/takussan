'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { LienFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { cn } from '@/lib/utils';

/**
 * TCK-2568 (amendement d'ADR-0091 du 2026-11-09) — l'en-tête d'une page publique au TÉLÉPHONE, là où
 * la maquette n'a pas la barre du site (`enTeteAuTelephone(chemin) === 'en-tete-de-page'`).
 *
 * Deux formes, celles des maquettes :
 * - `barre` (défaut) — une rangée collante de 56 px : retour, titre, action (comparateur, fiche
 *   d'agent, tunnel) ;
 * - `sur-photo` — des boutons ronds posés sur la photo qui ouvre la page (fiche d'un bien, d'une
 *   agence) ; à partir de `md`, où la photo n'ouvre plus la page, la rangée `barre` reprend.
 *
 * Il n'existe que sous `lg` par défaut : le bureau garde la barre du site (ADR-0091 § 5).
 */
export interface EnTeteDePageProps {
  /** Le titre. Sans titre, la rangée ne porte que le retour et l'action. */
  readonly titre?: ReactNode;
  /**
   * `true` (défaut) : le titre est LE `<h1>` de la page — elle n'en porte pas d'autre.
   * `false` : la page a déjà son `<h1>` plus bas ; le titre n'est qu'un rappel (`<p>`).
   */
  readonly titreDeLaPage?: boolean;
  /**
   * Le retour : à la page d'où l'on vient (même site), sinon à `repli`. `null` : pas de retour
   * (une page d'onglet, que la barre d'onglets ouvre).
   */
  readonly retour?: { readonly repli: string; readonly libelle?: string } | null;
  /** Une action à droite (Partager, Effacer…) : ses cibles font 44 px au moins. */
  readonly action?: ReactNode;
  readonly variante?: 'barre' | 'sur-photo';
  /** `true` : l'en-tête reste en bureau (rare : la barre du site y est déjà). */
  readonly aussiEnBureau?: boolean;
  readonly className?: string;
}

export interface BoutonRetourDePageProps {
  /** Où aller quand rien du site ne précède cette page dans l'onglet (lien partagé, moteur). */
  readonly repli: string;
  /** Le nom accessible ; « Retour » par défaut. */
  readonly libelle?: string;
  /** Rond, sur fond de carte : posé sur une photo (44 px aussi : la cible tactile ne rétrécit pas). */
  readonly surPhoto?: boolean;
  readonly className?: string;
}

/**
 * Le retour d'un en-tête de page : LA flèche (`FlecheDeRetour.tsx`, TCK-2617), nommée « Retour » par
 * défaut. Un lien qui revient en arrière quand la page précédente de l'onglet est du site.
 */
export function BoutonRetourDePage({ repli, libelle, surPhoto = false, className }: BoutonRetourDePageProps) {
  const t = useTranslations('navigationPublique.enTeteDePage');
  return <LienFlecheDeRetour repli={repli} libelle={libelle ?? t('retour')} surPhoto={surPhoto} className={className} />;
}

export function EnTeteDePage({
  titre,
  titreDeLaPage = true,
  retour,
  action,
  variante = 'barre',
  aussiEnBureau = false,
  className,
}: EnTeteDePageProps) {
  const Titre = titreDeLaPage ? 'h1' : 'p';
  const telephone = aussiEnBureau ? undefined : 'lg:hidden';

  if (variante === 'sur-photo') {
    // Sous `md`, posé sur la photo (le parent est `relative`) ; de `md` à `lg`, la rangée collante.
    return (
      <header
        data-slot="en-tete-de-page"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-3',
          'md:pointer-events-auto md:sticky md:h-14 md:border-b md:border-border md:bg-background/95 md:px-1 md:py-0 md:backdrop-blur-sm',
          telephone,
          className,
        )}
      >
        {retour ? <BoutonRetourDePage repli={retour.repli} libelle={retour.libelle} surPhoto className="pointer-events-auto md:bg-transparent md:shadow-none" /> : <span />}
        {titre ? (
          <Titre className="sr-only md:not-sr-only md:min-w-0 md:flex-1 md:truncate md:text-corps md:font-semibold">{titre}</Titre>
        ) : null}
        {action ? <div className="pointer-events-auto flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
    );
  }

  return (
    <header
      data-slot="en-tete-de-page"
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-1 backdrop-blur-sm',
        !retour && 'pl-4',
        telephone,
        className,
      )}
    >
      {retour ? <BoutonRetourDePage repli={retour.repli} libelle={retour.libelle} /> : null}
      {titre ? (
        <Titre className="min-w-0 flex-1 truncate font-display text-titre-court font-semibold tracking-titre text-foreground">
          {titre}
        </Titre>
      ) : (
        <span className="flex-1" />
      )}
      {action ? <div className="flex shrink-0 items-center gap-1 pr-1">{action}</div> : null}
    </header>
  );
}
