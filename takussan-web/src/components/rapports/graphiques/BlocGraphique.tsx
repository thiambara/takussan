import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface VariationDuBloc {
  /** « +8 % sur octobre », « +9 points en un an » : le texte entier, déjà formaté. */
  readonly texte: string;
  readonly ton: 'succes' | 'danger' | 'neutre';
  readonly baisse?: boolean;
}

interface BlocGraphiqueProps {
  /** Ce que le graphique mesure (« Encaissé · 12 derniers mois »). */
  readonly titre: string;
  readonly total: string;
  readonly variation?: VariationDuBloc | null;
  /** À droite du titre : « Voir le tableau ». */
  readonly action?: ReactNode;
  /** Au-dessus du titre : les onglets « Encaissé · Occupation · Impayés » du téléphone. */
  readonly tete?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * TCK-2628 — le cadre d'un graphique de « Rapports » (maquette `BlocGraphique`) : ce qu'il mesure, son
 * total et sa variation AU-DESSUS du tracé (« le total et la variation au-dessus de chaque courbe »), le
 * texte en encre ; la flèche et la couleur de la variation la redisent, jamais seules.
 */
export function BlocGraphique({ titre, total, variation, action, tete, children, className }: BlocGraphiqueProps) {
  const Fleche = variation?.baisse ? ArrowDownRight : ArrowUpRight;
  return (
    <section data-slot="bloc-graphique" className={cn('rounded-xl border border-border bg-card p-4', className)}>
      {tete ? <div className="mb-4">{tete}</div> : null}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-ui text-muted-foreground">{titre}</h3>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-affiche-22 font-semibold tracking-titre tabular-nums">{total}</span>
            {variation ? (
              <span
                data-ton={variation.ton}
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-medium',
                  variation.ton === 'succes' && 'text-success',
                  variation.ton === 'danger' && 'text-destructive',
                  variation.ton === 'neutre' && 'text-muted-foreground',
                )}
              >
                {variation.ton === 'neutre' ? null : <Fleche className="size-3.5" aria-hidden="true" />}
                {variation.texte}
              </span>
            ) : null}
          </p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
