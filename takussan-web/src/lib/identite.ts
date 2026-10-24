import { formaterTelephone } from '@/lib/phone';

/**
 * TCK-623 — ce que l'interface peut écrire de la personne connectée, sans jamais écrire
 * « undefined ».
 *
 * Un compte ouvert par téléphone (TCK-589) ou par OAuth naît avec `first_name = ''` et
 * `last_name = ''`. La navbar construisait ses initiales par `first_name[0]` : sur une chaîne vide,
 * `''[0]` vaut `undefined`, et le gabarit l'écrivait en toutes lettres — « UNDEFINED » dans la
 * pastille, débordant sur « Publier » (relevé en préproduction le 2026-10-10).
 *
 * Chaque fonction rend `null` quand elle n'a RIEN de vrai à dire : c'est à l'appelant de choisir le
 * repli (un libellé traduit, une icône), parce que lui seul sait ce que l'écran peut se permettre.
 */
export interface IdentiteAffichable {
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
}

function nettoyer(valeur: string | null | undefined): string | null {
  const propre = (valeur ?? '').trim();
  return propre === '' ? null : propre;
}

/** Le premier caractère visible — `Array.from` pour ne pas couper un emoji en deux. */
function premiereLettre(valeur: string | null): string {
  return valeur ? (Array.from(valeur)[0] ?? '') : '';
}

/** Le prénom, ou `null` s'il n'a pas encore été donné. */
export function prenomDe(user: IdentiteAffichable | null | undefined): string | null {
  return nettoyer(user?.first_name);
}

/** Prénom et nom, ou ce qui en existe ; `null` si ni l'un ni l'autre. */
export function nomCompletDe(user: IdentiteAffichable | null | undefined): string | null {
  const morceaux = [nettoyer(user?.first_name), nettoyer(user?.last_name)].filter(Boolean);
  return morceaux.length > 0 ? morceaux.join(' ') : null;
}

/**
 * Ce qui désigne la personne à ses propres yeux : son nom, sinon son e-mail, sinon son numéro
 * (lisible : `+221 77 000 06 22`). `null` seulement pour un compte sans aucun des trois.
 */
export function libelleDe(user: IdentiteAffichable | null | undefined): string | null {
  const telephone = nettoyer(user?.phone);
  return (
    nomCompletDe(user) ??
    nettoyer(user?.email) ??
    (telephone ? formaterTelephone(telephone) : null)
  );
}

/**
 * Les initiales de la pastille : prénom + nom, sinon la première lettre de l'e-mail. Un numéro ne
 * donne pas d'initiale (« + » n'en est pas une) : `null`, et l'appelant montre une silhouette.
 */
export function initialesDe(user: IdentiteAffichable | null | undefined): string | null {
  const parNom = `${premiereLettre(nettoyer(user?.first_name))}${premiereLettre(nettoyer(user?.last_name))}`;
  if (parNom !== '') return parNom.toUpperCase();
  const parEmail = premiereLettre(nettoyer(user?.email));
  return parEmail !== '' ? parEmail.toUpperCase() : null;
}

/** Une personne désignée par son identifiant, dont l'écran a chargé tout ou partie des coordonnées. */
export interface IdentiteAvecId extends IdentiteAffichable {
  readonly id: number | string;
}

/**
 * P220.04 (TCK-2138) — LE nom affichable d'une personne, pour tout écran qui la désigne : prénom et
 * nom, sinon e-mail, sinon numéro, sinon `#<id>` — jamais une chaîne vide. Un compte créé par
 * téléphone naît à noms `''`, et chaque écran qui composait `first_name` + `last_name` à sa façon
 * rendait alors une ligne, une option ou un titre vides.
 *
 * L'appelant ne passe que les champs qu'il charge déjà : un e-mail ou un numéro absents sont sautés,
 * ils ne se demandent pas à l'API pour l'occasion. `repli` remplace `#<id>` quand l'écran a déjà
 * son propre libellé traduit (« Membre #12 ») ; une chaîne vide n'en est pas un.
 */
export function nomAffichable(user: IdentiteAvecId, repli?: string | null): string {
  return libelleDe(user) ?? nettoyer(repli) ?? `#${user.id}`;
}
