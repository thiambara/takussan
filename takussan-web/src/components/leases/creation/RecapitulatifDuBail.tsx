import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface LigneDeRecapitulatif {
  readonly cle: string;
  readonly valeur: ReactNode;
}

/**
 * TCK-2643 — une carte du récapitulatif de l'étape « Vérifier » (maquette `app-baux` a,
 * `MobileAVerifier`) : un titre, « Modifier » qui ramène à l'étape, puis des lignes clé / valeur.
 */
export function CarteDeRecapitulatif({
  titre,
  modifier,
  onModifier,
  lignes,
}: {
  readonly titre: string;
  readonly modifier: string;
  readonly onModifier: () => void;
  readonly lignes: readonly LigneDeRecapitulatif[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-1.5">
      <div className="flex items-center py-2">
        <h3 className="flex-1 text-ui font-semibold text-muted-foreground">{titre}</h3>
        <button
          type="button"
          onClick={onModifier}
          aria-label={`${modifier} — ${titre}`}
          className="relative rounded-md text-sm font-medium text-primary outline-none after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring"
        >
          {modifier}
        </button>
      </div>
      <dl>
        {lignes.map((ligne) => (
          <div key={ligne.cle} className="flex items-baseline justify-between gap-4 border-t border-border py-2 text-sm">
            <dt className="text-muted-foreground">{ligne.cle}</dt>
            <dd className="min-w-0 text-right font-medium tabular-nums text-foreground">{ligne.valeur}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * TCK-2643 — « Réglages de l'agence appliqués » (maquette `ReglagesAgence`), SANS « Modifier »
 * (décision 7 de la session) : aucune page n'écrit encore un réglage d'agence. Le titre dit d'où
 * viennent les valeurs — l'agence quand l'une d'elles en vient, la plateforme sinon.
 */
export function ReglagesAppliques({
  titre,
  detail,
  className,
}: {
  readonly titre: string;
  readonly detail: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border border-border bg-card p-3.5', className)}>
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Settings2 className="size-icone" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-ui leading-snug text-muted-foreground">
        <span className="block text-sm font-medium text-foreground">{titre}</span>
        {detail}
      </p>
    </div>
  );
}
