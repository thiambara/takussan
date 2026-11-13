/**
 * TCK-2714 (décision n° 11 (a) du porteur, validée le 2026-11-11) — LE séparateur des groupes de
 * milliers, et le seul endroit qui le pose.
 *
 * `Intl` en `fr-SN` (et `fr-FR`, `fr-CM`) sépare les groupes par l'espace FINE insécable U+202F. DM
 * Sans la dessine à 0,133 em — 1,7 px à 13 px, sous des chiffres tabulaires : au téléphone,
 * « 1 482 166 » se lisait « 1482166 » (relevé de TCK-2580). Les groupes sortent donc en espace
 * insécable de pleine largeur, U+00A0 (0,266 em) : la largeur des maquettes, des PDF et des CSV de
 * l'API, et toujours insécable — un montant ne se coupe jamais en fin de ligne.
 *
 * ⚠ Seules les parties `group` d'`Intl` changent (`formatToParts`), jamais une chaîne entière : l'espace
 * avant « % » (U+00A0 d'ICU), celle d'une notation compacte (« 3,9 M ») et celle qu'un appelant pose
 * avant un symbole gardent leur caractère. Une virgule ou un point de groupe (`en-GB`, `en-US`) ne
 * bouge pas.
 *
 * Tout formatage de nombre ou de montant de `lib/format` passe par {@link formaterGroupesLisibles}.
 */

/** L'espace qui sépare les groupes de milliers à l'affichage. */
export const ESPACE_DE_GROUPE = '\u00a0';

/** Une espace qui groupe (U+202F, U+00A0, U+0020…) : ce qu'on remplace. Une virgule ou un point, non. */
const ESPACE = /^\s$/u;

/**
 * Ce qu'on demande au formateur : ses parties. Un type STRUCTUREL, et non le constructeur nommé comme
 * type — `scripts/check-locale-figee.mjs` (contrôle D) lit un constructeur `Intl` qui n'est ni appelé
 * ni suivi d'un point comme un alias, et refuse l'alias.
 */
interface FormateurDeNombre {
  formatToParts(valeur: number | bigint | `${number}`): Intl.NumberFormatPart[];
}

/**
 * `format.format(valeur)`, les groupes de milliers séparés par {@link ESPACE_DE_GROUPE}.
 *
 * Accepte une chaîne décimale comme `Intl` (les montants exacts de l'IA, `montant-ia.ts`).
 */
export function formaterGroupesLisibles(format: FormateurDeNombre, valeur: number | bigint | `${number}`): string {
  return format
    .formatToParts(valeur)
    .map((partie) => (partie.type === 'group' && ESPACE.test(partie.value) ? ESPACE_DE_GROUPE : partie.value))
    .join('');
}
