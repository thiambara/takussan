import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface AttenteDePuceProps {
  readonly className?: string;
}

/**
 * La pastille « ce clic est pris en compte, les biens arrivent » — TCK-580.
 *
 * Posée en `absolute` au coin haut-droit d'une puce (le parent la positionne en `relative`) :
 * elle ne prend AUCUNE place dans le flux. Un indicateur inséré dans le libellé élargissait la
 * puce cliquée et faisait sauter toutes ses voisines d'une rangée `flex-wrap` — le geste
 * déplaçait la cible suivante sous le doigt.
 *
 * Décorative (`aria-hidden`) : la puce elle-même porte `aria-busy`, et la page annonce le
 * chargement dans sa rangée d'outils (`aria-live`). Deux annonces pour un clic seraient du bruit.
 */
export function AttenteDePuce({ className }: AttenteDePuceProps) {
  return (
    <span
      aria-hidden
      data-attente="puce"
      className={cn(
        'animate-apparition-attente pointer-events-none absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-card shadow-sm ring-1 ring-border',
        className,
      )}
    >
      <Loader2 className="size-3 animate-spin text-primary" />
    </span>
  );
}
