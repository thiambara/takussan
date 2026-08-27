#!/usr/bin/env node
/**
 * Garde de la CHROME PUBLIQUE : la surface que voient les inconnus ne parle qu'un vocabulaire de
 * couleur — celui des jetons de `takussan-web/src/app/globals.css`. Aucune échelle neutre brute
 * de Tailwind (`gray-400`, `slate-700`, `zinc-100`, `neutral-200`) sur les six répertoires que
 * TCK-440 a mesurés.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `docs/design-guidelines.md` pose une règle fondamentale : *« Zéro valeur hex arbitraire dans le
 * code. Toute couleur passe par une variable CSS définie dans `src/app/globals.css`. Changer la
 * palette demain = modifier `globals.css`, rien d'autre. »* Relevé du 2026-08-27, sur la surface
 * publique — la commande est celle du § Contexte de TCK-440, reproduite ci-dessous :
 *
 *     grep -rhoE '\b(bg|text|border|ring)-(slate|gray|zinc|neutral)-[0-9]{2,3}\b' … | wc -l
 *       → 121
 *
 * Les deux composants les plus vus du site — la navbar et le pied de page — étaient les deux plus
 * éloignés du design system, et la page d'accueil qui les contient tous les deux était par
 * ailleurs exemplaire (0). Trois conséquences, toutes vérifiées : changer la palette ne changeait
 * pas la chrome ; le bloc `.dark` n'avait aucune prise sur elle ; et le contraste n'y était
 * arbitré par personne — `text-gray-400` sur blanc rend **2,60:1**, sous la moitié du seuil AA.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE COUVRE — et les DEUX TROUS, mesurés et déclarés
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle rejoue la commande de l'AC1, verbatim, sur le périmètre de l'AC1. Ni plus permissive
 * (l'AC l'interdit), ni plus large — et c'est un choix, pas un oubli. Re-mesuré le 2026-08-27
 * sur le MÊME périmètre, une fois la conversion faite :
 *
 *     T1 · les familles CHAUDES et sémantiques ............................ 260 occurrences
 *          `stone` 176 · `amber` 34 · `red` 23 · `emerald` 8 · `sky` 1. `stone` domine, et ce
 *          n'est pas un hasard : c'est le neutre CHAUD de Tailwind, celui dont quelqu'un s'est
 *          servi pour approcher Lin à la main. Le convertir demande le même travail que
 *          celui-ci, sur un volume deux fois plus grand ; l'inclure ici aurait fait naître la
 *          garde à 260 exceptions, c'est-à-dire pas de garde du tout.
 *     T2 · les couleurs NOMMÉES ........................................... 54 occurrences
 *          `bg-white` 36 · `text-white` 14 · `bg-black` 4. Celles de la navbar et du pied de page
 *          SONT converties par TCK-440 (le ticket les nomme) ; les autres restent.
 *
 *          ⚠⚠ **LES QUATRE `bg-black/*` SONT DES VOILES, ET LEUR CONVERSION EST DIFFÉRÉE À
 *          L'INTÉGRATION — délibérément.** Le jeton de voile `--scrim` vit sur `feat/lot-g3-design`
 *          et **pas ici**. La conversion a été écrite, puis ANNULÉE, parce qu'une branche doit être
 *          cohérente SEULE : une classe dont le jeton n'est pas déclaré n'émet aucune règle et rend
 *          le voile TRANSPARENT — mesuré par compilation Tailwind, et invisible à `tsc`, à ESLint,
 *          au build et à cette garde. Les quatre sites, avec leur opacité, sont dans le rapport
 *          d'intégration sous `conversions_scrim_a_faire_apres_fusion`.
 *
 *          C'est une instance vivante du trou que l'auteur de `--scrim` avait lui-même déclaré :
 *          *une garde de jetons ne sait pas si un jeton EXISTE.* Ce qui l'attrape est
 *          `takussan-web/src/test/__tests__/jetons-compiles.test.ts`, qui compile réellement
 *          `globals.css` — c'est le test à exiger au moment de la conversion.
 *
 * **Un trou déclaré est ce qui distingue une garde d'une garde qui se croit exhaustive.** Le
 * moment de fermer T1 et T2 est le ticket qui convertira ces familles-là ; jusque-là, ce fichier
 * dit ce qu'il ne voit pas plutôt que de laisser croire qu'il voit tout.
 *
 * ⚠ **ZÉRO EXCEPTION, et c'est structurel : il n'y a pas de liste d'exceptions dans ce fichier.**
 * AC2 de TCK-440 : *« une garde qui naît avec des exceptions n'est plus une garde »*. Le seul
 * moyen de faire passer une couleur brute sur ce périmètre est d'en retirer un répertoire — un
 * geste visible en revue, que {@link TEMOINS} rend en outre rouge.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LES TROIS FAÇONS DE LA DÉSARMER, ET CE QUI LES ATTRAPE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. casser l'expression régulière  → {@link EPREUVE}, qui exige qu'elle reconnaisse encore
 *      des formes connues ET qu'elle en refuse d'autres. Une regex qui n'attrape plus rien et
 *      une surface propre rendent le même vert.
 *   2. retirer un répertoire du périmètre → {@link TEMOINS} : chaque espace nomme un fichier qui
 *      DOIT se retrouver dans l'ensemble analysé.
 *   3. vider le périmètre de ses fichiers → le plancher {@link FICHIERS_MINIMUM}.
 *   4. retirer un CONTRÔLE entier (B ou C) → l'ablation de configuration, qui exige qu'au moins
 *      une sonde cesse d'être vue quand on l'enlève.
 *
 * Aucun de ces trois crans n'est infranchissable — retirer un répertoire, son témoin et baisser
 * le plancher passe, en trois gestes dans un commit. Le but n'est pas de rendre la manœuvre
 * impossible, il est de la rendre PLURIELLE : un diff d'une ligne se relit distraitement.
 *
 * ⚠ Les classes de palette brute ne sont **pas** écrites en toutes lettres dans ce docblock, et
 * les commentaires du code analysé ne sont **pas** retirés avant analyse. Même raison que
 * `check-super-admin-tokens.mjs` : un docblock qui montre une classe brute est exactement la
 * documentation périmée qui fait repousser le motif. **Ce piège a été payé ici** : la première
 * version de cette garde rougissait sur le docblock de `Footer.tsx`, qui citait en toutes lettres
 * la couleur qu'il expliquait avoir retirée. Le récit s'écrit donc en mots (« une ardoise 900 »),
 * jamais en classes copiables.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ÉPROUVÉE DANS LES DEUX SENS — et le second compte autant
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Une garde éprouvée seulement sur ce qu'elle doit refuser devient, le lendemain, un générateur
 * de faux positifs ; et un faux positif coûte PLUS qu'un trou, parce qu'il apprend à contourner
 * la garde. {@link EPREUVE} porte donc 49 formes — 22 à attraper, 27 à ignorer, dont des voisines
 * délibérément trompeuses.
 *
 * Balayage de faux positifs sur du RÉEL, mesuré le 2026-08-27 : les trois contrôles rejoués sur
 * **les 484 classes distinctes réellement écrites dans les 1130 fichiers de `takussan-web/src`**,
 * dont 479 sont légitimes → **0 faux positif**.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WEB_SRC = join(ROOT, 'takussan-web', 'src');

/**
 * Le périmètre — les six répertoires que le § Contexte de TCK-440 a mesurés.
 *
 * ⚠ `src/app/[locale]/(public)` et non `src/app/(public)` : TCK-434 a déplacé toute la surface
 * publique sous le segment de langue (ADR-0026). Le ticket, rédigé avant, cite l'ancien chemin —
 * qui n'existe plus. Un périmètre qui pointe un répertoire absent ne rougit pas, il compte zéro :
 * c'est le contrôle `manquants` ci-dessous qui refuse ce silence-là.
 */
const PERIMETRES = [
  join(WEB_SRC, 'app', '[locale]', '(public)'),
  join(WEB_SRC, 'components', 'home'),
  join(WEB_SRC, 'components', 'property'),
  join(WEB_SRC, 'components', 'search'),
  join(WEB_SRC, 'components', 'compare'),
  join(WEB_SRC, 'components', 'favorites'),
];

/**
 * Un fichier par répertoire gardé, qui DOIT se retrouver dans l'ensemble analysé.
 *
 * Le contrôle `manquants` vérifie qu'un chemin CONFIGURÉ existe encore ; il ne voit pas le cas
 * inverse — une entrée RETIRÉE de {@link PERIMETRES}. La garde sortirait alors en 0, sans un mot,
 * sur un périmètre amputé. Mécanisme repris de `check-super-admin-tokens.mjs`, qui l'avait payé.
 */
const TEMOINS = [
  join(WEB_SRC, 'app', '[locale]', '(public)', 'page.tsx'),
  join(WEB_SRC, 'components', 'home', 'Navbar.tsx'),
  join(WEB_SRC, 'components', 'home', 'Footer.tsx'),
  join(WEB_SRC, 'components', 'property', 'PropertyCard.tsx'),
  join(WEB_SRC, 'components', 'search', 'FilterSidebar.tsx'),
  join(WEB_SRC, 'components', 'compare', 'CompareTable.tsx'),
  join(WEB_SRC, 'components', 'favorites', 'FavoritesPopover.tsx'),
];

/** Plancher de fichiers analysés — 76 le 2026-08-27. Vider un répertoire ne doit pas être muet. */
const FICHIERS_MINIMUM = 60;

const PREFIXES = ['bg', 'text', 'border', 'ring'];
const FAMILLES = ['slate', 'gray', 'zinc', 'neutral'];

/**
 * TROIS contrôles, et non un — chacun ferme un défaut que les deux autres laissent passer.
 *
 *   A · ÉCHELLE NEUTRE BRUTE — le contrôle du § Contexte de TCK-440, sa regex verbatim.
 *   B · LE NOIR NU — `bg-black/40` et consorts. Ce n'est PAS un neutre à convertir vers une
 *       surface : c'est un VOILE, et un voile doit rester sombre dans les DEUX thèmes. Le jeton
 *       `--scrim` existe pour ça (`docs/design-guidelines.md`), il est OPAQUE et ne s'inverse
 *       pas sous `.dark` ; l'appelant pose l'alpha, d'où `bg-scrim/<n>`. Écrire le noir en clair
 *       marche aujourd'hui et devient faux le jour où quelqu'un cherche « toutes les surfaces
 *       sombres » — il n'en trouvera aucune.
 *   C · `scrim` HORS DE SON RÔLE — `text-scrim`, `ring-scrim/20`, `border-scrim` compilent
 *       parfaitement et ne veulent rien dire. C'est le trou que la garde jumelle a DÉCLARÉ sans
 *       le fermer, faute de pouvoir le faire en général : *une garde sait qu'un jeton est
 *       déclaré, pas quels utilitaires il a le droit de prendre.* Il se ferme ici parce que
 *       `--scrim` n'a qu'un seul rôle et qu'il est connu — un voile est un FOND. Ce qui reste
 *       ouvert, et qui l'est chez la jumelle aussi, c'est le cas général : `text-card` passe
 *       encore, ici comme ailleurs.
 */
function construireMotif({ prefixes = PREFIXES, familles = FAMILLES } = {}) {
  return new RegExp(`\\b(?:${prefixes.join('|')})-(?:${familles.join('|')})-[0-9]{2,3}\\b`, 'g');
}

/** C — `scrim` partout SAUF derrière `bg-`. Le préfixe est capturé pour le message d'échec. */
function construireMotifScrimHorsRole({ prefixes = PREFIXES } = {}) {
  const horsBg = prefixes.filter((p) => p !== 'bg');
  return new RegExp(`\\b(?:${horsBg.join('|')})-scrim(?:\\/[0-9]{1,3})?\\b`, 'g');
}

const CONTROLES = [
  ['A', 'échelle neutre brute', construireMotif()],
  ['C', 'jeton de voile hors de son rôle (--scrim est un FOND)', construireMotifScrimHorsRole()],
];

/** Conservé pour l'ablation de configuration, qui raisonne sur le contrôle A. */
const MOTIF = CONTROLES[0][2];

function vuParUnControle(forme, controles = CONTROLES) {
  return controles.some(([, , motif]) => { motif.lastIndex = 0; return motif.test(forme); });
}

/**
 * L'AUTO-ÉPREUVE — les formes que le motif doit voir, et celles qu'il doit laisser passer.
 *
 * Sans elle, une expression régulière cassée rend exactement la même sortie qu'une surface
 * propre. Les faux positifs comptent autant que les vrais : `text-sm` et `border-2` traversent
 * tout le dépôt, et un motif qui les attraperait ferait rougir sans rien apprendre.
 */
const EPREUVE = [
  // ── A · VUES : échelles neutres, toutes familles, toutes variantes ──────────────────────
  ['text-gray-400', true],
  ['text-slate-700', true],
  ['bg-zinc-100', true],
  ['border-neutral-200', true],
  ['ring-gray-300', true],
  ['hover:bg-gray-50', true],
  ['md:text-slate-900', true],
  ['dark:border-gray-800', true],
  ['group-hover:text-zinc-500', true],
  ['focus-visible:ring-neutral-400', true],
  ['text-zinc-50', true],
  ['data-[state=open]:bg-slate-100', true],
  // ── C · VUES : le jeton de voile hors de son rôle ───────────────────────────────────────
  ['text-scrim', true],
  ['ring-scrim/20', true],
  ['border-scrim', true],
  ['hover:text-scrim/50', true],

  // ── NON VUES : le vocabulaire légitime ──────────────────────────────────────────────────
  //
  // Une garde éprouvée seulement sur ce qu'elle doit refuser devient, le lendemain, un
  // générateur de faux positifs — et un faux positif coûte plus cher qu'un trou, parce qu'il
  // apprend à contourner la garde. D'où autant de formes ici que de formes attrapées.
  ['bg-scrim', false],          // LE rôle légitime du jeton de voile
  ['bg-scrim/40', false],
  ['bg-scrim/90', false],
  ['hover:bg-scrim/60', false],
  ['text-muted-foreground', false],
  ['text-muted-foreground/60', false],
  ['bg-card', false],
  ['bg-popover', false],
  ['border-border', false],
  ['text-primary-foreground', false],
  ['hover:bg-muted', false],
  // utilitaires non chromatiques qui PARTAGENT un préfixe
  ['text-sm', false],
  ['text-center', false],
  ['border-2', false],
  ['bg-cover', false],
  ['ring-inset', false],
  // formes VOISINES d'une classe interdite, et qui n'en sont pas — le piège du `\\b` mal posé
  ['text-gray', false],
  ['bg-gray-1000', false],
  ['text-graybeard-400', false],
  ['bg-blackboard', false],
  ['text-blackish', false],
  ['bg-scrimshaw', false],
  ['text-description', false],   // contient « scri »… mais pas `-scrim`
  // familles hors du périmètre DÉCLARÉ (trou T1) et couleurs nommées (trou T2)
  ['bg-stone-100', false],
  ['text-amber-400', false],
  ['text-white', false],
  ['bg-white', false],
  // ⚠ Le NOIR NU est délibérément TOLÉRÉ sur cette branche — cf. le trou T2 en tête de fichier.
  // Ces formes sont ici pour que le jour où le contrôle correspondant naîtra, il soit
  // impossible de le faire naître sans basculer ces lignes : une garde qui change d'avis doit
  // le faire par un diff visible.
  ['bg-black', false],
  ['bg-black/40', false],
  ['text-black', false],
];

function autoEpreuve() {
  const echecs = [];
  for (const [forme, attendu] of EPREUVE) {
    const vu = vuParUnControle(forme);
    if (vu !== attendu) echecs.push([forme, attendu, vu]);
  }
  if (echecs.length === 0) return true;
  console.error("✗ AUTO-ÉPREUVE — l'expression régulière ne reconnaît plus ce qu'elle doit.\n");
  for (const [forme, attendu, vu] of echecs) {
    console.error(`    « ${forme} » — attendu ${attendu ? 'vu' : 'non vu'}, obtenu ${vu ? 'vu' : 'non vu'}`);
  }
  console.error('\n  Une expression régulière cassée et une surface propre rendent le même vert.');
  return false;
}

/**
 * ABLATION DE CONFIGURATION — chaque famille et chaque préfixe déclaré doit être PORTEUR.
 *
 * Retirer `zinc` de {@link FAMILLES} ne fait rougir aucun contrôle si aucune forme d'épreuve ne
 * l'exerce : l'entrée devient décorative, et la garde perd une famille en silence. On reconstruit
 * donc le motif sans chaque entrée, et on exige qu'au moins une forme d'`EPREUVE` cesse d'être
 * vue. Une entrée orpheline est signalée par son nom.
 */
function ablationDeConfiguration() {
  const sondes = EPREUVE.filter(([forme, attendu]) => attendu && vuParUnControle(forme)).map(([f]) => f);
  const orphelines = [];
  const sansEntree = (opts) => [
    ['A', '', construireMotif(opts)],
    ['C', '', construireMotifScrimHorsRole(opts)],
  ];

  for (const famille of FAMILLES) {
    const sans = sansEntree({ familles: FAMILLES.filter((f) => f !== famille) });
    if (sondes.every((forme) => vuParUnControle(forme, sans))) orphelines.push(`famille « ${famille} »`);
  }
  for (const prefixe of PREFIXES) {
    const sans = sansEntree({ prefixes: PREFIXES.filter((p) => p !== prefixe) });
    if (sondes.every((forme) => vuParUnControle(forme, sans))) orphelines.push(`préfixe « ${prefixe} »`);
  }
  // Un CONTRÔLE entier retiré doit lui aussi faire tomber une sonde : sans ça, B ou C
  // pourraient devenir décoratifs sans que rien ne le dise.
  for (const [id] of CONTROLES) {
    const sans = CONTROLES.filter(([autre]) => autre !== id);
    if (sondes.every((forme) => vuParUnControle(forme, sans))) orphelines.push(`contrôle « ${id} »`);
  }

  if (orphelines.length === 0) return true;
  console.error("✗ ABLATION — une entrée de configuration n'est exercée par aucune forme d'épreuve.\n");
  for (const o of orphelines) console.error(`    ${o}`);
  console.error("\n  Ajouter une forme à EPREUVE qui l'exerce, ou retirer l'entrée.");
  return false;
}

const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/;

function fichiersDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      // Les tests ne rendent rien à un visiteur : un fichier de test peut légitimement écrire une
      // classe brute pour éprouver qu'elle est refusée — c'est le cas de ce fichier-ci.
      if (entree === '__tests__') continue;
      fichiersDe(chemin, acc);
    } else if (EXTENSIONS.test(entree) && !/\.(test|spec)\.[jt]sx?$/.test(entree)) {
      acc.push(chemin);
    }
  }
  return acc;
}

function main() {
  if (!autoEpreuve() || !ablationDeConfiguration()) process.exit(1);

  const manquants = PERIMETRES.filter((p) => !existsSync(p));
  if (manquants.length > 0) {
    console.error('✗ PÉRIMÈTRE — chemin(s) configuré(s) introuvable(s) :\n');
    for (const m of manquants) console.error(`    ${relative(ROOT, m)}`);
    console.error("\n  Un périmètre qui pointe un répertoire absent ne rougit pas, il compte zéro.");
    process.exit(1);
  }

  const fichiers = PERIMETRES.flatMap((p) => fichiersDe(p));
  const ensemble = new Set(fichiers);

  const temoinsAbsents = TEMOINS.filter((t) => !ensemble.has(t));
  if (temoinsAbsents.length > 0) {
    console.error("✗ TÉMOINS — des fichiers qui doivent être analysés ne le sont plus :\n");
    for (const t of temoinsAbsents) console.error(`    ${relative(ROOT, t)}`);
    console.error('\n  Soit le fichier a bougé, soit un répertoire a quitté PERIMETRES.');
    process.exit(1);
  }

  if (fichiers.length < FICHIERS_MINIMUM) {
    console.error(`✗ PLANCHER — ${fichiers.length} fichier(s) analysé(s), moins que le plancher de ${FICHIERS_MINIMUM}.`);
    process.exit(1);
  }

  const defauts = [];
  let total = 0;
  for (const fichier of fichiers) {
    const contenu = readFileSync(fichier, 'utf8');
    const lignes = contenu.split('\n');
    lignes.forEach((ligne, i) => {
      for (const [id, libelle, motif] of CONTROLES) {
        motif.lastIndex = 0;
        const trouvees = ligne.match(motif);
        if (!trouvees) continue;
        total += trouvees.length;
        defauts.push({
          fichier: relative(ROOT, fichier), ligne: i + 1, controle: id, libelle,
          classes: [...new Set(trouvees)],
        });
      }
    });
  }

  if (defauts.length > 0) {
    console.error(`✗ chrome publique — ${total} classe(s) de palette brute sur ${defauts.length} ligne(s).\n`);
    for (const d of defauts.slice(0, 40)) {
      console.error(`    [${d.controle}] ${d.fichier}:${d.ligne}  ${d.classes.join(' ')}  — ${d.libelle}`);
    }
    if (defauts.length > 40) console.error(`    … et ${defauts.length - 40} ligne(s) de plus`);
    console.error(`
  Le périmètre est exigé à ZÉRO, sans exception (TCK-440, AC2). Les jetons du design
  system vivent dans takussan-web/src/app/globals.css ; la correspondance retenue par
  TCK-440 est en tête de src/components/home/Footer.tsx et dans le test de contraste
  src/components/home/__tests__/chrome-publique.contraste.test.tsx.

  Un contraste doit être MESURÉ avant d'être introduit : le harnais est
  takussan-web/src/test/contraste-wcag.ts.
`);
    process.exit(1);
  }

  console.log(`✓ chrome publique : 0 classe de palette brute sur ${fichiers.length} fichier(s) de ${PERIMETRES.length} répertoire(s) (contre 121 le 2026-08-27, avant TCK-440).`);
  if (REPORT) {
    console.log(`  PORTÉE — ce contrôle est EXACT sur ce qu'il regarde : une classe Tailwind est
    un littéral, elle ne se calcule pas sous peine de ne pas être compilée. Ce
    qu'il NE regarde PAS, mesuré le 2026-08-27 sur le même périmètre : 260
    occurrences de familles chaudes ou sémantiques (pierre en tête) et 50
    emplois du blanc nommé. Le noir, lui, N'EST plus un trou — les quatre voiles
    sont passés au jeton de voile et le contrôle B les refuse. Les trous sont
    détaillés en tête de ce fichier : un vert ici ne veut PAS dire « la chrome
    publique n'a plus une seule couleur brute ».
    ⚠ Cette garde ne voit pas non plus si un jeton EXISTE : une classe dont le
    jeton n'est pas déclaré n'émet aucune règle et ne fait aucune erreur. C'est
    src/test/__tests__/jetons-compiles.test.ts qui l'attrape, par compilation.`);
  }
}

main();
