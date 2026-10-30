#!/usr/bin/env node
/**
 * Garde : aucun numéro de téléphone plausible ni courriel dans les jeux d'évaluation du socle IA
 * (`takussan-api/resources/ai/evals/`) — TCK-2384, étendue aux numéros étrangers par TCK-2410.
 *
 * **Pourquoi.** Les cas viennent de vraies annonces corrigées (`ai:export-eval-cases`). L'export
 * anonymise, mais un cas écrit à la main, ou un format de numéro que l'anonymisation ne connaît
 * pas, ferait entrer une donnée personnelle dans le dépôt — d'où elle ne sort plus.
 *
 * **Ce qu'elle ne prouve pas.** L'absence d'un nom de personne : aucun motif ne le reconnaît. Un
 * courriel en `(dot)`. Un numéro étranger écrit sans indicatif ni zéro initial (`612345678`) : il ne se
 * distingue pas d'un nombre. Et **elle ne lit que les jeux d'évaluation**.
 *
 * **RÈGLE (TCK-2410) : aucun document du dépôt — ticket, plan, ADR, journal, commentaire, test, fixture,
 * jeu d'évaluation — ne cite un numéro relevé dans la réalité, même comme exemple d'un défaut.** Les
 * exemples sont des numéros manifestement fictifs : `+33612345678`, `+221771234567`, `06 12 34 56 78`,
 * `+1 202 555 0123`, `+44 7700 900123`. Une annonce réelle ne se cite pas : elle se décrit.
 * *Aucune garde ne la porte, et c'est un jugement mesuré, pas une paresse* (2026-10-29) : balayé sur
 * tout le dépôt, ce motif trouve 455 chaînes distinctes, presque toutes des numéros fictifs de tests ; ce
 * qui distingue un numéro fictif d'un numéro réel (`77 123 45 67`, `77 666 00 02`, `+221 78 000 11 22`) est
 * un jugement que ni le motif ni une heuristique (chiffres répétés, suite croissante) ne rendent sans
 * faux positif ni faux négatif — et le dépôt compte des centaines de numéros fictifs sénégalais sans
 * marque. Restreinte aux numéros étrangers, une heuristique passerait aujourd'hui, mais un numéro réel
 * contenant « 1234 » passerait aussi : une garde qui rassure sans prouver est pire que pas de garde. La
 * relecture d'un diff qui cite un numéro est donc humaine ; cette garde ne couvre que les jeux d'évaluation.
 *
 * **Le même ensemble que le masqueur** (TCK-2400, TCK-2410) : `TELEPHONE` est le motif de
 * `App\Support\PhoneMasker::MASK_PATTERN` (numéro sénégalais ou étranger), `COURRIEL` celui
 * d'`EvalCaseAnonymizer::EMAIL`, appliqués au texte normalisé de la même façon (chiffres pleine chasse
 * et arabes-indiens en ASCII, invisibles retirés). `takussan-api/tests/fixtures/ai/donnees-personnelles.json`
 * les éprouve des deux côtés : ses épreuves tournent ici à chaque exécution, et dans
 * `PhoneMaskerTest`/`EvalCaseAnonymizerTest`. Un prix suivi d'une marque monétaire (`750000000 FCFA`)
 * n'est pas un numéro sénégalais.
 *
 *   node scripts/check-ai-evals-pii.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = join(ROOT, 'takussan-api', 'resources', 'ai', 'evals');

// Les motifs sont ceux de `App\Support\PhoneMasker`, constante par constante : `[0-9]` et non `\d`, espaces
// énumérées et non `\s` (U+0085 : PCRE le compte, JavaScript non), pour que les deux lisent le même ensemble.
const WSI = String.raw`\u{09}-\u{0D}\u{20}\u{85}\u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}`;
const WS = `[${WSI}]`;
// Un séparateur : espace, point, barre oblique, tiret (`-`, demi-cadratin `–`, moins `−`…).
const SEP = String.raw`[${WSI}.\-/\u{2010}-\u{2015}\u{2212}]`;
// Préfixes : plan de numérotage national de l'ARTP, communication du 6.IX.2022 publiée par l'UIT le
// 3.X.2023, plus 71 sur décision du porteur (cf. PhoneMasker).
// Après l'indicatif : le `)` de `(+33)`, puis le `(0)` de trunk.
const APRES_CC = String.raw`\)?(?:${WS}?\(0\))?(?!${SEP}?[0-9]{0,3}(?:${SEP}[0-9]{3})*${SEP}000${SEP}000(?![0-9]))`;
const PREFIXE = '(?:3[02369]|7[0-25-9]|93)';
const PREFIXE_ESPACE = `(?:3${SEP}?[02369]|7${SEP}?[0-25-9]|9${SEP}?3)`;
const FIN = String.raw`(?![0-9])(?!${WS}*(?:f${WS}?cfa|cfa|xof|francs?|f)(?!\p{L}))`;
const SENEGAL = String.raw`(?<![0-9])(?:(?:\+|00)?221${SEP}?)?`
  + `(?:${PREFIXE}${SEP}?(?:[0-9]{3}${SEP}?[0-9]{2}${SEP}?[0-9]{2}|[0-9]{2}${SEP}?[0-9]{2}${SEP}?[0-9]{3})`
  + `|${PREFIXE}[0-9]${SEP}?[0-9]{2}${SEP}?[0-9]{2}${SEP}?[0-9]{2})`;
// Avec `+221` ou `00221` : neuf chiffres à groupement libre, et un `F` derrière n'en fait pas un prix.
const SENEGAL_AVEC_INDICATIF = String.raw`(?<![0-9])(?:\+${WS}{0,2}|00${WS}?)221${APRES_CC}${SEP}{0,3}${PREFIXE_ESPACE}(?:${SEP}{0,3}[0-9]){7}(?![0-9])`;
// Sans indicatif, séparé par des espaces : le préfixe d'un seul tenant et sept chiffres groupés comme on veut, ou,
// le préfixe espacé, les neuf chiffres un à un. Ni une date, ni trois zéros d'affilée (`750000 000`), ni
// deux groupes de mille en fin (`750 000 000`, `33 3 333 333` : le 3-3-3 y est compris), ni un chiffre isolé derrière la forme stricte
// (`7 1 2 3 4 5 6 7 8 9`), ni de tiret ni de barre (`30-31-32-33-4`, une liste).
const SENEGAL_LIBRE = `(?<![0-9])`
  + `(?![0-9]{2}${SEP}[0-9]{1,2}${SEP}[0-9]{4}(?![0-9]))`
  + `(?!(?:[0-9]${SEP}?){0,8}000)`
  + `(?:${PREFIXE}(?:${WS}{0,2}[0-9]){7}(?<!${WS}[0-9]{3}${WS}{1,2}[0-9]{3})`
  + `|(?:3${WS}[02369]|7${WS}[0-25-9]|9${WS}3)(?:${WS}[0-9]){7}(?!${WS}[0-9](?![0-9])))`;
// Avec `_` ou `,` (`77_123_45_67`, `77,123,45,67`) ou le préfixe entre parenthèses (`(77)1234567`) : le même
// séparateur partout, un groupement jamais en milliers (`75,000,000` n'en est pas un), rien derrière ni devant ;
// la virgule ne lit pas le 2-2-2-3 (`30,59,80,102`, des numéros de lignes).
const SENEGAL_SEPARE = String.raw`(?<![0-9])(?<![0-9][.,_])(?:`
  + String.raw`${PREFIXE}(?:(?<sep2>[_,])(?:[0-9]{3}\k<sep2>[0-9]{2}\k<sep2>[0-9]{2}|[0-9]{2}\k<sep2>[0-9]{3}\k<sep2>[0-9]{2})`
  + String.raw`|_[0-9]{2}_[0-9]{2}_[0-9]{3})(?![0-9])(?![,._][0-9])`
  + String.raw`|\(${PREFIXE}\)${WS}?(?:[0-9]{7}|[0-9]{3}${WS}?[0-9]{2}${WS}?[0-9]{2}`
  + String.raw`|[0-9]{2}${WS}?[0-9]{3}${WS}?[0-9]{2}|[0-9]{2}${WS}?[0-9]{2}${WS}?[0-9]{3})(?![0-9]))`;
// Numéros étrangers (TCK-2410) : `+` ou `00`, un indicatif ITU et le nombre de chiffres de son plan (la France
// à longueur exacte, d'abord), ou la forme nationale `0X XX XX XX XX`, collée ou séparée à chaque paire par le
// MÊME caractère (une date suivie d'une heure, `load averages: 44.07 87.79 75.17`, n'en sont pas). Les
// parenthèses ne sont admises qu'après l'indicatif : `(+33)`, `(0)`, `+1 (202)` ; `ADR-0064 (2026-10-14)`
// n'est pas un `00` + indicatif 64. Jamais un numéro qui finit par un groupe `000` séparé : `+ 250 000 000`
// est une somme. `+221` reste au motif sénégalais : `+221 74 …`, préfixe hors du plan, est le fictif d'évaluation.
const CC1 = '[17]';
const CC2 = '(?:2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])';
const CC3 = '(?:21[1-368]|22[02-9]|2[34][0-9]|25[0-8]|26[0-9]|29[01789]|35[0-9]|37[0-9]|38[0-35-79]|42[013]|50[0-9]|59[0-9]|6[78][0-9]|69[0-2]|85[02356]|880|886|96[0-8]|97[0-7]|99[2-8])';
// Le `+` d'un étage (`R+1`, `R+10`) n'est pas un indicatif (TCK-2428) : un `R` isolé, le `+`, un étage de 0 à 19 que
// rien ne colle derrière (aucun indicatif à deux ou trois chiffres ne commence par 1 : `R+44 7700 900123` est un numéro).
// Collé à un mot (`Tel+33`, `Mr+33`), suivi d'une espace ou d'un numéro collé (`R+33612345678`), il en reste un.
// TCK-2435 : aussi `RDC+1` et `R + 1`, `R +1`, `R+ 1` (au plus deux espaces de chaque côté du `+`), même étage de 0 à 19 ;
// `R + 33 6 12 34 56 78` et `RDC+33612345678` restent des numéros. Branches énumérées comme le lookbehind PCRE.
const MOT_ETAGE = String.raw`(?<=(?<!\p{L})r|(?<!\p{L})rdc`
  + String.raw`|(?<!\p{L})r${WS}|(?<!\p{L})rdc${WS}`
  + String.raw`|(?<!\p{L})r${WS}${WS}|(?<!\p{L})rdc${WS}${WS})`;
// Un étage `1` ou `7` n'en est plus un quand les dix chiffres d'un numéro complet de cet indicatif le suivent, sans
// marque monétaire derrière (`F. Diop` : un `F` suivi d'un point et d'une lettre est une initiale) : `au RDC\n+1 514 555 0199`, `R+1 202 555 0123` sont des numéros.
const RESTE_CC1 = String.raw`(?:${SEP}?\([0-9]{3}\)(?:${SEP}{0,3}[0-9]){7}|(?:${SEP}{0,3}[0-9]){10})(?![0-9])`
  + String.raw`(?!${WS}*(?:(?:f${WS}?cfa|cfa|xof|francs?)(?!\p{L})|f(?!\p{L}|\.${WS}*\p{L})))`;
// Derrière `1`, la forme nord-américaine `[2-9]XX [2-9]XX XXXX`, et derrière `7` dix chiffres commençant par 3 à 9
// (mobiles `9XX`, `7XX`, fixes `495`, `812`…), sont des numéros quelle que soit la marque qui suit
// (`au RDC +1 514 555 0199 F Diop`). TCK-2445 : derrière `7` aussi, la zone entre parenthèses (`RDC +7 (495) 123-45-67 F`).
const RESTE_NANP = String.raw`(?:${SEP}?\([2-9][0-9]{2}\)|${SEP}{0,3}[2-9](?:${SEP}{0,3}[0-9]){2})`
  + String.raw`${SEP}{0,3}[2-9](?:${SEP}{0,3}[0-9]){6}(?![0-9])`;
const RESTE_CC7 = String.raw`(?:${SEP}?\([3-9][0-9]{2}\)|${SEP}{0,3}[3-9](?:${SEP}{0,3}[0-9]){2})`
  + String.raw`(?:${SEP}{0,3}[0-9]){7}(?![0-9])`;
const NUMERO_CC1 = `(?:1(?:${RESTE_CC1}|${RESTE_NANP})|7(?:${RESTE_CC1}|${RESTE_CC7}))`;
const APRES_PLUS_ETAGE = String.raw`${WS}{0,2}(?:[02-689]|(?!${NUMERO_CC1})[17]|1[0-9])(?![0-9])`;
const PAS_UN_ETAGE = String.raw`(?!${MOT_ETAGE}\+${APRES_PLUS_ETAGE})`;
const CHIFFRES = (n) => `(?:${SEP}{0,3}[0-9]){${n}}`;
const ETRANGER = String.raw`(?:(?<![0-9+])(?<![0-9][.,])${PAS_UN_ETAGE}(?:\+(?!${WS}{1,2}[0-9]{1,3}(?:${SEP}[0-9]{3})*${SEP}000(?![0-9]))${WS}{0,2}|00${SEP}?)(?:`
  + `33${APRES_CC}${CHIFFRES(9)}`
  + String.raw`|${CC1}${APRES_CC}(?:${SEP}?\([0-9]{3}\)${CHIFFRES(7)}|${CHIFFRES(10)})`
  + `|${CC2}${APRES_CC}${CHIFFRES('7,11')}`
  + `|${CC3}${APRES_CC}${CHIFFRES('6,10')}`
  + `)(?<!${SEP}[0-9])`
  + String.raw`|(?<![0-9])0[1-9](?:[0-9]{8}|(?<sep>${SEP})[0-9]{2}(?:\k<sep>[0-9]{2}){3}))(?![0-9])`;
// Le lien WhatsApp canonique écrit le numéro sans `+` : `wa.me/…`, `…?phone=…`.
const LIEN = String.raw`(?<=wa\.me/|[?&]phone=)(?:33[0-9]{9}|${CC1}[0-9]{10}|${CC2}[0-9]{7,11}|${CC3}[0-9]{6,10})(?![0-9])`;
export const TELEPHONE = new RegExp(
  `(?:${SENEGAL_AVEC_INDICATIF}|${SENEGAL}${FIN}|${SENEGAL_LIBRE}${FIN}|${SENEGAL_SEPARE}|${ETRANGER}|${LIEN})`,
  'iu',
);
export const COURRIEL = /[a-z0-9._%+-]+(?:\s*[@\uFF20]\s*|\s*[([{]\s*at\s*[)\]}]\s*|\s+at\s+)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?![a-z])/iu;

const INVISIBLES = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;
const ZEROS = [
  0xff10, 0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6,
  0x0d66, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x17e0, 0x1810, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6,
];
// Le `+` et les séparateurs en pleine chasse ou en forme de petite capitale, un code point pour un.
const PONCTUATION = new Map([[0xff0b, '+'], [0xfe62, '+'], [0xff0d, '-'], [0xff0e, '.'], [0xff0f, '/']]);

/** Comme `PhoneMasker` : chiffres non ASCII et `+` pleine chasse ramenés à l'ASCII, caractères invisibles retirés. */
export function normaliser(texte) {
  let sortie = '';
  for (const c of texte.replace(INVISIBLES, '')) {
    const code = c.codePointAt(0);
    const zero = ZEROS.find((z) => code >= z && code <= z + 9);
    sortie += zero !== undefined ? String(code - zero) : (PONCTUATION.get(code) ?? c);
  }
  return sortie;
}

const FORMES = JSON.parse(readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'ai', 'donnees-personnelles.json'), 'utf8'));
const CAS_EPREUVE = [
  // Le troisième terme : le texte une fois le numéro remplacé par le jeton, comme le fait le masqueur
  // (un numéro qui n'est reconnu qu'en partie laisse des chiffres derrière lui).
  ...Object.values(FORMES.telephones).map((t) => [t, true, '[TELEPHONE]']),
  ...Object.values(FORMES.avec_contexte).map(([texte, masque]) => [texte, true, masque]),
  ...Object.values(FORMES.courriels).map((t) => [t, true]),
  ...Object.values(FORMES.pas_personnel).map((t) => [t, false]),
];

const trouver = (texte) => {
  const n = normaliser(texte);
  return n.match(TELEPHONE) ?? n.match(COURRIEL);
};

/** Chaque texte d'un JSON décodé — valeurs, clés, nombres — avec son chemin (`cases[0].input`). */
function textes(noeud, chemin = '') {
  if (typeof noeud === 'string') return [[chemin || '(racine)', 'valeur', noeud]];
  // Un nombre se lit comme son écriture : `771234567` est un numéro, pas une quantité.
  if (typeof noeud === 'number') return [[chemin || '(racine)', 'nombre', String(noeud)]];
  if (Array.isArray(noeud)) return noeud.flatMap((v, i) => textes(v, `${chemin}[${i}]`));
  if (noeud !== null && typeof noeud === 'object') {
    return Object.entries(noeud).flatMap(([k, v]) => {
      const sous = chemin ? `${chemin}.${k}` : k;
      return [[sous, 'clé', k], ...textes(v, sous)];
    });
  }
  return [];
}

/** Les lignes du texte brut : ce que `JSON.parse` jette (une clé en double) y reste lisible. */
function lignes(texte) {
  return texte.split('\n').flatMap((ligne, i) => {
    const trouve = trouver(ligne);
    return trouve ? [[`ligne ${i + 1}`, trouve[0]]] : [];
  });
}

/**
 * Un `.json` se lit décodé : `\u00a0`, `\u0040` ou `\/` y sont écrits en échappements que le motif
 * ne voit pas dans le texte brut, alors que la valeur, elle, est un vrai numéro ou un vrai courriel.
 * On y lit les valeurs, les clés et les nombres, PUIS le texte brut ligne à ligne : une clé en double
 * (`{"x":"77 123 45 67","x":"ok"}`) disparaît au décodage et n'existe plus que dans le brut.
 * Rend les trouvailles `chemin — « texte »`, sans doublon ; un JSON illisible est lui-même une erreur.
 */
export function verifierTexteJson(texte) {
  const trouvailles = [];
  const vues = new Set();
  const noter = (ou, trouve) => {
    if (vues.has(trouve)) return;
    vues.add(trouve);
    trouvailles.push(`${ou} — « ${trouve} »`);
  };
  try {
    for (const [chemin, genre, contenu] of textes(JSON.parse(texte))) {
      const trouve = trouver(contenu);
      if (trouve) noter(`${chemin} (${genre})`, trouve[0]);
    }
  } catch (e) {
    trouvailles.push(`JSON illisible : ${e.message}`);
  }
  for (const [ou, trouve] of lignes(texte)) noter(ou, trouve);
  return trouvailles;
}

const MASQUE = new RegExp(TELEPHONE.source, 'giu');
for (const [texte, attendu, masque] of CAS_EPREUVE) {
  if (masque !== undefined && normaliser(`Contact : ${texte}, merci`).replace(MASQUE, '[TELEPHONE]') !== `Contact : ${masque}, merci`) {
    console.error(`✗ épreuve : « ${texte} » devait être reconnu en entier (${masque})`);
    process.exit(1);
  }
  if ((trouver(`Contact : ${texte}, merci`) !== null) !== attendu) {
    console.error(`✗ épreuve : « ${texte} » devait rendre ${attendu}`);
    process.exit(1);
  }
}
// TCK-2435 : `F.` en fin de texte est la marque d'un prix derrière un étage ; suivi d'un nom, c'est une initiale.
if (trouver('Immeuble R+1 1 250 500 750 F.') !== null || trouver('RDC +7 495 123 45 67 F. Diop') === null) {
  console.error('✗ épreuve : un étage suivi d\'un prix en « F. » ou d\'un numéro suivi d\'une initiale');
  process.exit(1);
}
// Le JSON échappé : un numéro à espaces insécables et un courriel dont l'arobase est en `\u0040`.
const ECHAPPE = '{"input":"77\\u00a0123\\u202f45 67","e":"a\\u0040b.sn"}';
if (verifierTexteJson(ECHAPPE).length !== 2 || verifierTexteJson('{"input":"[TELEPHONE] [EMAIL]"}').length !== 0
  || verifierTexteJson('{pas du json').length !== 1) {
  console.error('✗ épreuve : la garde ne décode pas le JSON échappé');
  process.exit(1);
}
// Un nombre, une clé, un tableau de nombres, une clé en double : chacun doit être signalé, une fois.
const JSON_A_SIGNALER = [
  '{"expected":{"telephone":771234567}}', '{"x":[771234567]}', '{"x":"77 123 45 67","x":"ok"}', '{"a@b.sn":"x"}',
  // Un numéro étranger dans `expected` (TCK-2410), sous une clé personnelle ou dans un texte libre.
  '{"cases":[{"input":"x","expected":{"contact_telephone":"+33612345678"}}]}',
  '{"cases":[{"input":"x","expected":{"notes":"rappeler le 06.12.34.56.78"}}]}',
  '{"cases":[{"input":"x","expected":{"notes":"WhatsApp + 225 07 12 34 56 78"}}]}',
];
for (const doc of JSON_A_SIGNALER) {
  if (verifierTexteJson(doc).length !== 1) {
    console.error(`✗ épreuve : ${doc} devait être signalé une fois`);
    process.exit(1);
  }
}
if (verifierTexteJson('{"expected":{"prix":150000000,"n":3,"k":[1,2.5]}}').length !== 0
  || verifierTexteJson('{"expected":{"jour":"le 01/05/2026","ref":"TK-2026-AB12CD","somme":"250 000 + 1 000 000"}}').length !== 0) {
  console.error('✗ épreuve : un nombre qui n\'est pas un numéro ne doit pas être signalé');
  process.exit(1);
}

function fichiers(dossier) {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const erreurs = [];
const lus = fichiers(EVALS);
for (const fichier of lus) {
  const contenu = readFileSync(fichier, 'utf8');
  const rel = relative(ROOT, fichier);
  if (fichier.endsWith('.json')) {
    for (const trouve of verifierTexteJson(contenu)) erreurs.push(`${rel} → ${trouve}`);
    continue;
  }
  contenu.split('\n').forEach((ligne, i) => {
    const trouve = trouver(ligne);
    if (trouve) erreurs.push(`${rel}:${i + 1} — « ${trouve[0]} »`);
  });
}
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`✗ donnée personnelle dans un jeu d'évaluation : ${e}`);
  process.exit(1);
}
console.log(`✓ check-ai-evals-pii : ${lus.length} fichier(s) lus, aucun numéro ni courriel`);
