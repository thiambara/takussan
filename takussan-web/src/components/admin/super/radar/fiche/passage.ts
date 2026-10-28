/**
 * TCK-2387 (ADR-0077) — retrouver, dans le texte source d'une annonce, le passage que le modèle cite
 * comme preuve d'un champ (`evidence`).
 *
 * Le modèle ne recopie pas toujours au caractère près : il normalise les blancs (un saut de ligne
 * devient une espace), la casse, et change les apostrophes et les guillemets. La comparaison se fait
 * donc sur un texte REPLIÉ, et une table rend chaque caractère replié à sa position dans l'original,
 * pour que le `<mark>` entoure le texte tel que l'opérateur le lit.
 *
 * Repli : casse, blancs (suites réduites à une espace), apostrophes et guillemets (ignorés : `d'angle`
 * et `d’angle` se valent, `« vue mer »` et `"vue mer"` aussi). Les accents sont gardés d'abord ; à
 * défaut de trouver le passage, une seconde passe les ignore des deux côtés — le modèle en perd
 * parfois, et l'API (`ExtractionNormalizer::inSource`) fait le même repli : un passage qu'elle dit
 * présent doit pouvoir se montrer.
 */

export interface PassageLocalise {
  /** Indice (inclus) du premier caractère du passage dans le texte d'origine. */
  readonly debut: number;
  /** Indice (exclu) de fin du passage dans le texte d'origine. */
  readonly fin: number;
}

const APOSTROPHES_ET_GUILLEMETS = /['"`´‘’‚‛′ʼ“”„‟″«»‹›]/u;
const BLANC = /\s/u;

interface Replie {
  readonly texte: string;
  /** `debuts[i]` : indice d'origine du caractère replié `i`. */
  readonly debuts: readonly number[];
  /** `fins[i]` : indice d'origine où ce caractère replié cesse (exclu). */
  readonly fins: readonly number[];
}

function replier(texte: string, sansAccents = false): Replie {
  let replie = '';
  const debuts: number[] = [];
  const fins: number[] = [];
  let indice = 0;
  for (const caractere of texte) {
    const debut = indice;
    indice += caractere.length;
    if (APOSTROPHES_ET_GUILLEMETS.test(caractere)) continue;
    if (BLANC.test(caractere)) {
      // Une suite de blancs ne compte que pour une espace, dont la fin s'étend sur toute la suite.
      if (replie.endsWith(' ')) {
        fins[fins.length - 1] = indice;
        continue;
      }
      replie += ' ';
      debuts.push(debut);
      fins.push(indice);
      continue;
    }
    // `toLowerCase` peut allonger un caractère (`İ`) : chaque caractère produit pointe vers l'original.
    const base = sansAccents ? caractere.normalize('NFD').replace(/\p{M}/gu, '') : caractere;
    for (const minuscule of base.toLowerCase()) {
      replie += minuscule;
      for (let i = 0; i < minuscule.length; i += 1) {
        debuts.push(debut);
        fins.push(indice);
      }
    }
  }
  return { texte: replie, debuts, fins };
}

/** Les segments d'un passage coupé par « … » (ou « ... »), repliés, sans espace de bord ni segment vide. */
function segments(passage: string, sansAccents: boolean): string[] {
  return passage
    .split(/…|\.{3,}/u)
    .map((segment) => replier(segment, sansAccents).texte.trim())
    .filter((segment) => segment !== '');
}

function chercher(source: string, passage: string, sansAccents: boolean): PassageLocalise | null {
  const morceaux = segments(passage, sansAccents);
  if (morceaux.length === 0) return null;

  const { texte, debuts, fins } = replier(source, sansAccents);
  let curseur = 0;
  let debut = -1;
  let fin = -1;
  for (const morceau of morceaux) {
    const trouve = texte.indexOf(morceau, curseur);
    if (trouve === -1) return null;
    const dernier = trouve + morceau.length - 1;
    if (debut === -1) debut = debuts[trouve];
    fin = fins[dernier];
    curseur = dernier + 1;
  }
  return { debut, fin };
}

/**
 * Localise `passage` dans `source` ; `null` s'il est introuvable. Un passage coupé par « … » se
 * localise du début de son premier segment à la fin de son dernier, chaque segment étant cherché après
 * la fin du précédent.
 */
export function localiserPassage(source: string, passage: string): PassageLocalise | null {
  return chercher(source, passage, false) ?? chercher(source, passage, true);
}
