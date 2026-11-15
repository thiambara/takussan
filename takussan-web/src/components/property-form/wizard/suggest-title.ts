import { isFieldRelevant, type ContractTypeValue, type PropertyTypeValue } from '../field-matrix';

/**
 * TCK-464 — compose un titre d'annonce à partir de ce que le parcours sait déjà.
 *
 * Écrire un titre à froid est la chose la plus dure du formulaire, et c'était son PREMIER champ.
 * À la sixième étape, le type, la surface, les chambres et le quartier sont connus : on propose,
 * l'utilisateur corrige. Il n'invente plus, il arbitre.
 *
 * Pur, synchrone, sans réseau. Tout le texte vient du dictionnaire, passé en argument (même
 * contrat que `../options.ts` : un module hors composant ne porte pas de libellé) : le libellé du
 * type par `tType`, et la phrase elle-même par les gabarits `property.wizard.suggestedTitle.*`
 * (TCK-2833). Chaque langue y décide de l'ordre des segments, de la préposition et de l'accord
 * des chambres. Les gabarits reçoivent le type sous deux formes : `{type}`, le libellé de
 * `property.types` (« Appartement », en tête du titre français), et `{noun}`, le nom tel qu'il
 * s'écrit au milieu d'une phrase (`suggestedTitle.noun.*` : « 60 m² apartment » en anglais). Le
 * français et le wolof n'emploient que `{type}`, pour rester liés au vocabulaire des types. Une
 * concaténation de mots traduits aurait figé la syntaxe française dans les trois (même patron
 * que `@/lib/titre-de-la-liste`).
 *
 * La surface passe en CHAÎNE (`{area}`) : le gabarit ne la reformate pas selon la langue, le
 * titre français reste au caractère près celui d'avant (« 1500 m² »).
 */
export type Traducteur = (cle: string) => string;

/** Le traducteur de `property.wizard` — celui que les deux appelants tiennent déjà. */
export type TraducteurDeTitre = (
  cle:
    | 'suggestedTitle.surface'
    | 'suggestedTitle.bedrooms'
    | 'suggestedTitle.place'
    | `suggestedTitle.noun.${PropertyTypeValue}`,
  valeurs?: Record<string, string | number>,
) => string;

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

export function suggestTitle(
  input: SuggestTitleInput,
  tType: Traducteur,
  tTitre: TraducteurDeTitre,
): string {
  const { type, contract, area, bedrooms, quarter, city } = input;
  // Repli sur 'sale' quand le contrat n'est pas encore connu. Ce n'est PAS un choix anodin en
  // général : `rent_period` et `available_from` (field-matrix.ts) ne sont pertinents qu'en
  // location, et un repli sur 'sale' les masquerait. Mais aucun des deux n'est interrogé ici — le
  // seul champ conditionnel demandé à `isFieldRelevant` plus bas est `bedrooms`, dont la
  // pertinence ne dépend que du TYPE, jamais du contrat. Le jour où ce module interroge un champ
  // qui dépend du contrat, ce repli doit être réexaminé plutôt que copié tel quel.
  const contexte = { type, contract: contract ?? 'sale' } as const;

  let titre = tType(type);
  const nom = () => tTitre(`suggestedTitle.noun.${type}`);

  // Un logement se décrit par ses chambres, un terrain par sa surface. La matrice arbitre —
  // c'est elle qui sait qu'un terrain n'a pas de chambres, même si la valeur traîne dans l'état
  // du formulaire après un changement de type.
  if (isFieldRelevant('bedrooms', contexte) && typeof bedrooms === 'number' && bedrooms > 0) {
    titre = tTitre('suggestedTitle.bedrooms', { type: titre, noun: nom(), count: bedrooms });
  } else if (typeof area === 'number' && area > 0) {
    titre = tTitre('suggestedTitle.surface', { type: titre, noun: nom(), area: String(area) });
  }

  const lieu = (quarter?.trim() || city?.trim()) ?? '';
  if (lieu) titre = tTitre('suggestedTitle.place', { title: titre, place: lieu });

  return titre;
}
