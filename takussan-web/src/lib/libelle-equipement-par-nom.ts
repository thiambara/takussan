import { libelleEquipement, slugDuCatalogue, type TraducteurDuCatalogue } from '@/lib/libelle-equipement';

/**
 * TCK-633 (lot E) — le libellé d'un équipement que la RECHERCHE connaît par son nom.
 *
 * Le filtre `tags` porte des NOMS (`tags=Piscine,Parking`), que Meilisearch et la carte comparent
 * tels quels : la valeur de l'URL ne change pas, seul l'affichage passe par `libelleEquipement`
 * (lot D) — le catalogue traduit par son slug, un équipement d'annonceur tel quel.
 *
 * Le slug vient du catalogue chargé (`/api/public/amenities`) quand il y figure ; sinon il est
 * recalculé depuis le nom (`slugDuCatalogue`, la règle de `Str::slug`), ce qui sert :
 * - les puces de la barre, montées sans `QueryClientProvider` sur la moitié des écrans de test et
 *   de production — elles n'interrogent rien ;
 * - un nom tapé en minuscules dans l'URL (`tags=piscine`), que la recherche lit sans la casse ;
 * - le premier rendu, avant que la liste n'arrive.
 * Un nom hors catalogue — proposé par un annonceur, ou venu d'un lien ancien — n'a pas de clé de
 * traduction : il retombe sur lui-même.
 */
export interface EquipementNomme {
  readonly name: string;
  readonly slug: string;
}

export function libelleEquipementParNom(
  nom: string,
  t: TraducteurDuCatalogue,
  catalogue: readonly EquipementNomme[] = [],
): string {
  const connu = catalogue.find((equipement) => equipement.name === nom);
  return libelleEquipement(connu ?? { name: nom, slug: slugDuCatalogue(nom) }, t);
}
