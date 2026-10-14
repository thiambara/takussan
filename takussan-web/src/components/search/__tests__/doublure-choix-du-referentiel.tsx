/**
 * Doublure de `ChoixDuReferentiel` pour les tests qui montent le panneau de filtres SANS
 * `QueryClientProvider` : les vraies listes interrogent l'API par React Query. La doublure garde le
 * contrat de props, et c'est lui seul que ces tests éprouvent ; l'adaptateur a ses propres tests
 * (`ChoixDuReferentiel.test.tsx`).
 *
 * Usage : `vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));`
 */
import type {
  ChoixDEquipementsProps,
  ChoixDeQuartierProps,
  ChoixDeVilleProps,
} from '../ChoixDuReferentiel';

export function ChoixDeVille({ valeur, region, onChange }: ChoixDeVilleProps) {
  return (
    <div data-testid="choix-ville" data-valeur={valeur ?? ''} data-region={region ?? ''}>
      <button type="button" onClick={() => onChange('Dakar')}>choisir-ville-Dakar</button>
      <button type="button" onClick={() => onChange('Dinguiraye', 'Kolda')}>choisir-ville-Dinguiraye-Kolda</button>
      <button type="button" onClick={() => onChange(undefined)}>retirer-ville</button>
    </div>
  );
}

export function ChoixDeQuartier({ ville, region, valeur, onChange }: ChoixDeQuartierProps) {
  return (
    <div data-testid="choix-quartier" data-ville={ville ?? ''} data-region={region ?? ''} data-valeur={valeur ?? ''}>
      <button type="button" onClick={() => onChange('Almadies')}>choisir-quartier-Almadies</button>
    </div>
  );
}

export function ChoixDEquipements({ valeurs, onChange }: ChoixDEquipementsProps) {
  return (
    <div data-testid="choix-equipements" data-valeurs={valeurs.join(',')}>
      <button type="button" onClick={() => onChange([...valeurs, 'Piscine'])}>ajouter-Piscine</button>
    </div>
  );
}
