import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Titre de page. Déjà traduit — cf. le docblock d'`EmptyState`. */
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Boutons ou liens alignés à droite du titre. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * L'en-tête de page de la console.
 *
 * Les 25 pages super-admin recopiaient le même bloc — mesuré le 2026-08-26 : 24 fois
 * `font-display text-2xl font-bold text-foreground` et 23 fois `mt-1 text-sm text-muted-foreground`,
 * avec une 25ᵉ page (`/super-admin/settings`) partie sur `text-foreground`, un jeton que le DS ne
 * publie plus. Recopié 24 fois, un bloc reste juste ; c'est la 25ᵉ copie qui décide, et personne
 * ne la voit passer.
 *
 * Purement présentationnel : ni `'use client'`, ni `useTranslations`. Les pages serveur de la
 * console peuvent donc l'importer sans embarquer de frontière client.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 md:flex-row md:items-start md:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
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
