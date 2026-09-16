import { cn } from '@/lib/utils';

export interface BarreDeChargementProps {
  /** Annoncé aux lecteurs d'écran — la barre elle-même est décorative. */
  readonly libelle: string;
  /**
   * `bord` : collée au bas de son parent positionné (la barre de navigation).
   * `ecran` : en haut de la fenêtre, au-dessus de tout.
   */
  readonly position?: 'bord' | 'ecran';
}

/**
 * La barre indéterminée d'une navigation en cours — cf. `.animate-barre-chargement` dans
 * `globals.css` pour le motif. Le composant ne sait pas QUAND il s'affiche : l'appelant le monte
 * pendant sa transition.
 */
export function BarreDeChargement({ libelle, position = 'bord' }: BarreDeChargementProps) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none h-[3px] overflow-hidden bg-primary/15',
        position === 'bord' ? 'absolute inset-x-0 bottom-0' : 'fixed inset-x-0 top-0 z-[60]',
      )}
    >
      <div className="animate-barre-chargement h-full w-2/5 rounded-full bg-primary" aria-hidden />
      <span className="sr-only">{libelle}</span>
    </div>
  );
}
