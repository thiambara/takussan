import { isFieldRelevant, type PropertyTypeValue } from '../field-matrix';

/**
 * TCK-464 — compose un titre d'annonce à partir de ce que le parcours sait déjà.
 *
 * Écrire un titre à froid est la chose la plus dure du formulaire, et c'était son PREMIER champ.
 * À la sixième étape, le type, la surface, les chambres et le quartier sont connus : on propose,
 * l'utilisateur corrige. Il n'invente plus, il arbitre.
 *
 * Pur, synchrone, sans réseau. Le vocabulaire des types vient du dictionnaire, passé en argument
 * (même contrat que `./options.ts` : un module hors composant ne porte pas de libellé).
 */
export type Traducteur = (cle: string) => string;

export type SuggestTitleInput = {
  readonly type: PropertyTypeValue;
  readonly area?: number;
  readonly bedrooms?: number;
  readonly quarter?: string;
  readonly city?: string;
};

export function suggestTitle(input: SuggestTitleInput, tType: Traducteur): string {
  const { type, area, bedrooms, quarter, city } = input;
  const contexte = { type, contract: 'sale' } as const;

  const segments: string[] = [tType(type)];

  // Un logement se décrit par ses chambres, un terrain par sa surface. La matrice arbitre —
  // c'est elle qui sait qu'un terrain n'a pas de chambres, même si la valeur traîne dans l'état
  // du formulaire après un changement de type.
  //
  // ⚠ « chambre(s) » et « à » sont ici en français dans le code — entorse assumée au principe n°5
  // (le front possède le texte affiché via next-intl fr/en/wo). Le titre composé est une VALEUR
  // PAR DÉFAUT modifiable par l'utilisateur, pas un libellé d'interface, et la publication d'un
  // bien n'est aujourd'hui servie qu'en français. Rendre ce module traduisible demanderait de lui
  // passer des clés ICU supplémentaires (accord singulier/pluriel, préposition) — travail qui a
  // du sens le jour où `wo`/`en` sont réellement servis à des utilisateurs qui publient, pas avant.
  if (isFieldRelevant('bedrooms', contexte) && typeof bedrooms === 'number' && bedrooms > 0) {
    segments.push(`${bedrooms} ${bedrooms > 1 ? 'chambres' : 'chambre'}`);
  } else if (typeof area === 'number' && area > 0) {
    segments.push(`de ${area} m²`);
  }

  const lieu = (quarter?.trim() || city?.trim()) ?? '';
  if (lieu) segments.push(`à ${lieu}`);

  return segments.join(' ');
}
