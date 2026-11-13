'use client';

import { useId, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';

/**
 * TCK-2594 — les feuilles de la fiche d'une réservation (maquette `app-reservations` a, écrans
 * « Refuser (motif) », « Enregistrer un paiement », « Rembourser ») : la feuille du bas au téléphone
 * et sous `xl`, le panneau droit dès `xl` (1280), comme « Saisir une demande » (TCK-2580). La
 * feuille est modale ; le panneau ne l'est pas, la fiche reste lisible à côté.
 */
export const REQUETE_PANNEAU = '(width >= 80rem)';

export function useEnPanneau(): boolean {
  return useMatchesMedia(REQUETE_PANNEAU);
}

interface FeuilleOuPanneauProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly titre: ReactNode;
  /** Le geste qui conclut : un bouton `type="submit"` relié au formulaire du corps par `form`. */
  readonly pied: ReactNode;
  readonly children: ReactNode;
}

export function FeuilleOuPanneau({ open, onOpenChange, titre, pied, children }: FeuilleOuPanneauProps) {
  const panneau = useEnPanneau();
  return panneau ? (
    <PanneauDroit open={open} onOpenChange={(suivant) => onOpenChange(suivant)} titre={titre} pied={pied}>
      {children}
    </PanneauDroit>
  ) : (
    <FeuilleDuBas open={open} onOpenChange={(suivant) => onOpenChange(suivant)} titre={titre} pied={pied}>
      {children}
    </FeuilleDuBas>
  );
}

export interface OptionDeChoix<T extends string> {
  readonly valeur: T;
  readonly libelle: string;
}

interface PastillesDeChoixProps<T extends string> {
  readonly libelle: string;
  readonly options: readonly OptionDeChoix<T>[];
  readonly valeur: T | null;
  readonly onChange: (valeur: T) => void;
  readonly aide?: ReactNode;
}

/**
 * Un choix unique en pastilles de 44 px (maquette : `Choix`) — des radios natifs, donc les flèches
 * et l'espace au clavier, et l'annonce « 2 sur 5 » au lecteur d'écran, sans les réécrire.
 */
export function PastillesDeChoix<T extends string>({ libelle, options, valeur, onChange, aide }: PastillesDeChoixProps<T>) {
  const id = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{libelle}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const actif = o.valeur === valeur;
          return (
            <label
              key={o.valeur}
              className={cn(
                'inline-flex h-11 flex-none cursor-pointer items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring',
                actif ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              <input type="radio" name={id} value={o.valeur} checked={actif} onChange={() => onChange(o.valeur)} className="sr-only" />
              {o.libelle}
            </label>
          );
        })}
      </div>
      {aide ? <p className="mt-1 text-xs text-muted-foreground">{aide}</p> : null}
    </fieldset>
  );
}

/** L'avertissement d'une feuille (maquette « Rembourser » : fonds déjà reversés). */
export function Avertissement({ children }: { readonly children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm leading-snug">
      <CircleAlert className="mt-0.5 size-4.5 flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
