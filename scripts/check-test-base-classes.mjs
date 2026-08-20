#!/usr/bin/env node
/**
 * Garde des CLASSES DE BASE DE TEST du backend (TCK-309, ex-dette D-37).
 *
 * Il y en avait TROIS, en chaîne linéaire — `Tests\TestCase` → `Tests\BaseTestCase`
 * → `Tests\ApiTestCase` — et **aucun document ne disait laquelle étendre**. Le
 * maillon du milieu n'avait pas d'usage propre : il portait `actingAsRole()` et deux
 * assertions JSON que rien ne réservait aux tests non-API. Le partage qui en
 * résultait ne suivait donc aucune règle, seulement l'ordre d'écriture — 49 classes
 * d'un côté, 38 de l'autre, la même chose des deux.
 *
 * Ce n'est pas un défaut cosmétique : quand deux emplacements sont également
 * plausibles, le suivant lit le désordre comme un précédent, et la quatrième classe
 * de base arrive dans six mois sans que personne n'ait décidé quoi que ce soit.
 * `BaseTestCase` a été fondue dans `Tests\TestCase` et supprimée.
 *
 * ── CE QUE LA GARDE VÉRIFIE ────────────────────────────────────────────────────
 *
 *   A. Les seules classes de base de test déclarées sous `tests/` sont les TROIS
 *      canoniques, chacune justifiée par un usage DISTINCT :
 *        · `PHPUnit\Framework\TestCase` — unitaire pur, ne démarre pas l'application ;
 *        · `Tests\TestCase`             — a besoin de l'application Laravel ;
 *        · `Tests\ApiTestCase`          — frappe une route `/api/*` (garde `sanctum`).
 *      Une quatrième classe abstraite dans `tests/` qui étend l'une d'elles est
 *      REFUSÉE : c'est exactement la forme qu'avait `BaseTestCase`.
 *
 *   B. Toute classe `*Test` étend l'une de ces trois, et rien d'autre. En
 *      particulier, `Illuminate\Foundation\Testing\TestCase` en direct est refusée :
 *      elle contourne la coupure de synchronisation Scout posée dans
 *      `Tests\TestCase::setUp()` (D-44), et ce contournement est MUET — le test
 *      passe, et c'est la suite entière qui rougit au hasard trois semaines plus tard.
 *
 *   C. NON-VACUITÉ. Une garde qui ne trouve plus sa cible et rend un tableau vide
 *      passe au vert en ne gardant plus rien — le mode de défaillance qui a déjà
 *      coûté ici (cf. `check-pro-routes.mjs`, faux négatif sur quatre pages). Si le
 *      répertoire `tests/` disparaît, se renomme, ou compte moins de
 *      `MINIMUM_CLASSES_TEST` classes `*Test`, la garde ROUGIT au lieu de conclure.
 *
 * ── CE QU'ELLE NE VÉRIFIE PAS ──────────────────────────────────────────────────
 *
 * Qu'un test ait choisi la BONNE des trois. Un test d'API qui étend `Tests\TestCase`
 * et n'appelle jamais `apiActingAsRole()` est parfaitement légal et la garde le
 * laisse passer. C'est un cliquet contre la RÉAPPARITION d'un quatrième emplacement,
 * pas une mesure de justesse (dette D-23 : chercher un jeton ne mesure pas une
 * propriété).
 *
 * Usage :
 *   node scripts/check-test-base-classes.mjs
 *   node scripts/check-test-base-classes.mjs --report
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const TESTS = join(ROOT, 'takussan-api', 'tests');

/**
 * Les trois bases canoniques, chacune avec l'usage qui la justifie. Ce n'est pas une
 * liste de tolérances : c'est LA règle, et elle est recopiée mot pour mot dans
 * `takussan-api/CLAUDE.md` § Tests et dans le docblock de `Tests\TestCase`.
 */
const BASES_CANONIQUES = new Map([
  ['PHPUnit\\Framework\\TestCase', 'test unitaire pur — ne démarre pas l\'application'],
  ['Tests\\TestCase', 'a besoin de l\'application Laravel'],
  ['Tests\\ApiTestCase', 'frappe une route /api/* (garde sanctum)'],
]);

/**
 * Plancher de non-vacuité. Mesuré au 2026-08-17 : 322 classes `*Test`. Le plancher
 * est posé bas exprès — il ne mesure pas la couverture, il détecte que la garde a
 * perdu sa cible (répertoire renommé, glob cassé, checkout partiel).
 */
const MINIMUM_CLASSES_TEST = 200;

const erreurs = [];

if (!existsSync(TESTS)) {
  console.error(
    `✗ classes de base de test : « takussan-api/tests/ » est introuvable.\n` +
      `  La garde n'a PAS conclu « aucun défaut » : elle ne sait plus où chercher.`,
  );
  process.exit(1);
}

/** @returns {string[]} tous les .php sous un répertoire, récursivement. */
function fichiersPhp(repertoire) {
  const out = [];
  for (const entree of readdirSync(repertoire)) {
    const chemin = join(repertoire, entree);
    if (statSync(chemin).isDirectory()) out.push(...fichiersPhp(chemin));
    else if (entree.endsWith('.php')) out.push(chemin);
  }
  return out;
}

/**
 * Résout le parent d'une classe en nom pleinement qualifié, via les `use` du
 * fichier. Sans cette résolution, `extends TestCase` serait ambigu entre les trois
 * `TestCase` du dépôt — et c'est précisément l'ambiguïté que ce ticket solde.
 */
function resoudre(parentCourt, imports, namespaceFichier) {
  if (parentCourt.startsWith('\\')) return parentCourt.slice(1);
  if (parentCourt.includes('\\')) return parentCourt;
  if (imports.has(parentCourt)) return imports.get(parentCourt);
  return namespaceFichier ? `${namespaceFichier}\\${parentCourt}` : parentCourt;
}

const classesTest = [];
const basesDeclarees = [];

for (const chemin of fichiersPhp(TESTS)) {
  const relatif = relative(ROOT, chemin);
  const source = readFileSync(chemin, 'utf8');

  const namespaceFichier = (source.match(/^namespace\s+([^;]+);/m) ?? [])[1]?.trim() ?? '';

  // `use A\B\C;` et `use A\B\C as D;` — l'alias compte, c'est lui qu'écrit `extends`.
  const imports = new Map();
  for (const m of source.matchAll(/^use\s+([A-Za-z0-9_\\]+)(?:\s+as\s+([A-Za-z0-9_]+))?\s*;/gm)) {
    const fqcn = m[1];
    const alias = m[2] ?? fqcn.split('\\').pop();
    imports.set(alias, fqcn);
  }

  for (const m of source.matchAll(
    /^(?<abstrait>abstract\s+|final\s+)?class\s+(?<nom>[A-Za-z0-9_]+)\s+extends\s+(?<parent>[A-Za-z0-9_\\]+)/gm,
  )) {
    const { nom, parent } = m.groups;
    const estAbstraite = (m.groups.abstrait ?? '').trim() === 'abstract';
    const parentFqcn = resoudre(parent, imports, namespaceFichier);
    const propre = namespaceFichier ? `${namespaceFichier}\\${nom}` : nom;

    // Une classe abstraite de `tests/` qui étend une base canonique EST une base
    // de test — c'est la forme exacte de la `BaseTestCase` qu'on vient de retirer.
    // Les trois canoniques elles-mêmes sont exclues du contrôle : `Tests\TestCase`
    // étend Laravel, `Tests\ApiTestCase` étend `Tests\TestCase`.
    if (estAbstraite && !BASES_CANONIQUES.has(propre)) {
      if (BASES_CANONIQUES.has(parentFqcn) || parentFqcn === 'Illuminate\\Foundation\\Testing\\TestCase') {
        basesDeclarees.push({ relatif, propre, parentFqcn });
      }
    }

    // Les classes de test proprement dites. Le suffixe `Test` est le contrat de
    // `phpunit.xml` : une classe qui ne le porte pas n'est jamais exécutée, et les
    // stubs de fixtures définis dans un fichier de test (modèles, policies,
    // exceptions) n'ont rien à voir avec cette garde.
    if (!estAbstraite && nom.endsWith('Test')) {
      classesTest.push({ relatif, nom, parentFqcn });
    }
  }
}

// ── C. NON-VACUITÉ — avant tout jugement, jamais après. ────────────────────────
if (classesTest.length < MINIMUM_CLASSES_TEST) {
  console.error(
    `✗ classes de base de test : ${classesTest.length} classe(s) « *Test » trouvée(s) sous ` +
      `takussan-api/tests/, plancher ${MINIMUM_CLASSES_TEST}.\n` +
      `  La garde ne conclut PAS « aucun défaut » : elle ne reconnaît plus sa cible.\n` +
      `  Causes probables : répertoire déplacé, convention de nommage changée, checkout partiel.`,
  );
  process.exit(1);
}

// ── A. Aucune quatrième base. ──────────────────────────────────────────────────
for (const b of basesDeclarees) {
  erreurs.push(
    `${b.relatif} — « ${b.propre} » est une QUATRIÈME classe de base de test ` +
      `(abstraite, étend ${b.parentFqcn}).\n` +
      `      Les trois canoniques suffisent, et chacune a son usage :\n` +
      [...BASES_CANONIQUES].map(([f, u]) => `        · ${f} — ${u}`).join('\n') +
      `\n      Si un QUATRIÈME usage le justifie vraiment, il se décide et s'écrit ` +
      `(CLAUDE.md § Tests + BASES_CANONIQUES ici), il ne s'ajoute pas en silence.`,
  );
}

// ── B. Toute classe de test étend une canonique. ───────────────────────────────
for (const c of classesTest) {
  if (BASES_CANONIQUES.has(c.parentFqcn)) continue;
  erreurs.push(
    `${c.relatif} — « ${c.nom} » étend « ${c.parentFqcn} », hors des trois bases canoniques.\n` +
      (c.parentFqcn === 'Illuminate\\Foundation\\Testing\\TestCase'
        ? `      Étendre Laravel EN DIRECT contourne la coupure de synchronisation Scout de\n` +
          `      Tests\\TestCase::setUp() — et ce contournement est MUET : ce test-ci passe, et\n` +
          `      c'est la suite entière qui rougit au hasard plus tard (D-44).\n`
        : '') +
      `      Attendu : ` + [...BASES_CANONIQUES.keys()].join(', '),
  );
}

if (REPORT) {
  const parBase = new Map([...BASES_CANONIQUES.keys()].map((k) => [k, 0]));
  let horsBase = 0;
  for (const c of classesTest) {
    if (parBase.has(c.parentFqcn)) parBase.set(c.parentFqcn, parBase.get(c.parentFqcn) + 1);
    else horsBase += 1;
  }
  console.log(`classes de base de test — ${classesTest.length} classes « *Test » examinées :`);
  for (const [base, n] of parBase) console.log(`  ${String(n).padStart(4)} · ${base} — ${BASES_CANONIQUES.get(base)}`);
  if (horsBase > 0) console.log(`  ${String(horsBase).padStart(4)} · HORS des trois bases`);
  console.log(`  portée : la garde vérifie qu'il n'existe qu'un emplacement par usage,`);
  console.log(`           jamais qu'un test donné a choisi le bon des trois.`);
}

if (erreurs.length > 0) {
  console.error(`✗ classes de base de test — ${erreurs.length} défaut(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(`✓ classes de base de test : ${classesTest.length} classes, trois bases canoniques, aucune quatrième`);
