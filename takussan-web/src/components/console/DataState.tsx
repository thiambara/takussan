import type { ReactNode } from 'react';

import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DataStateProps {
  readonly loading: boolean;
  /** Message d'erreur DÉJÀ traduit, ou `null`. Une chaîne vide compte comme absente. */
  readonly error?: ReactNode | null;
  /** Rendu à la place des enfants quand la requête a réussi et n'a rien rendu. */
  readonly emptyState?: ReactNode;
  /** `true` quand le jeu de résultats est vide. */
  readonly isEmpty?: boolean;
  /** Nombre de lignes de squelette pendant le chargement. */
  readonly skeletonRows?: number;
  /** Hauteur d'une ligne de squelette — `h-16` pour une carte, `h-10` pour une ligne de table. */
  readonly skeletonRowClassName?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * Chargement / erreur / vide, en UN point d'appel.
 *
 * Avant ce composant, chaque écran de la console rebranchait la même cascade ternaire — et pas
 * de la même façon : le gris de pierre 200 et le jeton `bg-muted` cohabitaient comme gris de
 * chargement **dans la même page**, quatre écrans rendaient un `<div className="h-10
 * animate-pulse">` maison là où `<Skeleton>` existe, et deux affichaient une erreur en rouge 600
 * nu au lieu d'`ErrorState`.
 *
 * ⚠ Les deux couleurs de ce paragraphe étaient écrites en classes jusqu'au 2026-08-27 — même
 * correction, même raison que dans `StatusBadge` : `check-super-admin-tokens.mjs` lit aussi les
 * commentaires, et ce fichier ne pouvait pas entrer dans son périmètre tant qu'il en portait.
 *
 * ## L'ordre des états est une décision, pas une commodité
 *
 * `loading` → `error` → `isEmpty` → `children`. Une requête qui refetch en arrière-plan sur une
 * erreur précédente montre le squelette, jamais l'erreur périmée ; et un jeu vide n'est un état
 * vide qu'après une réponse réussie — l'afficher pendant le chargement, c'est annoncer « aucun
 * résultat » avant d'avoir demandé.
 *
 * Il **compose** `ErrorState` et le `<EmptyState>` que l'appelant passe : il ne les redéfinit pas
 * (`scripts/check-feedback-states.mjs`).
 */
export function DataState({
  loading,
  error = null,
  emptyState,
  isEmpty = false,
  skeletonRows = 5,
  skeletonRowClassName = 'h-12',
  onRetry,
  retryLabel,
  children,
  className,
  'data-testid': dataTestId,
}: DataStateProps) {
  if (loading) {
    return (
      <div className={cn('space-y-2', className)} data-testid={dataTestId ?? 'data-state-loading'}>
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <Skeleton key={index} className={skeletonRowClassName} aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (error) {
    return onRetry && retryLabel ? (
      <ErrorState className={className} message={error} onRetry={onRetry} retryLabel={retryLabel} />
    ) : (
      <ErrorState className={className} message={error} />
    );
  }

  if (isEmpty && emptyState) {
    return <>{emptyState}</>;
  }

  return <>{children}</>;
}

export type { DataStateProps };
