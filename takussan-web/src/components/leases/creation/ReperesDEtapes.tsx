import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-2643 — le repère « 1 Bien · 2 Locataire · 3 Conditions · 4 Vérifier » du téléphone (maquette
 * `app-baux` a, `Etapes`) : une barre par étape, pleine jusqu'à l'étape courante, une coche devant
 * les étapes faites. Purement présentationnel : les libellés arrivent traduits.
 */
export function ReperesDEtapes({
  etapes,
  courante,
  libelle,
  className,
}: {
  readonly etapes: readonly string[];
  readonly courante: number;
  /** Le nom de la liste, pour un lecteur d'écran (« Étapes de la création du bail »). */
  readonly libelle: string;
  readonly className?: string;
}) {
  return (
    <ol aria-label={libelle} className={cn('flex gap-1.5', className)}>
      {etapes.map((nom, i) => {
        const faite = i < courante;
        const active = i === courante;
        return (
          <li key={nom} className="min-w-0 flex-1" aria-current={active ? 'step' : undefined}>
            <span aria-hidden="true" className={cn('block h-1 rounded-full', faite || active ? 'bg-primary' : 'bg-muted')} />
            <p className={cn('mt-1.5 flex items-center gap-1 truncate text-xs', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {faite ? (
                <Check className="size-3 flex-none text-success" strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              <span className="truncate">{nom}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
