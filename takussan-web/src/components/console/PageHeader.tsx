import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Titre de page. Déjà traduit — cf. le docblock d'`EmptyState`. */
  readonly title: ReactNode;
  /** Ligne de contexte sous le titre. */
  readonly description?: ReactNode;
  /** Sur-titre en petites capitales espacées, au-dessus du titre. */
  readonly eyebrow?: ReactNode;
  /** Boutons ou liens alignés à droite du titre. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * L'en-tête de page — **le seul du dépôt**, pour `/app`, `/admin` et `/super-admin`.
 *
 * Les 25 pages super-admin recopiaient le même bloc — mesuré le 2026-08-26 : 24 fois
 * `font-display text-2xl font-bold text-foreground` et 23 fois `mt-1 text-sm text-muted-foreground`,
 * avec une 25ᵉ page (`/super-admin/settings`) partie sur `text-foreground`, un jeton que le DS ne
 * publie plus. Recopié 24 fois, un bloc reste juste ; c'est la 25ᵉ copie qui décide, et personne
 * ne la voit passer. La console `/admin` en recopiait 12 de plus.
 *
 * ## Pourquoi il n'y en a plus qu'un (TCK-373)
 *
 * Le dépôt en a porté DEUX pendant une vague : celui-ci et `layout/PageHeader`, qui rendait la
 * même chose sous d'autres noms de props (`subtitle` pour `description`) et un `eyebrow` en plus.
 * *Deux composants qui font une seule chose, c'est exactement le défaut que TCK-373 existe pour
 * éteindre* — les laisser coexister l'aurait reconduit un étage plus haut, là où il aurait été
 * plus cher à voir. `eyebrow` vient de l'autre implémentation ; `subtitle` a été porté sur
 * `description`, qui comptait 25 appelants contre 7.
 *
 * La mise en page est celle de la console — **empilée en dessous de `md`**, côte à côte au-dessus.
 * L'autre était en `flex-wrap` sur une seule ligne : sur un écran étroit, un bouton d'action long
 * passait à la ligne mais gardait son alignement à droite, à mi-hauteur du titre.
 *
 * Purement présentationnel : ni `'use client'`, ni `useTranslations`. Les pages serveur peuvent
 * donc l'importer sans embarquer de frontière client.
 */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 md:flex-row md:items-start md:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export type { PageHeaderProps };
