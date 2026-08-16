import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { DestructiveBanner } from '@/components/ui/destructive-banner';

type ErrorStateBase = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  /** Le message affiché. Déjà traduit — cf. le docblock d'`EmptyState`. */
  readonly message: ReactNode;
  /** Icône lucide optionnelle, alignée sur la première ligne du message. */
  readonly icon?: ReactNode;
};

/**
 * `onRetry` et `retryLabel` vont ENSEMBLE, et le typage l'impose.
 *
 * Un bouton de reprise sans libellé serait un carré vide, et un libellé sans action serait un
 * mensonge. Comme ce composant ne traduit pas lui-même (le libellé vient de l'appelant), rien
 * d'autre que le typage ne pouvait tenir cette paire.
 */
type ErrorStateProps = ErrorStateBase &
  (
    | { readonly onRetry: () => void; readonly retryLabel: string }
    | { readonly onRetry?: never; readonly retryLabel?: never }
  );

/**
 * L'UNIQUE bloc d'erreur inline du produit.
 *
 * Il n'installe PAS `ui/alert.tsx` — le ticket le prescrivait, mais `<Alert variant="destructive">`
 * est le composant shadcn/Radix, et ce dépôt tourne sur `@base-ui/react` sans aucune dépendance
 * Radix. L'équivalent existait déjà : `DestructiveBanner`, avec son `role="alert"` et ses tokens
 * `destructive/10` + `ring-destructive/20`. Il n'avait qu'**un seul consommateur** dans tout le
 * dépôt, pendant que 16 fichiers recopiaient le même `rounded-xl bg-app-surface-1 p-6 text-sm
 * text-red-600` au caractère près et qu'une quarantaine d'autres formes mêlaient la palette
 * Tailwind brute aux tokens du DS.
 *
 * `role="alert"` est donc posé UNE fois, par `DestructiveBanner`. Les appelants qui portaient leur
 * propre `role="alert"` doivent le retirer en migrant, sinon l'annonce est doublée.
 *
 * Sans `onRetry`, ce composant ne rend aucun gestionnaire d'événement : il reste utilisable depuis
 * un server component (`app/leases/[id]/page.tsx` s'en sert ainsi).
 */
export function ErrorState({
  message,
  icon,
  onRetry,
  retryLabel,
  className,
  ...props
}: ErrorStateProps) {
  return (
    // `className` part tel quel : `DestructiveBanner` le passe déjà à `cn()`
    // avec ses propres classes. L'envelopper ici une seconde fois ne fusionnait
    // rien de plus et faisait croire à une intention.
    <DestructiveBanner icon={icon} className={className} {...props}>
      <p className="font-medium">{message}</p>
      {onRetry ? (
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </DestructiveBanner>
  );
}

export type { ErrorStateProps };
