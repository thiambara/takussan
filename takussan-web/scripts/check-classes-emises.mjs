#!/usr/bin/env node
/**
 * TOUTE CLASSE ÉCRITE DANS `src/` DOIT EXISTER DANS LA FEUILLE — et c'est le compilateur, jamais
 * une liste, qui dit si elle existe.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Une classe Tailwind dont le jeton n'est pas déclaré n'émet aucune règle CSS — et ne produit
 * aucune erreur.** `tsc` ne la voit pas (c'est une chaîne), ESLint ne la voit pas, `next build`
 * réussit, les gardes de jetons du dépôt la déclarent conforme (elle *ressemble* à un jeton), et la
 * suite de tests passe. L'élément est simplement rendu **sans la couleur** : un voile devient
 * transparent, un fond devient blanc, une bordure disparaît.
 *
 * Ce n'est pas un cas théorique. Pendant TCK-440, les quatre voiles de la surface publique avaient
 * été convertis vers un jeton livré sur **une autre branche** : les quatre classes n'émettaient
 * rien — fond de lightbox, tiroir de filtres, surimpression de galerie, pastille d'horodatage, tous
 * transparents. Rien n'a signalé quoi que ce soit ; c'est une relecture de diff qui l'a rattrapé.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A AUCUNE LISTE ICI, ET POURQUOI C'EST LA FORME LA PLUS SIMPLE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un contrôle de ce nom a existé pendant TCK-440, dans `src/test/__tests__/jetons-compiles.test.ts`,
 * et a été **retiré le 2026-08-27 plutôt que désactivé** — un cas mis en sommeil est une invitation
 * à le réactiver sans le corriger. Son défaut :
 *
 *     const radical = classe.replace(…).split('/')[0];
 *     if (radical in JETONS_CLAIR) vues.add(classe);   // ← le relevé filtré par les jetons CONNUS
 *
 * Une classe dont le jeton n'existe pas était **écartée du relevé avant d'être contrôlée** :
 * exactement le cas que le contrôle prétendait attraper. L'ensemble des manquantes était vide *par
 * construction*, jamais par mesure — et la boucle était fermée aux DEUX bouts, ce même relevé
 * filtré alimentant le contenu donné à Tailwind. La classe écartée n'était ni dans la liste
 * contrôlée, ni dans la feuille où on la cherchait.
 *
 * ⚠ **Elle SEMBLAIT marcher** : sa première version portait `|| radical === 'scrim'`, une exception
 * nommée pour le jeton qu'on cherchait. Elle a bel et bien rougi sur les quatre voiles, *parce
 * qu'on lui avait soufflé le nom.* Elle n'a jamais eu de portée générale.
 *
 * *Une garde qui ne connaît que la liste des valeurs valides et écarte le reste ne garde rien :
 * « le reste » EST le défaut.*
 *
 * Ici, **le compilateur est la seule autorité**. Chaque candidat relevé est présenté à Tailwind par
 * un `@source inline("…")` — la voie qui court-circuite l'extracteur d'oxide et force l'examen du
 * candidat tel quel — et la question posée est binaire : *une règle a-t-elle été émise pour lui ?*
 * Tailwind émet pour TOUT utilitaire valide, chromatique ou non, et rien pour l'invalide. Aucune
 * table de jetons, aucune liste d'utilitaires non chromatiques, aucune exception : on RETIRE la
 * connaissance au lieu d'en ajouter.
 *
 * ⚠ Une objection avait été faite pendant la revue de TCK-453 : garder un filtre mais l'inverser —
 * écarter les utilitaires **non chromatiques** connus (`sm`, `center`, `cover`…). Elle est écartée
 * parce que c'est encore une liste, et que c'est la liste qui a échoué : il faudrait énumérer un
 * ensemble ouvert que Tailwind fait bouger sans prévenir, un oubli produisant un faux positif dans
 * un sens et un faux négatif dans l'autre. Son seul mérite — rendre le relevé insensible à la
 * qualité de l'extracteur — est la raison pour laquelle la ligne de base ci-dessous est une
 * condition de livraison et non un détail.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA LIGNE DE BASE DE FAUX POSITIFS — 2026-08-29, sur TOUT `src/`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *     923 fichiers · 1 533 classes distinctes relevées · 4 candidats non émis · **0 faux positif**
 *
 * Les quatre non émis sont des VRAIS défauts, nommés dans TCK-453 et corrigés avec lui :
 * `safe-area-bottom` (définie nulle part, la barre d'action mobile de la fiche n'avait aucun
 * rembourrage de zone sûre) et trois marqueurs de groupe nommés sans aucun consommateur —
 * `group/badge`, `group/button`, `group/card-header`.
 *
 * ⚠ Le compte d'aujourd'hui est 1 530 et non 1 529 : les trois marqueurs morts ont été RETIRÉS,
 * mais `safe-area-bottom` a été REMPLACÉE par `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`,
 * qui est un candidat de plus. 1 533 − 4 + 1 = 1 530. Écrit ici pour que l'écart ne passe pas
 * pour une incohérence entre la ligne de base et la mesure du jour.
 *
 * ⚠ **Le coût de la forme retenue est déplacé sur l'extracteur**, et c'est pour ça que ce chiffre
 * est écrit ici avec sa date. Il se re-mesure par `node scripts/check-classes-emises.mjs --report`.
 * Le relevé du 2026-08-27, avec un extracteur naïf sur 75 fichiers, rendait 6 « manquantes » dont
 * **six sur six étaient des artefacts** : une regex qui mord au milieu d'un token plus long, et un
 * docblock lu comme du code. Les deux causes sont traitées à la racine dans `classes-ecrites.mjs`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE VOIT PAS — trous DÉCLARÉS, non fermés
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Les classes composées à l'exécution.** `` `bg-${couleur}` ``, `` `${base}-500` `` : aucun
 *    contrôle statique ne peut les voir, et Tailwind ne les compile pas davantage. Le relevé écarte
 *    le jeton collé à une interpolation plutôt que d'en fabriquer un faux (`bg-`). C'est le § Hors
 *    périmètre de TCK-453 : trou à déclarer, pas à fermer.
 * 2. **Les fichiers de test** ne sont pas lus : ils écrivent des classes pour les asserter, y
 *    compris volontairement fausses. Périmètre déclaré, compté à chaque exécution.
 * 3. **Les commentaires** ne sont pas lus — décision argumentée en tête de `classes-ecrites.mjs`.
 *    Le prix : un exemple de classe écrit dans un docblock n'est pas contrôlé.
 * 4. **La PORTÉE d'une feuille annexe n'est pas vérifiée.** Une classe définie par
 *    `playground.css` compte comme émise partout, alors que cette feuille n'est importée que par
 *    la page /playground. Le contrôle répond « existe-t-elle ? », jamais « s'applique-t-elle ici ? ».
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE VIT ICI ET NON DANS `scripts/` À LA RACINE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Même raison que `check-i18n.mjs` : `repo-ci.yml` n'exécute aucun `npm ci` — ses gardes n'importent
 * que des modules `node:` natifs — et celle-ci COMPILE, donc a besoin de `postcss` et de
 * `@tailwindcss/postcss`. Elle est branchée dans `web-ci.yml`, où `npm ci` a déjà tourné.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

import { scanneClasses } from './classes-ecrites.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const GLOBALS = join(SRC, 'app', 'globals.css');
const REPORT = process.argv.includes('--report');

/** ⚠ Les tests sont exclus : ils écrivent des classes fausses EXPRÈS (cf. trou n°2). */
const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/;
const EST_UN_TEST = /\.(test|spec)\./;
const REPERTOIRES_IGNORES = new Set(['__tests__', '__mocks__']);

/**
 * Deux planchers, tous deux MESURÉS le 2026-08-29 (923 fichiers, 1 533 classes distinctes) et
 * posés nettement en dessous. Ils ne visent pas la précision : ils visent le cas où le relevé
 * cesse de relever. *Un lexeur cassé et une surface propre rendent le même vert.*
 */
const FICHIERS_MINIMUM = 800;
const CLASSES_MINIMUM = 1_200;

/** Un témoin par route du relevé : si l'une des deux meurt, ce fichier cesse d'être lu. */
const TEMOINS = [
  join(SRC, 'components', 'ui', 'button.tsx'),
  join(SRC, 'components', 'home', 'Navbar.tsx'),
];

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LE CORPUS D'ÉPREUVE
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Chaque cas : `[id, famille, source, releveAttendu, nonEmisAttendu]`.
 *
 * `releveAttendu` est EXACT — l'ensemble complet des classes que le relevé doit tirer de la source,
 * ni plus ni moins. C'est ce qui rend les familles E, F et G probantes : elles n'affirment pas
 * qu'une classe est trouvée, elles affirment qu'une chaîne **n'en est pas une**.
 *
 * ⚠ **Les radicaux inventés le sont pour de bon.** `vertkalpe`, `ocrezanzibar`, `krinkel` :
 * aucun n'apparaît dans `globals.css`, dans `playground.css`, ni ailleurs dans ce fichier. C'est
 * la condition qui manquait à la version retirée, qui portait `radical === 'scrim'` — elle
 * attrapait le cas qu'on lui avait décrit, et rien d'autre.
 */
const EPREUVE = [
  // ── A · un jeton qui n'existe pas (le cas d'origine, AC1) ──────────────────────────────────
  ['A1', 'A-jeton-absent', '<div className="bg-vertkalpe/40" />',
    ['bg-vertkalpe/40'], ['bg-vertkalpe/40']],
  ['A2', 'A-jeton-absent', "<div className={cn('rounded-xl', 'text-ocrezanzibar')} />",
    ['rounded-xl', 'text-ocrezanzibar'], ['text-ocrezanzibar']],
  ['A3', 'A-jeton-absent', "const CARTE = 'border-krinkel/30 shadow-sm';",
    ['border-krinkel/30', 'shadow-sm'], ['border-krinkel/30']],

  // ── B · une faute de frappe ────────────────────────────────────────────────────────────────
  ['B1', 'B-faute-de-frappe', '<div className="text-mutted-foreground" />',
    ['text-mutted-foreground'], ['text-mutted-foreground']],
  ['B2', 'B-faute-de-frappe', '<div className="bg-primry p-2" />',
    ['bg-primry', 'p-2'], ['bg-primry']],

  // ── C · un séparateur décimal fautif ───────────────────────────────────────────────────────
  ['C1', 'C-separateur-decimal', '<div className="p-4,5" />', ['p-4,5'], ['p-4,5']],
  ['C2', 'C-separateur-decimal', '<div className="mt-1.5 mb-2,5" />',
    ['mt-1.5', 'mb-2,5'], ['mb-2,5']],

  // ── D · une variante mal écrite ────────────────────────────────────────────────────────────
  ['D1', 'D-variante-mal-ecrite', '<div className="hover;bg-card" />', ['hover;bg-card'], ['hover;bg-card']],
  ['D2', 'D-variante-mal-ecrite', '<div className="data-[state=open:bg-card" />',
    ['data-[state=open:bg-card'], ['data-[state=open:bg-card']],
  ['D3', 'D-variante-mal-ecrite', '<div className="hoverr:bg-card" />', ['hoverr:bg-card'], ['hoverr:bg-card']],

  // ── E · les six artefacts d'extracteur mesurés le 2026-08-27, un par un ────────────────────
  ['E1', 'E-extracteur', '/** Se consomme en `bg-scrim/40` sur un voile. */\nconst x = 1;', [], []],
  ['E2', 'E-extracteur', '// à convertir vers bg-scrim/40\nconst y = 2;', [], []],
  ['E3', 'E-extracteur', '<div className="[&>div:first-child]:bg-transparent" />',
    ['[&>div:first-child]:bg-transparent'], []],
  ['E4', 'E-extracteur', '<div className="[&>div:first-child]:border-none [&>div:first-child]:shadow-none" />',
    ['[&>div:first-child]:border-none', '[&>div:first-child]:shadow-none'], []],
  ['E5', 'E-extracteur', '<div className="animate-in slide-in-from-bottom-2" />',
    ['animate-in', 'slide-in-from-bottom-2'], []],
  ['E6', 'E-extracteur', '<div className="slide-in-from-top-2" />', ['slide-in-from-top-2'], []],

  // ── F · le discriminant qui CHOISIT la classe n'est pas une classe ─────────────────────────
  ['F1', 'F-discriminant', "<div className={cn(side === 'left' && 'inset-y-0')} />", ['inset-y-0'], []],
  ['F2', 'F-discriminant', "<div className={buttonVariants({ variant: 'ghost' })} />", [], []],
  ['F3', 'F-discriminant', "<div className={buttonVariants({ variant: 'outline', className: 'h-8 gap-1' })} />",
    ['h-8', 'gap-1'], []],
  ['F4', 'F-discriminant', "<div className={TONS[tone ?? 'neutral']} />", [], []],
  ['F5', 'F-discriminant', "<div className={ouvert ? 'bg-card' : 'bg-muted'} />", ['bg-card', 'bg-muted'], []],
  ['F6', 'F-discriminant', "<div className={cn(TONS['danger'], 'rounded-md')} />", ['rounded-md'], []],

  // ── G · la composition à l'exécution, trou n°1, écartée sans fabriquer de faux candidat ────
  ['G1', 'G-execution', '<div className={`bg-${couleur} p-4`} />', ['p-4'], []],
  ['G2', 'G-execution', '<div className={`${base}-500 rounded`} />', ['rounded'], []],

  // ── H · des formes valides variées : la moitié « zéro faux positif » de la preuve ──────────
  ['H1', 'H-valide', '<div className="2xl:grid-cols-3 max-md:hidden" />', ['2xl:grid-cols-3', 'max-md:hidden'], []],
  ['H2', 'H-valide', '<div className="bg-[rgb(1,2,3)] w-1/2" />', ['bg-[rgb(1,2,3)]', 'w-1/2'], []],
  ['H3', 'H-valide', '<div className="supports-[display:grid]:block print:hidden" />',
    ['supports-[display:grid]:block', 'print:hidden'], []],
  ['H4', 'H-valide', '<div className="text-muted-foreground/60 hover:bg-muted" />',
    ['text-muted-foreground/60', 'hover:bg-muted'], []],
  // ⚠ L'apostrophe de texte JSX décide de tout le lexeur : la prendre pour un début de chaîne fait
  // avaler la suite du fichier, donc rater en silence les `className` traversés.
  ['H5', 'H-valide', "<p className='truncate'>Aujourd'hui c'est l'été</p>", ['truncate'], []],
  ['H6', 'H-valide', "<p>{'du texte entre accolades'}</p>", [], []],
];

/**
 * LE PLANCHER DU CORPUS — combien de cas chaque famille doit porter.
 *
 * Compté le 2026-08-29 sur {@link EPREUVE}. C'est un cliquet, pas une cible : il se lève quand on
 * ajoute des cas, il ne se baisse pas sans que la ligne de diff le dise. *Vider le corpus est le
 * premier des deux gestes qui désarment une garde en silence — le second est de démonter la
 * branche ; les deux ensemble, dans cet ordre, sont sondés par {@link ablationDeLaBranche}.*
 */
const PLANCHER_PAR_FAMILLE = {
  'A-jeton-absent': 3,
  'B-faute-de-frappe': 2,
  'C-separateur-decimal': 2,
  'D-variante-mal-ecrite': 3,
  'E-extracteur': 6,
  'F-discriminant': 6,
  'G-execution': 2,
  'H-valide': 6,
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LA MESURE
// ────────────────────────────────────────────────────────────────────────────────────────────────

function fichiersDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (REPERTOIRES_IGNORES.has(entree)) continue;
      fichiersDe(chemin, acc);
    } else if (EXTENSIONS.test(entree) && !EST_UN_TEST.test(entree)) {
      acc.push(chemin);
    }
  }
  return acc;
}

function feuillesCssDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) feuillesCssDe(chemin, acc);
    else if (entree.endsWith('.css')) acc.push(chemin);
  }
  return acc;
}

/**
 * Les jetons de classe d'un sélecteur CSS, **déséchappés**.
 *
 * ⚠ Ne PAS comparer en ré-échappant le candidat : Tailwind écrit `.\32 xl\:grid-cols-3` pour
 * `2xl:grid-cols-3` — un échappement hexadécimal suivi d'une espace, qu'aucun `replace` naïf ne
 * reproduit. Un candidat commençant par un chiffre serait déclaré non émis, à tort, en silence.
 */
const SELECTEUR_DE_CLASSE = /\.((?:\\[0-9a-fA-F]{1,6}[ \t\n]?|\\[\s\S]|[^\s.,:>+~()[\]{}"'`\\])+)/g;

function desechappe(texte) {
  let sortie = '';
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] !== '\\') { sortie += texte[i]; continue; }
    const hexa = /^\\([0-9a-fA-F]{1,6})[ \t\n]?/.exec(texte.slice(i));
    if (hexa) { sortie += String.fromCodePoint(parseInt(hexa[1], 16)); i += hexa[0].length - 1; }
    else { sortie += texte[i + 1]; i += 1; }
  }
  return sortie;
}

function classesDuSelecteur(racine, dans) {
  racine.walkRules((regle) => {
    for (const selecteur of regle.selectors) {
      for (const trouve of selecteur.matchAll(SELECTEUR_DE_CLASSE)) dans.add(desechappe(trouve[1]));
    }
  });
}

/**
 * Compile `globals.css` en soumettant CHAQUE candidat à Tailwind, et rend l'ensemble des classes
 * pour lesquelles une règle existe — feuilles annexes du projet comprises (`playground.css`).
 */
async function classesEmises(candidats) {
  const globals = readFileSync(GLOBALS, 'utf8')
    .split('\n')
    .filter((l) => !/^@import\s+"tailwindcss"/.test(l))
    .join('\n');

  // `source(none)` : sans ça Tailwind balaie le dépôt et l'émission ne dépendrait plus des seuls
  // candidats — le contrôle deviendrait vert sur des classes que personne n'a soumises.
  const css = [
    '@import "tailwindcss" source(none);',
    ...candidats.map((c) => `@source inline("${c.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}");`),
    globals,
  ].join('\n');

  const emises = new Set();
  const compile = await postcss([tailwind()]).process(css, { from: GLOBALS });
  classesDuSelecteur(compile.root, emises);

  let annexes = 0;
  for (const feuille of feuillesCssDe(SRC)) {
    if (feuille === GLOBALS) continue;
    annexes += 1;
    classesDuSelecteur(postcss.parse(readFileSync(feuille, 'utf8'), { from: feuille }), emises);
  }
  return { emises, annexes, taille: compile.css.length };
}

/** Le relevé d'un fichier, indexé par classe. `routes` permet l'ablation d'une route entière. */
function releve(fichiers, routes = ['attribut', 'forme']) {
  const parClasse = new Map();
  for (const fichier of fichiers) {
    for (const trouve of scanneClasses(readFileSync(fichier, 'utf8'))) {
      if (!routes.includes(trouve.route)) continue;
      if (!parClasse.has(trouve.classe)) parClasse.set(trouve.classe, []);
      parClasse.get(trouve.classe).push({ fichier, ligne: trouve.ligne, route: trouve.route });
    }
  }
  return parClasse;
}

const memeEnsemble = (a, b) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LES QUATRE FAÇONS DE RÉSISTER AU DÉSARMEMENT
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Cran n°1 — le relevé tire de chaque source d'épreuve EXACTEMENT ce qu'elle déclare. */
function autoEpreuveDuReleve(routes = ['attribut', 'forme']) {
  const echecs = [];
  for (const [id, , source, attendu] of EPREUVE) {
    const vu = scanneClasses(source).filter((t) => routes.includes(t.route)).map((t) => t.classe);
    if (!memeEnsemble(vu, attendu)) echecs.push([id, attendu, vu]);
  }
  return echecs;
}

/** Cran n°2 — le verdict d'émission de chaque cas d'épreuve est celui qu'il déclare. */
function autoEpreuveDeLEmission(emises, gardeActive = true) {
  const echecs = [];
  for (const [id, , source, , nonEmisAttendu] of EPREUVE) {
    const nonEmisVu = gardeActive
      ? scanneClasses(source).map((t) => t.classe).filter((c) => !emises.has(c))
      : [];
    if (!memeEnsemble(nonEmisVu, nonEmisAttendu)) echecs.push([id, nonEmisAttendu, nonEmisVu]);
  }
  return echecs;
}

/** Cran n°3 — le corpus ne se vide pas sans rougir. */
function plancherDuCorpus() {
  const sous = [];
  for (const [famille, plancher] of Object.entries(PLANCHER_PAR_FAMILLE)) {
    const n = EPREUVE.filter(([, f]) => f === famille).length;
    if (n < plancher) sous.push([famille, n, plancher]);
  }
  return sous;
}

/**
 * Cran n°4 — LA BRANCHE DE GARDE, ET LE CORPUS AVEC ELLE.
 *
 * Trois ablations, dont la dernière est celle qui a trouvé un trou chez trois gardes de la vague
 * 50 : *démonter le corpus PUIS la branche rendait `exit 0`.*
 *
 *   a. la branche d'émission neutralisée (tout est réputé émis) → les cas A/B/C/D doivent tomber ;
 *   b. chaque route du relevé retirée → au moins un cas doit tomber, sinon la route est décorative ;
 *   c. le corpus vidé **en même temps** que la branche → le plancher du corpus doit encore rougir.
 *
 * Une ablation qui ne fait rien tomber est signalée par son nom : elle dit qu'un morceau de cette
 * garde ne sert à rien, ce qui est la même information qu'un trou.
 */
function ablationDeLaBranche(emises) {
  const inertes = [];

  if (autoEpreuveDeLEmission(emises, false).length === 0) inertes.push('la branche d\'émission');

  for (const route of ['attribut', 'forme']) {
    const restantes = ['attribut', 'forme'].filter((r) => r !== route);
    if (autoEpreuveDuReleve(restantes).length === 0) inertes.push(`la route « ${route} » du relevé`);
  }

  // (c) — le corpus ET la branche démontés ENSEMBLE, dans cet ordre.
  const corpus = EPREUVE.splice(0, EPREUVE.length);
  const plancherRougit = plancherDuCorpus().length > 0;
  const emissionMuette = autoEpreuveDeLEmission(emises, false).length === 0;
  EPREUVE.push(...corpus);
  if (emissionMuette && !plancherRougit) inertes.push('le corpus vidé PUIS la branche démontée');

  return inertes;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const corpusSous = plancherDuCorpus();
  if (corpusSous.length > 0) {
    console.error('✗ PLANCHER DU CORPUS — une famille d\'épreuve a perdu des cas.\n');
    for (const [f, n, p] of corpusSous) console.error(`    ${f} : ${n} cas, plancher ${p}`);
    console.error('\n  Rendre les cas, ou baisser le plancher DANS LE MÊME DIFF, avec sa raison.');
    process.exit(1);
  }

  const echecsReleve = autoEpreuveDuReleve();
  if (echecsReleve.length > 0) {
    console.error('✗ AUTO-ÉPREUVE DU RELEVÉ — le lexeur ne tire plus des sources ce qu\'il doit.\n');
    for (const [id, attendu, vu] of echecsReleve) {
      console.error(`    ${id} — attendu [${attendu.join(' ')}], obtenu [${vu.join(' ')}]`);
    }
    console.error('\n  Un lexeur cassé et une surface propre rendent le même vert.');
    process.exit(1);
  }

  if (!existsSync(SRC)) {
    console.error(`✗ PÉRIMÈTRE — ${relative(WEB, SRC)} est introuvable : un périmètre absent compte zéro.`);
    process.exit(1);
  }

  const fichiers = fichiersDe(SRC);
  const ensemble = new Set(fichiers);
  const temoinsAbsents = TEMOINS.filter((t) => !ensemble.has(t));
  if (temoinsAbsents.length > 0) {
    console.error('✗ TÉMOINS — des fichiers qui doivent être analysés ne le sont plus :\n');
    for (const t of temoinsAbsents) console.error(`    ${relative(WEB, t)}`);
    process.exit(1);
  }
  if (fichiers.length < FICHIERS_MINIMUM) {
    console.error(`✗ PLANCHER — ${fichiers.length} fichier(s) lu(s), moins que le plancher de ${FICHIERS_MINIMUM}.`);
    process.exit(1);
  }

  const parClasse = releve(fichiers);
  if (parClasse.size < CLASSES_MINIMUM) {
    console.error(`✗ PLANCHER — ${parClasse.size} classe(s) distincte(s) relevée(s), moins que le plancher de ${CLASSES_MINIMUM}.`);
    console.error('  Le relevé a cessé de relever : c\'est le mode de panne muet de cette garde.');
    process.exit(1);
  }

  const candidatsEpreuve = EPREUVE.flatMap(([, , source]) => scanneClasses(source).map((t) => t.classe));
  const candidats = [...new Set([...parClasse.keys(), ...candidatsEpreuve])].sort();
  const { emises, annexes, taille } = await classesEmises(candidats);

  if (taille < 5_000) {
    console.error(`✗ COMPILATION — la feuille rend ${taille} octets : rien n'a été compilé, et tout serait déclaré non émis.`);
    process.exit(1);
  }

  const echecsEmission = autoEpreuveDeLEmission(emises);
  if (echecsEmission.length > 0) {
    console.error('✗ AUTO-ÉPREUVE DE L\'ÉMISSION — le verdict du compilateur n\'est plus celui qu\'on attend.\n');
    for (const [id, attendu, vu] of echecsEmission) {
      console.error(`    ${id} — non émis attendu [${attendu.join(' ')}], obtenu [${vu.join(' ')}]`);
    }
    process.exit(1);
  }

  const inertes = ablationDeLaBranche(emises);
  if (inertes.length > 0) {
    console.error('✗ ABLATION — un morceau de cette garde ne fait rien tomber quand on le retire :\n');
    for (const i of inertes) console.error(`    ${i}`);
    console.error('\n  Ajouter un cas d\'épreuve qui l\'exerce, ou retirer le morceau.');
    process.exit(1);
  }

  const manquantes = [...parClasse.keys()].filter((c) => !emises.has(c)).sort();

  if (manquantes.length > 0) {
    console.error(`✗ ${manquantes.length} classe(s) écrite(s) dans src/ n'émettent AUCUNE règle CSS.\n`);
    for (const classe of manquantes) {
      const lieux = parClasse.get(classe);
      const premier = lieux[0];
      const suite = lieux.length > 1 ? `  (+${lieux.length - 1} autre(s) occurrence(s))` : '';
      console.error(`    « ${classe} »`);
      console.error(`        ${relative(WEB, premier.fichier)}:${premier.ligne}${suite}`);
    }
    console.error(`
  Chacune est rendue SANS son effet, et rien d'autre dans le dépôt ne peut le voir :
  tsc ne lit pas les chaînes, ESLint non plus, next build réussit et la suite passe.

  Trois causes, par ordre de fréquence mesurée :
    · le jeton n'est pas (ou plus) déclaré dans takussan-web/src/app/globals.css ;
    · une faute de frappe, un séparateur décimal ou une variante mal fermée ;
    · une classe maison dont la feuille a disparu.

  ⚠ Si c'est un FAUX POSITIF, il ne se tolère pas par une exception : c'est le relevé
  qu'il faut corriger, dans scripts/classes-ecrites.mjs, et le cas qui l'illustre doit
  entrer dans le corpus d'épreuve de ce fichier. Une liste d'exceptions ici rejouerait
  exactement le défaut que TCK-453 a corrigé.
`);
    process.exit(1);
  }

  console.log(`✓ classes émises : ${parClasse.size} classe(s) distincte(s) de ${fichiers.length} fichier(s) de src/, toutes présentes dans la feuille compilée (+ ${annexes} feuille(s) annexe(s)).`);
  if (REPORT) {
    console.log(`  LIGNE DE BASE — 0 faux positif, mesuré le 2026-08-29 sur TOUT src/ :
    923 fichiers, 1 533 classes distinctes, 4 non émis, tous VRAIS défauts.
    Le compte ci-dessus est celui d'aujourd'hui ; c'est lui qui fait foi.

    CE QU'IL NE VOIT PAS, et qui est détaillé en tête de ce fichier : les classes
    composées à l'exécution (\`bg-\${x}\` — aucun contrôle statique ne les voit, et
    Tailwind ne les compile pas davantage), les fichiers de test, les commentaires,
    et la PORTÉE d'une feuille annexe — une classe de playground.css compte comme
    émise partout, alors qu'elle n'existe que sur /playground.

    CE QU'IL NE SAIT PAS, délibérément : aucun nom de jeton, aucun nom d'utilitaire,
    aucune exception. Le compilateur arbitre seul, par \`@source inline()\`. C'est la
    forme la plus SIMPLE, et c'est l'argument : la version retirée le 2026-08-27
    filtrait ses candidats par les jetons connus, donc écartait avant de contrôler
    exactement le cas qu'elle prétendait attraper.`);
  }
}

main();
