/**
 * ADR-0135 (TCK-2991) — le RELEVÉ des champs d'un fichier : ceux qui ouvrent un clavier, et leurs défauts.
 *
 * Un lecteur de balises JSX, sans dépendance (même choix que `i18n-scan.mjs`, ardoise D-55 : une garde qui
 * dépend de l'API du compilateur meurt à sa montée de version). Il lit la balise OUVRANTE de chaque champ —
 * accolades, chaînes et gabarits compris — et juge ses attributs écrits. Ce qu'il ne voit pas : un attribut
 * apporté par un objet étalé (`{...props}`), sauf `{...profil('…')}`, reconnu comme un profil.
 *
 * Les défauts :
 * - `sansProfil` : ni `profil=`, ni `{...profil(…)}` ;
 * - `sansPlaceholder` : ni `placeholder=` (ni `example=` pour `FormAmountInput`), hors mots de passe ;
 * - `nombre` : `type="number"` ;
 * - `reglage` : `inputMode`, `autoCorrect`, `autoCapitalize` ou `spellCheck` posé à côté d'un profil — ce sont
 *   les réglages que le profil décide.
 */

/**
 * Les balises jugées : les primitives, et les composants PARTAGÉS qui enveloppent un champ et transmettent le
 * profil et le placeholder de leur appelant (sans eux, leurs appels échapperaient à la garde). `PhoneInput` n'y
 * est pas : il pose son profil et son placeholder lui-même.
 */
const BALISES = [
  'FormAmountInput', 'FormTextarea', 'FormInput', 'ChampDeLaFiche', 'ZoneDeLaFiche', 'ChampChiffre',
  'Textarea', 'textarea', 'Input', 'input',
];
/** Celles dont le profil est fixé (ou a un défaut) par le composant : seul le placeholder s'y juge. */
const PROFIL_FIXE = new Set(['FormAmountInput', 'ZoneDeLaFiche']);

const TYPES_SANS_CLAVIER = new Set([
  'file', 'checkbox', 'radio', 'hidden', 'range', 'color', 'date', 'time', 'datetime-local', 'month', 'week',
  'submit', 'button', 'reset', 'image',
]);
const PROFILS_SANS_PLACEHOLDER = new Set(['mot-de-passe', 'nouveau-mot-de-passe']);
const REGLAGES = ['inputMode', 'autoCorrect', 'autoCapitalize', 'spellCheck'];

/** La fin de la balise ouvrante qui commence à `debut` (l'index après `>`), chaînes et accolades sautées. */
function finDeBalise(source, debut) {
  let profondeur = 0;
  for (let i = debut; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      // Une chaîne d'attribut (hors accolades) ou une chaîne JS (dans les accolades) : sautée d'un bloc.
      const fin = source.indexOf(c, i + 1);
      if (fin === -1) return source.length;
      i = fin;
    } else if (c === '{') profondeur++;
    else if (c === '}') profondeur--;
    else if (c === '>' && profondeur === 0) return i + 1;
    else if (c === '/' && source[i + 1] === '/' && profondeur > 0) {
      const fin = source.indexOf('\n', i);
      i = fin === -1 ? source.length : fin;
    }
  }
  return source.length;
}

/** La valeur LITTÉRALE d'un attribut (`nom="x"` ou `nom={'x'}`), `null` si absente ou calculée. */
function valeurLitterale(balise, nom) {
  const m = new RegExp(`\\s${nom}=(?:"([^"]*)"|'([^']*)'|\\{\\s*['"]([^'"]*)['"]\\s*\\})`).exec(balise);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}
const aAttribut = (balise, nom) => new RegExp(`\\s${nom}(?=[\\s=/>])`).test(balise);

/**
 * Les commentaires effacés (blocs, JSX compris, et fins de ligne), sauts de ligne gardés : un `<input>` cité dans
 * un commentaire n'est pas un champ, et les numéros de ligne restent justes. Une URL (`https://`) n'est pas un
 * commentaire.
 */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (_, avant) => avant);
}

/**
 * Les champs d'une source. Chacun : `{ ligne, balise, defauts: string[] }` ; les champs sans clavier (case,
 * fichier, date…, lecture seule) ne sont pas rendus.
 */
export function relever(brut) {
  const source = sansCommentaires(brut);
  const champs = [];
  const motif = new RegExp(`<(${BALISES.join('|')})(?=[\\s/>])`, 'g');
  let m;
  while ((m = motif.exec(source))) {
    const nom = m[1];
    const balise = source.slice(m.index, finDeBalise(source, m.index + m[0].length));
    const type = valeurLitterale(balise, 'type');
    if (type !== null && TYPES_SANS_CLAVIER.has(type)) continue;
    if (/\sreadOnly(?=[\s/>])|\sreadOnly=\{\s*true\s*\}/.test(balise)) continue;

    const profilEcrit = valeurLitterale(balise, 'profil');
    const aUnProfil = PROFIL_FIXE.has(nom) || aAttribut(balise, 'profil') || /\{\s*\.\.\.\s*profil\(/.test(balise);
    const profilEtale = /\{\s*\.\.\.\s*profil\(\s*['"]([^'"]+)['"]/.exec(balise)?.[1] ?? null;
    const nomDuProfil = profilEcrit ?? profilEtale;
    const motDePasse = type === 'password' || (nomDuProfil !== null && PROFILS_SANS_PLACEHOLDER.has(nomDuProfil));

    const defauts = [];
    if (!aUnProfil) defauts.push('sansProfil');
    if (!motDePasse && !aAttribut(balise, 'placeholder') && !(nom === 'FormAmountInput' && aAttribut(balise, 'example'))) {
      defauts.push('sansPlaceholder');
    }
    if (type === 'number') defauts.push('nombre');
    if (aUnProfil && !PROFIL_FIXE.has(nom) && REGLAGES.some((r) => aAttribut(balise, r))) defauts.push('reglage');

    champs.push({ ligne: source.slice(0, m.index).split('\n').length, balise: nom, defauts });
  }
  return champs;
}

export const DEFAUTS = ['sansProfil', 'sansPlaceholder', 'nombre', 'reglage'];

/** Le compte des défauts d'une source, par défaut ; `null` si elle n'en a aucun. */
export function compter(source) {
  const compte = Object.fromEntries(DEFAUTS.map((d) => [d, 0]));
  let total = 0;
  for (const champ of relever(source)) {
    for (const d of champ.defauts) {
      compte[d]++;
      total++;
    }
  }
  return total === 0 ? null : compte;
}
