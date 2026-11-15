import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * TCK-2656 (lot 3) — les briques de la fiche d'un document, d'après la maquette (`Carte`,
 * `TitreBloc`, `Paire` de `chrome-app.tsx` et `app-interventions-coque.tsx`).
 */

export function Carte({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cn('rounded-xl border border-border bg-card', className)}>{children}</div>;
}

/** Le titre d'un bloc (18 px, display) et son geste à droite. */
export function TitreDeBloc({
  id,
  children,
  action,
  className,
}: {
  readonly id?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 id={id} className="font-display text-lg font-semibold tracking-titre">
        {children}
      </h2>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}

/** Une ligne libellé / valeur de la carte des métadonnées. */
export function Paire({ libelle, children }: { readonly libelle: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="flex-none text-muted-foreground">{libelle}</dt>
      <dd className="min-w-0 text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}
