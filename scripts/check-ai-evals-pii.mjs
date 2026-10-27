#!/usr/bin/env node
/**
 * Garde : aucun numéro sénégalais plausible ni courriel dans les jeux d'évaluation du socle IA
 * (`takussan-api/resources/ai/evals/`) — TCK-2384.
 *
 * **Pourquoi.** Les cas viennent de vraies annonces corrigées (`ai:export-eval-cases`). L'export
 * anonymise, mais un cas écrit à la main, ou un format de numéro que l'anonymisation ne connaît
 * pas, ferait entrer une donnée personnelle dans le dépôt — d'où elle ne sort plus.
 *
 * **Ce qu'elle ne prouve pas.** L'absence d'un nom de personne : aucun motif ne le reconnaît. Et
 * les formats qu'elle ne connaît pas : numéros étrangers, courriel en `(dot)`.
 *
 * **Le même ensemble que le masqueur** (TCK-2400) : `TELEPHONE` est le motif de
 * `App\Support\PhoneMasker::PATTERN`, `COURRIEL` celui d'`EvalCaseAnonymizer::EMAIL`, appliqués au
 * texte normalisé de la même façon (chiffres pleine chasse et arabes-indiens en ASCII, invisibles
 * retirés). `takussan-api/tests/fixtures/ai/donnees-personnelles.json` les éprouve des deux côtés :
 * ses épreuves tournent ici à chaque exécution, et dans `PhoneMaskerTest`/`EvalCaseAnonymizerTest`.
 * Un prix suivi d'une marque monétaire (`750000000 FCFA`) n'est pas un numéro.
 *
 *   node scripts/check-ai-evals-pii.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = join(ROOT, 'takussan-api', 'resources', 'ai', 'evals');

// Préfixes : plan de numérotage national de l'ARTP, communication du 6.IX.2022 publiée par l'UIT le
// 3.X.2023, plus 71 sur décision du porteur (cf. PhoneMasker). `\s` couvre déjà U+00A0 et U+202F
// (espaces insécables).
const SEP = '[\\s.\\-/]';
const PREFIXE = '(?:3[02369]|7[0-25-9]|93)';
export const TELEPHONE = new RegExp(
  `(?<!\\d)(?:(?:\\+|00)?221${SEP}?)?`
  + `(?:${PREFIXE}${SEP}?(?:\\d{3}${SEP}?\\d{2}${SEP}?\\d{2}|\\d{2}${SEP}?\\d{2}${SEP}?\\d{3})`
  + `|${PREFIXE}\\d${SEP}?\\d{2}${SEP}?\\d{2}${SEP}?\\d{2})`
  + '(?!\\d)(?!\\s*(?:f\\s?cfa|cfa|xof|francs?|f)(?!\\p{L}))',
  'iu',
);
export const COURRIEL = /[a-z0-9._%+-]+(?:\s*[@\uFF20]\s*|\s*[([{]\s*at\s*[)\]}]\s*|\s+at\s+)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?![a-z])/iu;

const INVISIBLES = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;
const ZEROS = [0xff10, 0x0660, 0x06f0];

/** Comme `PhoneMasker` : chiffres non ASCII ramenés à 0-9, caractères invisibles retirés. */
export function normaliser(texte) {
  let sortie = '';
  for (const c of texte.replace(INVISIBLES, '')) {
    const code = c.codePointAt(0);
    const zero = ZEROS.find((z) => code >= z && code <= z + 9);
    sortie += zero === undefined ? c : String(code - zero);
  }
  return sortie;
}

const FORMES = JSON.parse(readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'ai', 'donnees-personnelles.json'), 'utf8'));
const CAS_EPREUVE = [
  ...Object.values(FORMES.telephones).map((t) => [t, true]),
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

for (const [texte, attendu] of CAS_EPREUVE) {
  if ((trouver(`Contact : ${texte}, merci`) !== null) !== attendu) {
    console.error(`✗ épreuve : « ${texte} » devait rendre ${attendu}`);
    process.exit(1);
  }
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
];
for (const doc of JSON_A_SIGNALER) {
  if (verifierTexteJson(doc).length !== 1) {
    console.error(`✗ épreuve : ${doc} devait être signalé une fois`);
    process.exit(1);
  }
}
if (verifierTexteJson('{"expected":{"prix":150000000,"n":3,"k":[1,2.5]}}').length !== 0) {
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
