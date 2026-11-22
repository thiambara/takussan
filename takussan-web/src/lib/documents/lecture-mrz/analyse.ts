/**
 * TCK-2899 — lire la date d'expiration dans la bande MRZ d'une pièce d'identité (ICAO 9303).
 *
 * L'analyseur ne lit que le texte rendu par le moteur d'OCR (`moteur.ts`) ; il ne voit jamais l'image.
 * Il s'ancre sur le bloc commun aux deux formats que le coffre lit :
 *
 *   naissance (AAMMJJ) · clé · sexe · expiration (AAMMJJ) · clé
 *
 * — colonne 0 de la deuxième ligne d'une carte (TD1, 3 × 30 : carte CEDEAO), colonne 13 de la deuxième
 * ligne d'un passeport (TD3, 2 × 44). Il ne dépend pas des `<` de remplissage, que le modèle `eng` lit
 * le plus mal : il cherche le bloc où qu'il soit dans la ligne.
 *
 * **Seule une date dont les DEUX clés de contrôle tombent juste est rendue** (naissance et expiration) :
 * une clé seule laisse une chance sur dix à une lecture fausse. Une lecture douteuse ne rend rien.
 */

export type FormatMrz = 'TD1' | 'TD3';

export interface DateLueDansLaMrz {
  readonly format: FormatMrz;
  /** `AAAA-MM-JJ`. */
  readonly expiration: string;
}

const POIDS = [7, 3, 1] as const;

/** La valeur d'un caractère MRZ dans le calcul de la clé : chiffre, lettre (A = 10), `<` = 0. */
function valeur(c: string): number {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  return 0;
}

/** La clé de contrôle ICAO 9303 d'un champ : somme pondérée 7-3-1, modulo 10. */
export function cleDeControle(champ: string): number {
  let somme = 0;
  for (let i = 0; i < champ.length; i++) somme += valeur(champ[i]) * POIDS[i % 3];
  return somme % 10;
}

/**
 * Les confusions d'OCR d'une lettre lue à la place d'un chiffre. Appliquées aux SEULES positions
 * numériques du bloc ; les deux clés de contrôle jugent ensuite la correction.
 */
const CHIFFRE_LU_COMME: Readonly<Record<string, string>> = {
  O: '0', D: '0', Q: '0', U: '0',
  I: '1', L: '1', T: '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
};

function chiffres(s: string): string | null {
  let rendu = '';
  for (const c of s) {
    if (c >= '0' && c <= '9') rendu += c;
    else if (CHIFFRE_LU_COMME[c]) rendu += CHIFFRE_LU_COMME[c];
    else return null;
  }
  return rendu;
}

const SEXES = new Set(['M', 'F', 'X', '<']);

/** Le jour existe-t-il ? Le 29 février est admis quel que soit le siècle (l'année n'a que deux chiffres). */
function jourValide(mois: number, jour: number): boolean {
  if (mois < 1 || mois > 12 || jour < 1) return false;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
  return jour <= max;
}

/**
 * Le siècle d'une date d'expiration à deux chiffres : 20AA, sauf si elle tomberait à plus de cinquante
 * ans de l'année de référence (une pièce expirée en 1998 s'écrit `98`).
 */
function anneeDExpiration(aa: number, anneeDeReference: number): number {
  const annee = 2000 + aa;
  return annee > anneeDeReference + 50 ? annee - 100 : annee;
}

function nettoyer(ligne: string): string {
  return ligne.toUpperCase().replace(/[\s«»]/g, '').replace(/[^A-Z0-9<]/g, '<');
}

/**
 * Cherche le bloc dans une ligne nettoyée ; rend la date si les deux clés tombent juste.
 * Le format se déduit de la longueur de la ligne (30 en TD1, 44 en TD3) : il n'informe que le test.
 */
function lireLaLigne(ligne: string, anneeDeReference: number): DateLueDansLaMrz | null {
  for (let i = 0; i + 15 <= ligne.length; i++) {
    const naissance = chiffres(ligne.slice(i, i + 6));
    const cleNaissance = chiffres(ligne[i + 6]);
    const sexe = ligne[i + 7];
    const expiration = chiffres(ligne.slice(i + 8, i + 14));
    const cleExpiration = chiffres(ligne[i + 14]);
    if (!naissance || !cleNaissance || !expiration || !cleExpiration || !SEXES.has(sexe)) continue;
    if (cleDeControle(naissance) !== Number(cleNaissance)) continue;
    if (cleDeControle(expiration) !== Number(cleExpiration)) continue;
    const [nm, nj] = [Number(naissance.slice(2, 4)), Number(naissance.slice(4, 6))];
    const [aa, mm, jj] = [Number(expiration.slice(0, 2)), Number(expiration.slice(2, 4)), Number(expiration.slice(4, 6))];
    if (!jourValide(nm, nj) || !jourValide(mm, jj)) continue;
    const annee = anneeDExpiration(aa, anneeDeReference);
    if (mm === 2 && jj === 29 && !(annee % 4 === 0 && (annee % 100 !== 0 || annee % 400 === 0))) continue;
    const format: FormatMrz = ligne.length >= 40 ? 'TD3' : 'TD1';
    return { format, expiration: `${annee}-${expiration.slice(2, 4)}-${expiration.slice(4, 6)}` };
  }
  return null;
}

/**
 * La date d'expiration lue dans le texte d'une MRZ (une ou plusieurs lignes, du bruit autour admis),
 * ou `null` si aucun bloc ne passe ses deux clés de contrôle.
 */
export function lireLaDateDansLaMrz(texte: string, anneeDeReference = new Date().getFullYear()): DateLueDansLaMrz | null {
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = nettoyer(brute);
    if (ligne.length < 15) continue;
    const lue = lireLaLigne(ligne, anneeDeReference);
    if (lue) return lue;
  }
  return null;
}
