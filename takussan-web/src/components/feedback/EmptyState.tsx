import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type EmptyStateProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  /** Icône lucide, en `size-8` — posée dans une pastille ronde. Optionnelle. */
  readonly icon?: ReactNode;
  /** Titre court. Déjà traduit : ce composant ne parle à personne (cf. plus bas). */
  readonly title: ReactNode;
  /** Une phrase d'encouragement, pas une constatation (`docs/design-guidelines.md`). */
  readonly description?: ReactNode;
  /** Le CTA — un `<Button>` ou un `<Link className={buttonVariants()}>`. */
  readonly action?: ReactNode;
};

/**
 * L'UNIQUE état vide du produit.
 *
 * `docs/design-guidelines.md:13` demande « une seule façon d'afficher un état vide ». Au
 * 2026-08-15, avant ce fichier, il y en avait **au moins 41, sur 32 fichiers, en 23 formes de
 * `className` distinctes** — et le nom `EmptyState` était déjà pris **huit fois**, chaque fois
 * comme fonction privée locale, jamais exportée. Une convention que rien ne mesure a été violée
 * huit fois ; c'est `scripts/check-feedback-states.mjs` qui la tient désormais.
 *
 * ## Pourquoi ce composant ne traduit PAS lui-même
 *
 * Il est **purement présentationnel** : ni `'use client'`, ni `useTranslations`. C'est délibéré et
 * c'est la contrainte qui commande sa forme.
 *
 * Deux des surfaces qu'il sert sont des server components `async` — `admin/agency/page.tsx` et
 * `app/inventories/new/page.tsx` — et un troisième groupe est rendu depuis des client components.
 * Un hook de traduction ici en ferait une frontière client : les pages serveur ne pourraient plus
 * l'importer sans embarquer un bundle dont elles n'ont pas besoin. L'appelant choisit donc son
 * canal — `useTranslations` côté client, `getTranslations` côté serveur — et passe des chaînes
 * déjà traduites.
 *
 * ## Ce qu'il faut lui laisser passer
 *
 * Les props résiduelles sont spread sur le conteneur, et ce n'est pas de la complaisance :
 * `TeamConsole` ancre un `data-testid` sur son état vide, et `PropertiesDiscoveryPage` rend le
 * sien **dans une grille** et a besoin de `className="col-span-full"`. Sans l'un la migration
 * perdait un point d'ancrage de test, sans l'autre elle cassait une mise en page.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-10 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="mb-4 rounded-full bg-muted p-4 text-accent">{icon}</div>
      ) : null}
      <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export type { EmptyStateProps };
