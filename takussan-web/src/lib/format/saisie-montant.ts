import type { Locale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import { CURRENCY_METADATA } from './currency';

/**
 * TCK-564 — la SAISIE d'un montant : ce qu'on lit dans le champ, et ce qu'on y réécrit.
 *
 * Un testeur a saisi « 49000000 » dans le prix du parcours de publication et demandé un séparateur
 * de milliers : huit chiffres collés ne se relisent pas, et un zéro de trop (490 millions au lieu
 * de 49) ne se voit pas. Le champ était un `<input type="number">`, qui ne sait AFFICHER aucun
 * séparateur — le navigateur refuse toute valeur qui n'est pas un nombre brut.
 *
 * Le champ devient donc un champ TEXTE, et ce module porte les deux conversions, pures :
 *
 * - `lireSaisie` — du texte tapé (ou collé) vers la paire { affichage groupé, valeur numérique } ;
 * - `ecrireMontant` — d'une valeur venue d'ailleurs (brouillon repris, bien édité) vers l'affichage.
 *
 * ⚠ **La valeur remise au formulaire reste un NOMBRE sans séparateur** — c'est elle, et elle
 * seule, qui part à l'API. Le séparateur n'existe qu'à l'écran : il ne doit jamais atteindre
 * `z.coerce.number`, qui lirait « 49 000 000 » comme `NaN`.
 *
 * Le groupement suit la locale ACTIVE par `formatNumber` — la même table que tout l'affichage des
 * montants (`wo` → `fr-SN`, cf. `lib/format.ts`) : « 49 000 000 » en français et en wolof,
 * « 49,000,000 » en anglais. Deux conventions dans le même écran seraient le défaut de TCK-374.
 */

/** Au-delà, un `number` JavaScript ne représente plus chaque entier : la saisie s'arrête là. */
const CHIFFRES_ENTIERS_MAX = 15;

/**
 * Le nombre de décimales qu'admet une devise : 0 pour le franc CFA (XOF n'a pas de sous-unité —
 * principe n°3 du `CLAUDE.md` racine), 2 pour l'euro et le dollar. Une devise inconnue n'en admet
 * aucune : mieux vaut refuser des centimes que les inventer.
 */
export function decimalesDeDevise(devise: string | null | undefined): number {
  const code = (devise ?? '').toUpperCase() as keyof typeof CURRENCY_METADATA;
  return CURRENCY_METADATA[code]?.decimalPlaces ?? 0;
}

/** Le séparateur décimal de la locale — mesuré sur `formatNumber`, jamais supposé. */
export function separateurDecimal(locale: Locale): string {
  return formatNumber(1.5, locale).replace(/\d/g, '') || ',';
}

/** Le séparateur de milliers de la locale — mesuré de même (U+202F en `fr-SN`, `,` en anglais). */
export function separateurDeMilliers(locale: Locale): string {
  return formatNumber(1000, locale).replace(/\d/g, '');
}

/** Le nombre de chiffres qui suivent une position, jusqu'à la fin du texte. */
function chiffresApres(brut: string, position: number): number {
  return brut.slice(position + 1).replace(/\D/g, '').length;
}

/** Chaque occurrence est suivie d'un groupe de TROIS chiffres exactement : « 49.000.000 ». */
function groupesDeTrois(brut: string, positions: readonly number[]): boolean {
  return positions.every((debut, k) => {
    const fin = k + 1 < positions.length ? positions[k + 1] : brut.length;
    return brut.slice(debut + 1, fin).replace(/\D/g, '').length === 3;
  });
}

/**
 * Où commence la partie décimale d'un texte saisi — ou `-1` : tout est partie entière.
 *
 * Seuls le point et la virgule peuvent la marquer ; l'espace, l'espace fine et les lettres
 * (« F CFA ») groupent toujours. Les règles, dans l'ordre :
 *
 * 0. **Une frappe de trop** — un signe final qu'aucun chiffre ne suit, derrière une marque
 *    décimale déjà posée — ne décide rien, qu'il soit le même signe ou l'autre : « 1 500,5 » suivi
 *    de « , » ou de « . » vaut 1 500,5, jamais 15 005.
 * 1. **Les DEUX signes sont présents** (« 1.500,50 », « 1,500.25 ») : le texte n'est pas ambigu,
 *    quelle que soit la langue de l'écran. Le signe qui vient EN DERNIER marque les décimales (sa
 *    première occurrence) ; l'autre groupe. En franc CFA, il faut encore qu'il soit seul et suivi
 *    d'au plus deux chiffres. Un montant collé depuis un document rédigé dans l'autre convention
 *    se lit donc juste. **Entremêlés** (« 1,500.5,0 »), les signes ne disent plus rien : en euro,
 *    le premier séparateur décimal de la locale tranche (règle 4) ; en franc CFA, aucun centime.
 * 1 bis. **Partie entière nulle** (« .500 », « 0.500 ») : en devise à décimales, le premier signe
 *    ouvre les décimales — « 0 500 » ne groupe rien —, sauf le séparateur de milliers de la locale
 *    suivi d'un groupe entier (« ,500 » en anglais : un « 1,500 » dont on efface le 1). Les règles
 *    2 à 4 ne jouent qu'au-delà.
 * 2. **Un seul signe, et c'est le séparateur de milliers de la locale** (la virgule en anglais) :
 *    il groupe, toujours. Effacer un chiffre de « 1,500,000 » donne « 1,500,00 », qui vaut
 *    150 000 — le lire 1 500 punirait une simple correction.
 * 3. **Plusieurs occurrences, chacune suivie de trois chiffres** : des milliers (« 49.000.000 »).
 * 4. **Devise à décimales** : le PREMIER séparateur décimal de la locale ouvre les décimales — une
 *    frappe de trop (« 1 500,5 » puis « , ») ne fait pas lire « 15 005 ». L'autre signe (le point
 *    du clavier numérique, en français) ne les ouvre que seul, et suivi d'au plus deux chiffres :
 *    trois chiffres font un groupe de milliers (« 1.500 » vaut 1 500).
 * 5. **Devise sans décimales (XOF)** : le dernier signe marque des centimes COLLÉS s'il est suivi
 *    d'au plus deux chiffres (« 1 500,00 », « 49000000.00 ») ; ils tomberont.
 */
function marqueDecimale(brut: string, decimales: number, locale: Locale): number {
  const signes = [...brut.matchAll(/[.,]/g)].map((m) => m.index);
  if (signes.length === 0) return -1;

  const derniere = signes[signes.length - 1];
  const sep = separateurDecimal(locale);

  // 0. Une FRAPPE DE TROP : un signe final, qu'aucun chiffre ne suit, derrière un texte qui porte
  //    DÉJÀ une marque décimale. Quel qu'il soit — le même signe (« 1 500,5 » + « , ») ou l'autre
  //    (« 1 500,5 » + « . », côte à côte sur le clavier `decimal` d'Android) —, il ne décide rien :
  //    le lire comme « le dernier des deux » ferait de la vraie marque un groupe, et « 1 500,5 »
  //    vaudrait 15 005. Sans marque avant lui (« 1.500 » en français), c'est lui qui ouvre les
  //    décimales, et les règles suivantes le disent.
  if (signes.length > 1 && chiffresApres(brut, derniere) === 0) {
    const avant = marqueDecimale(brut.slice(0, derniere) + brut.slice(derniere + 1), decimales, locale);
    if (avant >= 0) return avant;
  }

  const memes = signes.filter((i) => brut[i] === brut[derniere]);

  if (memes.length !== signes.length) {
    // L'autre signe doit tout entier PRÉCÉDER celui-ci. Entremêlés (« 1,500.5,0 »), ils ne disent
    // rien : la langue de l'écran tranche, et c'est son PREMIER séparateur décimal qui compte
    // (règle 4). En franc CFA, rien n'est lu comme des centimes.
    const autres = signes.filter((i) => brut[i] !== brut[derniere]);
    if (autres[autres.length - 1] > memes[0]) {
      return decimales > 0 ? (signes.find((i) => brut[i] === sep) ?? -1) : -1;
    }
    if (decimales > 0) return memes[0];
    return memes.length === 1 && chiffresApres(brut, derniere) <= 2 ? derniere : -1;
  }
  // 1 bis. Une partie entière NULLE (« .500 », « 0.500 », « 0,5 » en anglais) ne porte aucun groupe
  //    de milliers : « 0 500 » n'est l'écriture d'aucun montant. En devise à décimales, le premier
  //    signe ouvre donc les décimales — sans quoi « .5 » → « 0.50 » → « 0.500 » tapé valait 500 €
  //    (TCK-574 repair-2). Le franc CFA garde ses règles : il n'a pas de décimales à ouvrir.
  //    ⚠ SAUF le séparateur de milliers de la locale suivi d'un groupe entier (trois chiffres ou
  //    plus) : c'est ce que laisse l'effacement du premier chiffre de « 1,500 » ou de « 1,500,000 »
  //    en anglais. Lu comme des décimales, « ,500 » valait 0,5 et la frappe suivante 2,050 au lieu
  //    de 2,500 — la correction que la règle 2 protège (vérification adverse de TCK-574).
  if (
    decimales > 0 &&
    !/[1-9]/.test(brut.slice(0, signes[0])) &&
    !(brut[signes[0]] === separateurDeMilliers(locale) && chiffresApres(brut, signes[0]) >= 3)
  ) {
    return signes[0];
  }
  if (brut[derniere] === separateurDeMilliers(locale)) return -1;
  if (memes.length > 1 && groupesDeTrois(brut, memes)) return -1;

  if (decimales > 0) {
    if (brut[derniere] === sep) return memes[0];
    return memes.length === 1 && chiffresApres(brut, derniere) <= 2 ? derniere : -1;
  }
  return chiffresApres(brut, derniere) <= 2 ? derniere : -1;
}

export type MontantSaisi = {
  /** Ce que le champ affiche : chiffres groupés, et la partie décimale en cours de frappe. */
  readonly affichage: string;
  /** Ce que le formulaire reçoit : un nombre, ou `undefined` pour un champ vide. */
  readonly valeur: number | undefined;
};

/**
 * Lit un texte tapé ou collé.
 *
 * Ce qui marque les décimales est décidé par `marqueDecimale` (ses règles sont écrites là).
 * Tout le reste — chiffres mis à part — est un séparateur de milliers, quel qu'il soit :
 * « 49.000.000 », « 49,000,000 », « 49 000 000 F CFA » valent tous 49 000 000.
 *
 * - **Devise sans décimales (XOF)** : des centimes collés en fin de montant (« 1 500,00 »)
 *   TOMBENT. Lus comme un groupe de plus, ils multipliaient le montant par 100 — une erreur
 *   d'ordre de grandeur sur un prix, que l'ancien `type="number"` refusait. Le franc CFA n'a pas
 *   de sous-unité : on les ignore plutôt que d'arrondir, et l'affichage réécrit aussitôt le
 *   montant retenu.
 * - **Devise à décimales** : la partie décimale est tronquée au nombre de décimales de la devise.
 *
 * L'affichage se réécrit à chaque frappe : une lecture inattendue se voit immédiatement, elle ne
 * part pas en silence. ⚠ Il reste des textes qu'aucune règle ne peut trancher — « 1,500 » collé
 * en euro sur un écran français vaut 1,50 €, parce que la virgule EST le séparateur décimal du
 * français ; c'est l'affichage qui le montre.
 */
export function lireSaisie(brut: string, decimales: number, locale: Locale): MontantSaisi {
  const sep = separateurDecimal(locale);
  const marque = marqueDecimale(brut, decimales, locale);
  const entier = marque < 0 ? brut : brut.slice(0, marque);
  const fraction =
    marque < 0 || decimales === 0 ? null : brut.slice(marque + 1).replace(/\D/g, '').slice(0, decimales);

  const chiffres = entier.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, CHIFFRES_ENTIERS_MAX);

  if (chiffres === '' && fraction === null) return { affichage: '', valeur: undefined };

  // Un point AMBIGU — l'autre signe que le séparateur décimal de la locale, seul de son espèce, au
  // plus deux chiffres derrière (règle 4) — reste tel qu'il a été tapé. Le réécrire en virgule
  // décidait AVANT le troisième chiffre qui l'aurait fait grouper : au clavier, « 1. » devenait
  // « 1, », et « 1.500 » tapé valait 1,50 € (revue adverse v2). Gardé, il se relit à l'identique à
  // la frappe suivante ; c'est le troisième chiffre, ou la sortie du champ (`ecrireMontant`), qui
  // tranche — et l'écran le montre alors dans la convention de la locale.
  // Derrière une partie entière nulle, le signe est déjà tranché (règle 1 bis) : aucun chiffre à
  // venir ne le fera grouper. Il est donc réécrit dans la convention de la locale — « ,5 » en
  // anglais s'affiche « 0.5 » —, et la frappe suivante ne peut plus le relire en milliers.
  const entiereNulle = chiffres === '' || chiffres === '0';
  const signe = fraction !== null && !entiereNulle && !brut.includes(sep) ? brut[marque] : sep;

  const partieEntiere = chiffres === '' ? '0' : chiffres;
  const groupe = formatNumber(Number(partieEntiere), locale, { maximumFractionDigits: 0 });
  return {
    affichage: fraction === null ? groupe : `${groupe}${signe}${fraction}`,
    valeur: Number(fraction ? `${partieEntiere}.${fraction}` : partieEntiere),
  };
}

/**
 * Ramène à un nombre une valeur du formulaire. Un brouillon enregistré avant TCK-564 porte le prix
 * en CHAÎNE (« 7000000 ») : c'est ce que rendait l'ancien `<input type="number">`.
 */
export function versMontant(valeur: unknown): number | undefined {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : undefined;
  if (typeof valeur === 'string' && valeur.trim() !== '') {
    const n = Number(valeur);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * L'affichage d'une valeur venue d'ailleurs que la frappe — brouillon repris, bien édité.
 *
 * ⚠ Jamais arrondi à la devise : un prix hérité à décimales en franc CFA, ou saisi en euros avant
 * de repasser la devise en XOF, s'afficherait « 1 501 » quand l'API recevrait 1500,5. Le champ
 * montre ce qui PART ; la prochaine frappe, elle, suit la règle de la devise (`lireSaisie`).
 */
export function ecrireMontant(valeur: unknown, decimales: number, locale: Locale): string {
  const n = versMontant(valeur);
  if (n === undefined) return '';
  return formatNumber(n, locale, { maximumFractionDigits: Math.max(decimales, 2) });
}

/**
 * Où replacer le curseur après réécriture : juste après le même nombre de CHIFFRES qu'avant.
 * Sans cela, un séparateur inséré par le groupement renverrait le curseur en fin de champ, et
 * corriger un chiffre au milieu d'un montant deviendrait impossible.
 */
export function positionApresReecriture(
  brut: string,
  curseur: number,
  affichage: string,
  locale: Locale,
): number {
  const avant = brut.slice(0, curseur);
  const chiffresTapes = avant.replace(/\D/g, '').length;
  let restants = chiffresTapes;
  let position = 0;
  while (position < affichage.length && restants > 0) {
    if (/\d/.test(affichage[position])) restants -= 1;
    position += 1;
  }
  // Le curseur suivait un séparateur décimal fraîchement tapé : il reste APRÈS lui — qu'il soit
  // celui de la locale ou le point ambigu gardé tel quel (`lireSaisie`).
  const sep = separateurDecimal(locale);
  const tape = avant[avant.length - 1];
  const estMarque = (c: string | undefined) => c === sep || c === tape;
  if (/[.,]$/.test(avant)) {
    // TCK-574 — « ,5 » : aucun chiffre tapé devant la marque, mais l'affichage porte le « 0 » que
    // `lireSaisie` insère (« 0, »). Aucun chiffre tapé ne le compte : sans ce pas, le curseur
    // restait DEVANT lui, et le « 5 » suivant faisait « 50, » — cinquante au lieu de 0,5.
    if (chiffresTapes === 0 && affichage[position] === '0' && estMarque(affichage[position + 1])) {
      position += 1;
    }
    if (estMarque(affichage[position])) position += 1;
  }
  return Math.min(position, affichage.length);
}
