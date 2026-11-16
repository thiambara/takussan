'use client';

import type { LoyersDuMois as Loyers } from '@/lib/accueil/loyers-du-mois';
import { cn } from '@/lib/utils';

import { useFilesDuBailleur, type FilesDeLHote } from './AFaireBailleur';
import { LoyersDuMois } from './LoyersDuMois';

/**
 * TCK-2850 (maquette `app-accueil` a, e2 « Bailleur » et e6 « Rien à faire (bailleur) ») — où « Loyers du
 * mois » se pose au BUREAU large (`xl`, deux colonnes) :
 *
 *  - le bailleur a quelque chose à faire (e2), ou ses files se lisent encore : à GAUCHE, au-dessus de « À
 *    faire maintenant » ;
 *  - rien à faire (e6, l'état `aJour` du bloc) : dans la colonne de DROITE, au-dessus de « Ce mois » ; la
 *    colonne de gauche commence alors par « À faire ».
 *
 * Le téléphone et le bureau étroit (une colonne, sous `xl`) gardent la carte au-dessus de « À faire »
 * (maquette e6 téléphone). L'état vient de `useFilesDuBailleur`, les mêmes lectures que « À faire » (mêmes
 * clés de cache) : aucune requête de plus. La page monte DEUX emplacements, chacun ne rend que le sien.
 */
export function PlaceDesLoyers({
  place,
  loyers,
  jour,
  landlordId,
  hote = null,
  className,
}: {
  /** `blocs` : la colonne de gauche (et toute largeur sous `xl`) ; `colonne` : la droite, au bureau large. */
  readonly place: 'blocs' | 'colonne';
  readonly loyers: Loyers;
  readonly jour: string;
  readonly landlordId: number;
  readonly hote?: FilesDeLHote | null;
  readonly className?: string;
}) {
  const { bloc } = useFilesDuBailleur(landlordId, hote);
  const aDroite = bloc === 'aJour';
  if (place === 'colonne') {
    return aDroite ? <LoyersDuMois loyers={loyers} jour={jour} className={cn('max-xl:hidden', className)} /> : null;
  }
  return <LoyersDuMois loyers={loyers} jour={jour} className={cn(aDroite && 'xl:hidden', className)} />;
}
