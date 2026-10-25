#!/usr/bin/env node
/**
 * Garde du CLIQUET d'ESLint : `takussan-web/eslint-suppressions.json` ne grossit jamais.
 *
 * **Pourquoi elle existe.** Le 2026-10-25 (TCK-2335, P210.05, P07.12), `no-misused-promises`,
 * `no-floating-promises` et le jeu `recommended` de `jsx-a11y` sont passés en `error`, et les
 * 166 violations qui existaient ce jour-là ont été gelées par les suppressions en masse natives
 * d'ESLint 10 : un compte par fichier et par règle, que `npm run lint` lit sans option. ESLint
 * tient ce cliquet dans un seul sens. Une violation neuve rougit (exit 1), une violation corrigée
 * sans élaguer aussi (exit 2) — mais **`npx eslint --suppress-all` regèle tout ce qui rougit, en
 * une commande, et le lint redevient vert.** Rien, dans ESLint, ne distingue ce geste d'un gel
 * légitime : *un cliquet qu'on peut remonter sans que personne le voie n'est pas un cliquet,
 * c'est une tolérance.*
 *
 * **Ce qu'elle vérifie.** Pour chaque fichier et chaque règle du fichier de suppressions, le
 * compte ne dépasse pas celui de la base. Une entrée absente de la base — fichier ou règle — est
 * une croissance et rougit. Une baisse (lot résorbé, `--prune-suppressions`) passe, et la garde
 * l'imprime : le delta se lit dans la sortie, dans les deux sens.
 *
 * **La base**, lue par `git show <ref>:takussan-web/eslint-suppressions.json` :
 *   · `--base <ref>` s'il est donné ;
 *   · en CI de PR, `origin/$GITHUB_BASE_REF` — la branche que la PR vise ;
 *   · en CI de push, `HEAD^` — l'état de la branche avant ce push. Comparer `dev` à `pre-dev`
 *     rougirait `dev` à chaque lot résorbé sur `pre-dev` et pas encore promu ;
 *   · sinon `origin/pre-dev`, sinon `origin/dev`.
 * Une base qui n'a pas le fichier (avant TCK-2335) passe, en le disant. Aucune base lisible
 * (clone superficiel, ref absente) rougit : une garde qui ne compare rien ne dit pas vert.
 *
 * **Ce qu'elle NE prouve PAS.** Elle compare deux comptes, pas leur justesse : déplacer une
 * violation d'un fichier gelé à un autre fichier gelé, à compte égal, la laisse verte. Et un
 * regel légitime (une règle neuve passée en erreur, un renommage de fichier) la fait rougir : il
 * se fait alors dans une PR qui le dit, avec `--base` sur la PR elle-même, jamais en silence.
 *
 * Usage :
 *   node scripts/check-eslint-suppressions.mjs                 # garde, sort en 1 à toute hausse
 *   node scripts/check-eslint-suppressions.mjs --report        # + le delta complet
 *   node scripts/check-eslint-suppressions.mjs --base <ref>    # contre une autre base
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHEMIN = 'takussan-web/eslint-suppressions.json';
const args = process.argv.slice(2);
const REPORT = args.includes('--report');
const iBase = args.indexOf('--base');
const baseDonnee = iBase >= 0 ? args[iBase + 1] : null;

function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function refExiste(ref) {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function candidats() {
  if (baseDonnee) return [baseDonnee];
  if (process.env.GITHUB_BASE_REF) return [`origin/${process.env.GITHUB_BASE_REF}`];
  if (process.env.GITHUB_EVENT_NAME === 'push') return ['HEAD^'];
  return ['origin/pre-dev', 'origin/dev'];
}

/** `{ "<fichier>": { "<règle>": compte } }`, depuis le format d'ESLint (`{ count }`). */
function comptes(json) {
  const sortie = {};
  for (const [fichier, regles] of Object.entries(json)) {
    sortie[fichier] = {};
    for (const [regle, { count }] of Object.entries(regles)) sortie[fichier][regle] = count;
  }
  return sortie;
}

const ref = candidats().find(refExiste);
if (!ref) {
  console.error(`✗ check-eslint-suppressions — aucune base lisible parmi : ${candidats().join(', ')}.`);
  console.error('  Clone superficiel ou ref absente : la garde ne compare rien, elle le dit en rouge.');
  process.exit(1);
}

const local = join(ROOT, CHEMIN);
if (!existsSync(local)) {
  console.error(`✗ ${CHEMIN} est introuvable : le cliquet d'ESLint (TCK-2335) a disparu.`);
  process.exit(1);
}
const courant = comptes(JSON.parse(readFileSync(local, 'utf8')));

let base;
try {
  base = comptes(JSON.parse(git('show', `${ref}:${CHEMIN}`)));
} catch {
  console.log(`✓ check-eslint-suppressions — ${ref} n'a pas ${CHEMIN} : rien à comparer.`);
  process.exit(0);
}

const hausses = [];
const baisses = [];
const fichiers = new Set([...Object.keys(base), ...Object.keys(courant)]);
for (const fichier of [...fichiers].sort()) {
  const regles = new Set([...Object.keys(base[fichier] ?? {}), ...Object.keys(courant[fichier] ?? {})]);
  for (const regle of [...regles].sort()) {
    const avant = base[fichier]?.[regle] ?? 0;
    const apres = courant[fichier]?.[regle] ?? 0;
    const ligne = `${fichier} · ${regle} : ${avant} → ${apres}${avant === 0 ? ' (entrée neuve)' : ''}`;
    if (apres > avant) hausses.push(ligne);
    else if (apres < avant) baisses.push(ligne);
  }
}

const total = (c) => Object.values(c).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0);
const resume = `${total(base)} → ${total(courant)} violation(s) gelée(s), base ${ref}`;

if (baisses.length && (REPORT || hausses.length)) {
  console.log(`  ${baisses.length} baisse(s) :`);
  for (const l of baisses) console.log(`    − ${l}`);
}
if (hausses.length) {
  console.error(`✗ check-eslint-suppressions — ${hausses.length} hausse(s) du gel d'ESLint (${resume}) :`);
  for (const l of hausses) console.error(`    + ${l}`);
  console.error(
    '  Une violation neuve se CORRIGE ; elle ne se gèle pas. `--suppress-all` et `--suppress-rule`\n' +
      '  ne servent qu’au gel d’une règle neuve passée en erreur, dans une PR qui le dit.',
  );
  process.exit(1);
}
console.log(`✓ check-eslint-suppressions — aucune hausse (${resume}, ${baisses.length} baisse(s)).`);
