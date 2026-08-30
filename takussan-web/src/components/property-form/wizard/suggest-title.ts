import { isFieldRelevant, type ContractTypeValue, type PropertyTypeValue } from '../field-matrix';

/**
 * TCK-464 — compose un titre d'annonce à partir de ce que le parcours sait déjà.
 *
 * Écrire un titre à froid est la chose la plus dure du formulaire, et c'était son PREMIER champ.
 * À la sixième étape, le type, la surface, les chambres et le quartier sont connus : on propose,
 * l'utilisateur corrige. Il n'invente plus, il arbitre.
 *
 * Pur, synchrone, sans réseau. Le vocabulaire des types vient du dictionnaire, passé en argument
 * (même contrat que `../options.ts` : un module hors composant ne porte pas de libellé).
 */
export type Traducteur = (cle: string) => string;

export type SuggestTitleInput = {
  readonly type: PropertyTypeValue;
  // Optionnel : le contrat peut légitimement ne pas encore être choisi à l'étape où ce titre se
  // compose. Voir plus bas la justification du repli quand il est absent.
  readonly contract?: ContractTypeValue;
  readonly area?: number;
  readonly bedrooms?: number;
  readonly quarter?: string;
  readonly city?: string;
};

export function suggestTitle(input: SuggestTitleInput, tType: Traducteur): string {
  const { type, contract, area, bedrooms, quarter, city } = input;
  // Repli sur 'sale' quand le contrat n'est pas encore connu. Ce n'est PAS un choix anodin en
  // général : `rent_period` et `available_from` (field-matrix.ts) ne sont pertinents qu'en
  // location, et un repli sur 'sale' les masquerait. Mais aucun des deux n'est interrogé ici — le
  // seul champ conditionnel demandé à `isFieldRelevant` plus bas est `bedrooms`, dont la
  // pertinence ne dépend que du TYPE, jamais du contrat. Le jour où ce module interroge un champ
  // qui dépend du contrat, ce repli doit être réexaminé plutôt que copié tel quel.
  const contexte = { type, contract: contract ?? 'sale' } as const;

  const segments: string[] = [tType(type)];

  // Un logement se décrit par ses chambres, un terrain par sa surface. La matrice arbitre —
  // c'est elle qui sait qu'un terrain n'a pas de chambres, même si la valeur traîne dans l'état
  // du formulaire après un changement de type.
  //
  // ⚠ « chambre(s) » est ici en français dans le code — entorse assumée au principe n°5 (le front
  // possède le texte affiché via next-intl fr/en/wo) ; justification complète juste en dessous,
  // au segment « à ».
  if (isFieldRelevant('bedrooms', contexte) && typeof bedrooms === 'number' && bedrooms > 0) {
    segments.push(`${bedrooms} ${bedrooms > 1 ? 'chambres' : 'chambre'}`);
  } else if (typeof area === 'number' && area > 0) {
    segments.push(`de ${area} m²`);
  }

  const lieu = (quarter?.trim() || city?.trim()) ?? '';
  // ⚠ « à » est ici en français dans le code — même entorse assumée que « chambre(s) » ci-dessus,
  // au principe n°5 (le front possède le texte affiché via next-intl fr/en/wo). Le titre composé
  // est une VALEUR PAR DÉFAUT modifiable par l'utilisateur, pas un libellé d'interface, et la
  // publication d'un bien n'est aujourd'hui servie qu'en français. Rendre ce module traduisible
  // demanderait de lui passer des clés ICU supplémentaires (accord singulier/pluriel,
  // préposition) — travail qui a du sens le jour où `wo`/`en` sont réellement servis à des
  // utilisateurs qui publient, pas avant.
  if (lieu) segments.push(`à ${lieu}`);

  return segments.join(' ');
}
