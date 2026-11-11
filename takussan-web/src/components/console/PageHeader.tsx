import Link from 'next/link';
import type { ReactNode } from 'react';

import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { cn } from '@/lib/utils';

/** Une étape du fil d'Ariane. La dernière est la page courante : sans lien. */
interface EtapeDuFil {
  readonly label: ReactNode;
  readonly href?: string;
}

interface PageHeaderProps {
  /** Titre de page. Déjà traduit — cf. le docblock d'`EmptyState`. */
  readonly title: ReactNode;
  /** Ligne de contexte sous le titre. */
  readonly description?: ReactNode;
  /** Sur-titre en petites capitales espacées, au-dessus du titre. */
  readonly eyebrow?: ReactNode;
  /** Boutons ou liens alignés à droite du titre. */
  readonly actions?: ReactNode;
  /**
   * TCK-2687 — le fil d'Ariane, au-dessus du titre (page de détail). `label` nomme la zone pour les
   * lecteurs d'écran : déjà traduit (`console.pageHeader.breadcrumb`), ce composant ne traduit rien.
   */
  readonly fil?: { readonly label: string; readonly etapes: readonly EtapeDuFil[] };
  /** TCK-2687 — un bandeau pleine largeur AU-DESSUS du titre (KYC à finir, agence suspendue). */
  readonly bandeau?: ReactNode;
  /** TCK-2687 — sous l'en-tête : onglets soulignés ou barre de filtres, à 20 px (`mt-5`). */
  readonly dessous?: ReactNode;
  readonly className?: string;
}

/**
 * L'en-tête de page — **le seul du dépôt**, pour `/app` (administration d'agence comprise) et
 * `/super-admin`.
 *
 * Les 25 pages super-admin recopiaient le même bloc — mesuré le 2026-08-26 : 24 fois
 * `font-display text-2xl font-bold text-foreground` et 23 fois `mt-1 text-sm text-muted-foreground`,
 * avec une 25ᵉ page (`/super-admin/settings`) partie sur `text-foreground`, un jeton que le DS ne
 * publie plus. Recopié 24 fois, un bloc reste juste ; c'est la 25ᵉ copie qui décide, et personne
 * ne la voit passer. La console d'agence en recopiait 12 de plus.
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
 * La mise en page est celle de la console — **empilée en dessous de `lg`**, côte à côte au-dessus.
 * Pas `md` : dans une coque à barre latérale, 768 px n'en laissent que 464 au contenu (TCK-505),
 * et le bloc d'actions y séparait un bouton de son menu « ⋯ » en passant à la ligne. Côte à côte,
 * les actions sont `shrink-0` : c'est le titre, `min-w-0`, qui cède et passe à la ligne.
 * L'autre était en `flex-wrap` sur une seule ligne : sur un écran étroit, un bouton d'action long
 * passait à la ligne mais gardait son alignement à droite, à mi-hauteur du titre.
 *
 * Purement présentationnel : ni `'use client'`, ni `useTranslations`. Les pages serveur peuvent
 * donc l'importer sans embarquer de frontière client.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  fil,
  bandeau,
  dessous,
  className,
}: PageHeaderProps) {
  const enTete = (
    <header
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between',
        // Sans emplacement neuf, l'en-tête est la racine et prend la classe de l'appelant : le DOM
        // des 103 appelants d'avant TCK-2687 ne change pas d'un nœud.
        !(fil || bandeau || dessous) && className,
      )}
    >
      <div className="min-w-0">
        {/* TCK-2617 — le titre de la page, déclaré à l'en-tête du téléphone de `/app` (son H1 sous `md`
            pour une racine, son nom court pour un détail). Hors de la coque (`/super-admin`), rien. */}
        {typeof title === 'string' ? <DeclarerEnTete priorite="en-tete-de-page" titre={title} /> : null}
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        {/* TCK-2687 — sous la portée `/app` : 600 et −0,02 em (`tracking-titre`), 20 px / 28 au
            téléphone ; `text-2xl` (21,6 px rendu) au bureau. Ailleurs (`/super-admin`), l'en-tête
            d'avant, 700 et −0,025 em. */}
        <h1 className="font-display text-2xl font-bold tracking-tight text-balance text-foreground portee-app:font-semibold portee-app:tracking-titre portee-app:max-md:text-xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );

  if (!(fil || bandeau || dessous)) return enTete;

  return (
    <div className={className}>
      {bandeau ? <div className="mb-5">{bandeau}</div> : null}
      {fil ? <FilDAriane {...fil} /> : null}
      {enTete}
      {dessous ? <div className="mt-5">{dessous}</div> : null}
    </div>
  );
}

/**
 * TCK-2687 — le fil d'Ariane de la maquette (`TeteDePage`, `chrome-app.tsx:300`) : 13 px
 * (`text-ui`), encre discrète, séparateur « › » (décoratif, tu aux lecteurs d'écran : la liste dit
 * déjà l'ordre), `mb-2` ; la page courante en encre douce, marquée `aria-current`.
 *
 * TCK-2617 — **dès `md` seulement** : il remplace le lien « ← Retour » des pages de détail au bureau
 * (et dans le rail, de 768 à 1023, sans quoi cette plage n'aurait ni flèche ni fil) ; au téléphone,
 * c'est la flèche de l'en-tête de la coque (la maquette « Page de détail » n'y a pas de fil). Exporté :
 * une page de détail sans `PageHeader` (`LeaseDetail`) le pose elle-même.
 */
export function FilDAriane({
  label,
  etapes,
  className,
}: {
  readonly label: string;
  readonly etapes: readonly EtapeDuFil[];
  readonly className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('mb-2 max-md:hidden', className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-ui text-muted-foreground">
        {etapes.map((etape, i) => {
          const derniere = i === etapes.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden="true">›</span> : null}
              {derniere || !etape.href ? (
                <span className={derniere ? 'text-encre-douce' : undefined} aria-current={derniere ? 'page' : undefined}>
                  {etape.label}
                </span>
              ) : (
                <Link href={etape.href} className="hover:text-foreground hover:underline">
                  {etape.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type { EtapeDuFil, PageHeaderProps };
