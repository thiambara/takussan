#!/usr/bin/env node
/**
 * Garde : chaque paramètre et chaque drapeau que la console plateforme édite a un LECTEUR
 * (TCK-600, AC15).
 *
 * **Pourquoi elle existe.** Six des neuf paramètres de `EditablePlatformSettings` (`format.*`,
 * `platform.timezone_default`, `transaction.platform_fee_*`, `platform.max_upload_mb`) et les trois
 * drapeaux de `Flag` se modifiaient dans la console, se journalisaient comme des actions sensibles,
 * et ne pilotaient rien : aucun code ne les lisait. Un opérateur qui baissait la commission ne
 * changeait aucune commission. Rien ne rougissait — un réglage sans lecteur ne lève aucune erreur.
 *
 * **Ce qu'est « lu ».** Commentaires retirés, hors du catalogue, de son éditeur et des tests :
 *
 *   · un paramètre `a.b` : `getValue('a.b')` dans `takussan-api/app/` ;
 *   · un drapeau `x` (cas `Flag::X = 'x'`) : `isEnabled('x'` ou `Flag::X` dans `takussan-api/app/`,
 *     ou `useFeatureFlag('x')` dans `takussan-web/src/`.
 *
 * Le catalogue des drapeaux peut être VIDE (il l'est depuis TCK-600) : c'est un état légitime. Celui
 * des paramètres ne l'est pas — une lecture vide y fait échouer la garde plutôt que de passer.
 *
 * ## Ce qu'elle NE prouve PAS
 *
 *   · « Lu » ne veut pas dire « bien lu » : un `getValue('a.b')` dans une branche morte compte.
 *   · Une clé rangée dans une variable puis lue par `getValue($cle)` lui échappe : faux rouge, qui se
 *     corrige en écrivant la lecture littérale.
 *
 * ## Ses propres tests
 *
 * `CAS_EPREUVE` tourne à chaque invocation sur des arbres figés : une clé citée dans un docblock ou
 * par son éditeur ne compte pas ; `getValue`, `isEnabled`, `Flag::X` et `useFeatureFlag` comptent.
 * `CAS_EPREUVE_CATALOGUE` éprouve la lecture du catalogue : une clé à chiffre est lue, une clé hors
 * motif est comptée comme entrée (et fait donc échouer la comparaison des deux comptes).
 * Une garde dont le motif régresse sort en 1 sur elle-même.
 *
 * Usage :
 *   node scripts/check-platform-catalogue-readers.mjs            # garde
 *   node scripts/check-platform-catalogue-readers.mjs --report   # + le lecteur de chaque entrée
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const SETTINGS = 'takussan-api/app/Domain/Settings/EditablePlatformSettings.php';
const FLAGS = 'takussan-api/app/Domain/Features/Flag.php';
/** L'éditeur écrit les clés (normalisation, règles) : il ne les lit pas pour piloter quoi que ce soit. */
const EDITEURS = [SETTINGS, FLAGS, 'takussan-api/app/Services/Admin/PlatformSettingService.php'];

/** Plancher de plausibilité du balayage, bien sous le compte réel (~1 900 fichiers). */
const PLANCHER_FICHIERS = 500;

/**
 * Commentaires `//`, `/* … *\/` (et `#` en PHP) blanchis ; les chaînes sont gardées telles quelles.
 * En TypeScript, `#` ouvre un champ privé, pas un commentaire.
 */
function sansCommentaires(src, php = true) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blanc = (t) => t.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && d === '*') {
      const fin = src.indexOf('*/', i + 2);
      const j = fin === -1 ? n : fin + 2;
      out += blanc(src.slice(i, j));
      i = j;
    } else if ((c === '/' && d === '/') || (php && c === '#' && d !== '[')) {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      out += blanc(src.slice(i, j));
      i = j;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/**
 * Les clés du tableau rendu par `all()` : les entrées de premier niveau `'a.b' => [`. Rend aussi le
 * nombre d'entrées de premier niveau QUELLE QUE SOIT leur clé : une clé qui sortirait du motif
 * (majuscule, tiret…) serait sinon ignorée en silence — verif-600 m4, où `platform.max_upload_mb2`
 * passait inaperçue quand le motif excluait les chiffres.
 */
function clesDuCatalogue(src) {
  const corps = /function\s+all\s*\(\)[\s\S]*?return\s*\[([\s\S]*?)\n\s{8}\];/.exec(sansCommentaires(src));
  if (!corps) return null;
  return {
    cles: [...corps[1].matchAll(/^\s{12}'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'\s*=>\s*\[/gm)].map((m) => m[1]),
    entrees: [...corps[1].matchAll(/^\s{12}'[^']*'\s*=>\s*\[/gm)].length,
  };
}

/** Un catalogue figé : le corps de `all()` tel que le PHP l'écrit (indentation à 8 et 12). */
const catalogue = (...cles) =>
  `public static function all(): array\n    {\n        return [\n${cles.map((c) => `            '${c}' => [\n                'type' => 'int',\n            ],`).join('\n')}\n        ];\n    }`;

const CAS_EPREUVE_CATALOGUE = [
  { nom: 'clé portant un chiffre', src: catalogue('a.b', 'platform.max_upload_mb2'), cles: ['a.b', 'platform.max_upload_mb2'], entrees: 2 },
  { nom: 'clé hors motif comptée comme entrée', src: catalogue('a.b', 'Platform.Max'), cles: ['a.b'], entrees: 2 },
];

/** `{ NomDuCas: 'valeur' }` depuis le source de l'enum `Flag`. */
function casDesDrapeaux(src) {
  const cas = {};
  for (const m of sansCommentaires(src).matchAll(/\bcase\s+(\w+)\s*=\s*'([a-z0-9_.]+)'\s*;/g)) cas[m[1]] = m[2];
  return cas;
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Le premier lecteur de chaque entrée dans un arbre `{ chemin: source }` (chemins relatifs à la
 * racine du dépôt). Rend `Map<entrée, chemin>`.
 */
function lecteurs(arbre, cles, drapeaux) {
  const lus = new Map();
  for (const [chemin, brut] of Object.entries(arbre)) {
    if (EDITEURS.includes(chemin)) continue;
    const api = chemin.startsWith('takussan-api/app/');
    const src = sansCommentaires(brut, chemin.endsWith('.php'));
    const web = chemin.startsWith('takussan-web/src/');
    for (const cle of cles) {
      if (!lus.has(`parametre:${cle}`) && api && new RegExp(`getValue\\(\\s*'${echapper(cle)}'`).test(src)) {
        lus.set(`parametre:${cle}`, chemin);
      }
    }
    for (const [nom, valeur] of Object.entries(drapeaux)) {
      const id = `drapeau:${valeur}`;
      if (lus.has(id)) continue;
      const v = echapper(valeur);
      const parLApi = api && (new RegExp(`isEnabled\\(\\s*'${v}'`).test(src) || new RegExp(`\\bFlag::${nom}\\b`).test(src));
      const parLeFront = web && new RegExp(`useFeatureFlag\\(\\s*['"]${v}['"]`).test(src);
      if (parLApi || parLeFront) lus.set(id, chemin);
    }
  }
  return lus;
}

function sansLecteur(arbre, cles, drapeaux) {
  const lus = lecteurs(arbre, cles, drapeaux);
  return [
    ...cles.filter((c) => !lus.has(`parametre:${c}`)).map((c) => `parametre:${c}`),
    ...Object.values(drapeaux).filter((v) => !lus.has(`drapeau:${v}`)).map((v) => `drapeau:${v}`),
  ];
}

const CAS_EPREUVE = [
  {
    nom: 'clé citée seulement dans un docblock',
    arbre: { 'takussan-api/app/A.php': "/** getValue('a.b') */ class A {}" },
    attendu: ['parametre:a.b'],
  },
  {
    nom: "clé normalisée par l'éditeur seulement",
    arbre: { 'takussan-api/app/Services/Admin/PlatformSettingService.php': "$x = $s->getValue('a.b');" },
    attendu: ['parametre:a.b'],
  },
  {
    nom: 'clé lue dans un test seulement',
    arbre: { 'takussan-api/tests/ATest.php': "$s->getValue('a.b');" },
    attendu: ['parametre:a.b'],
  },
  { nom: 'clé lue par getValue', arbre: { 'takussan-api/app/A.php': "$s->getValue('a.b');" }, attendu: [] },
  {
    nom: 'drapeau sans lecteur',
    arbre: { 'takussan-api/app/A.php': "// Feature::isEnabled('x')" },
    drapeaux: { X: 'x' },
    attendu: ['drapeau:x'],
  },
  { nom: 'drapeau lu par isEnabled', arbre: { 'takussan-api/app/A.php': "Feature::isEnabled('x');" }, drapeaux: { X: 'x' }, attendu: [] },
  { nom: 'drapeau lu par Flag::X', arbre: { 'takussan-api/app/A.php': 'f(Flag::X);' }, drapeaux: { X: 'x' }, attendu: [] },
  {
    nom: 'drapeau lu par le front',
    arbre: { 'takussan-web/src/a.tsx': "const on = useFeatureFlag('x');" },
    drapeaux: { X: 'x' },
    attendu: [],
  },
];

let rouge = false;
for (const cas of CAS_EPREUVE_CATALOGUE) {
  const lu = clesDuCatalogue(cas.src);
  if (JSON.stringify(lu) !== JSON.stringify({ cles: cas.cles, entrees: cas.entrees })) {
    console.error(`✗ auto-épreuve « ${cas.nom} » : attendu ${JSON.stringify({ cles: cas.cles, entrees: cas.entrees })}, obtenu ${JSON.stringify(lu)}`);
    rouge = true;
  }
}
for (const cas of CAS_EPREUVE) {
  const cles = cas.drapeaux ? [] : ['a.b'];
  const obtenu = sansLecteur(cas.arbre, cles, cas.drapeaux ?? {});
  if (JSON.stringify(obtenu) !== JSON.stringify(cas.attendu)) {
    console.error(`✗ auto-épreuve « ${cas.nom} » : attendu ${JSON.stringify(cas.attendu)}, obtenu ${JSON.stringify(obtenu)}`);
    rouge = true;
  }
}
if (rouge) process.exit(1);

for (const chemin of [SETTINGS, FLAGS]) {
  if (!existsSync(join(ROOT, chemin))) {
    console.error(`✗ ${chemin} est introuvable — la garde ne peut rien vérifier.`);
    process.exit(1);
  }
}

const lu = clesDuCatalogue(readFileSync(join(ROOT, SETTINGS), 'utf8'));
if (!lu || lu.cles.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié.
  console.error(`✗ aucune clé lue dans ${SETTINGS} — la garde n'aurait rien vérifié.`);
  process.exit(1);
}
if (lu.cles.length !== lu.entrees) {
  console.error(
    `✗ ${lu.entrees} entrée(s) de premier niveau dans ${SETTINGS}, ${lu.cles.length} clé(s) reconnue(s) : une clé hors du motif \`[a-z0-9_.]\` échapperait à la garde.`,
  );
  process.exit(1);
}
const cles = lu.cles;
const drapeaux = casDesDrapeaux(readFileSync(join(ROOT, FLAGS), 'utf8'));

function balayer(dossier, garder, arbre = {}) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === 'node_modules' || entree.name === '__tests__') continue;
      balayer(chemin, garder, arbre);
    } else if (garder(entree.name)) {
      arbre[relative(ROOT, chemin).split(sep).join('/')] = readFileSync(chemin, 'utf8');
    }
  }
  return arbre;
}

const arbre = balayer(join(ROOT, 'takussan-api', 'app'), (n) => n.endsWith('.php'));
balayer(join(ROOT, 'takussan-web', 'src'), (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n), arbre);
const fichiers = Object.keys(arbre).length;
if (fichiers < PLANCHER_FICHIERS) {
  console.error(`✗ ${fichiers} fichiers balayés, sous le plancher de ${PLANCHER_FICHIERS} — le balayage a manqué sa cible.`);
  process.exit(1);
}

const lus = lecteurs(arbre, cles, drapeaux);
const manquants = sansLecteur(arbre, cles, drapeaux);

if (REPORT) {
  for (const cle of cles) console.log(`  paramètre ${cle} ← ${lus.get(`parametre:${cle}`) ?? '—'}`);
  for (const valeur of Object.values(drapeaux)) console.log(`  drapeau ${valeur} ← ${lus.get(`drapeau:${valeur}`) ?? '—'}`);
}

if (manquants.length > 0) {
  for (const m of manquants) {
    console.error(`✗ ${m.replace(':', ' ')} : la console l'édite et aucun code ne le lit.`);
  }
  console.error("  Brancher son lecteur, ou le retirer du catalogue (EditablePlatformSettings / Flag) — un réglage qui ne pilote rien trompe l'opérateur.");
  process.exit(1);
}

console.log(
  `✓ ${cles.length} paramètre(s) et ${Object.keys(drapeaux).length} drapeau(x) de la console, chacun lu (${fichiers} fichiers balayés, ${CAS_EPREUVE.length + CAS_EPREUVE_CATALOGUE.length} auto-épreuves).`,
);
