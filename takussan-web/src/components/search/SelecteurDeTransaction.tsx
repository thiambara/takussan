'use client';

import { cn } from '@/lib/utils';

export type Transaction = '' | 'sale' | 'rent';

export interface SelecteurDeTransactionProps {
  /** `''` : aucune transaction choisie — la recherche ne filtre pas sur `contract_type`. */
  readonly valeur: Transaction;
  readonly onChange: (valeur: Transaction) => void;
  readonly libelles: { readonly groupe: string; readonly sale: string; readonly rent: string };
  readonly className?: string;
}

/**
 * « Acheter | Louer » — le sélecteur segmenté de la barre de recherche publique.
 *
 * Source : `Accueil.dc.html` (projet claude.ai/design « Takussan »). Une pastille de carte glisse
 * sous le choix : 320 ms sur `cubic-bezier(0.2, 0.8, 0.2, 1)`, la même courbe que la maquette. Rien
 * de choisi → la pastille s'efface en se resserrant (`scale(0.85)`, opacité 0), et un second appui
 * sur le choix en cours le retire : « peu importe » reste exprimable, comme dans l'ancien menu.
 *
 * Ce sont deux boutons à bascule (`aria-pressed`) dans un groupe nommé, pas un `radiogroup` : un
 * groupe radio n'admet pas l'état « aucun ». Le libellé en gras est RÉSERVÉ dans chaque bouton
 * (double invisible) : passer de 500 à 600 élargirait la colonne choisie de deux pixels, et la
 * pastille sauterait à chaque bascule.
 */
export function SelecteurDeTransaction({ valeur, onChange, libelles, className }: SelecteurDeTransactionProps) {
  const choix = [
    { cle: 'sale', libelle: libelles.sale },
    { cle: 'rent', libelle: libelles.rent },
  ] as const;

  return (
    <div
      role="group"
      aria-label={libelles.groupe}
      className={cn('relative grid shrink-0 grid-cols-2 rounded-full bg-muted p-[3px]', className)}
    >
      <span
        aria-hidden="true"
        data-slot="pastille"
        className={cn(
          'pointer-events-none absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-card',
          'shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_14%,transparent)]',
          '[transition:translate_320ms_var(--ease-segment),scale_320ms_var(--ease-segment),opacity_200ms_var(--ease-segment)]',
          '[--ease-segment:cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
          valeur === 'rent' && 'translate-x-full',
          valeur === '' && 'scale-[0.85] opacity-0',
        )}
      />
      {choix.map(({ cle, libelle }) => {
        const actif = valeur === cle;
        return (
          <button
            key={cle}
            type="button"
            aria-pressed={actif}
            onClick={() => onChange(actif ? '' : cle)}
            className={cn(
              'relative z-[1] grid h-8 min-w-[76px] place-items-center rounded-full px-3.5 text-sm',
              // Zone d'appui portée à 46 px de haut sans toucher au dessin : le bouton en mesure 32.
              "after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-['']",
              'transition-[color,scale] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.96]',
              'motion-reduce:active:scale-100',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              actif ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="col-start-1 row-start-1">{libelle}</span>
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">
              {libelle}
            </span>
          </button>
        );
      })}
    </div>
  );
}
