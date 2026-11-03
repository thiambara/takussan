#!/usr/bin/env node
/**
 * Range les tickets PAR STATUT : `tickets/<status>/TCK-NNN-<slug>.md`, et réécrit les liens.
 *
 * Le dossier d'un ticket est DÉRIVÉ de son frontmatter — `status:` reste la seule source. Passer un
 * ticket de `todo` à `done`, c'est éditer son `status:` puis lancer ce script : il déplace le
 * fichier (`git mv`, l'historique suit) et réécrit, dans tout le dépôt, ce qui le désignait.
 *
 * Usage :
 *   node docs/backlog/ranger-tickets.mjs            # range et réécrit (idempotent)
 *   node docs/backlog/ranger-tickets.mjs --dry-run  # dit ce qu'il ferait, ne touche à rien
 *   node docs/backlog/ranger-tickets.mjs --check    # garde : sort en 1 si un ticket est mal rangé
 *                                                   #   ou si un lien vise un emplacement périmé
 *
 * ─── Pourquoi la réécriture est le vrai travail ─────────────────────────────────────────────
 *
 * 1 854 tickets dans un seul dossier, dont 53 ouverts : la liste des ouverts ne se voyait qu'au
 * travers de `check-backlog.mjs --report`. Les ranger est trivial ; ce qui ne l'est pas, c'est que
 * le dépôt cite ses tickets par leur chemin (ADR, plans, CLAUDE.md, commentaires de code) et que
 * les tickets se citent entre eux et citent les specs par des liens RELATIFS — qui prennent un
 * niveau de profondeur au rangement, puis changent de dossier à chaque changement de statut. Un
 * rangement qui ne réécrirait pas les liens échangerait un dossier encombré contre des centaines de
 * pointeurs morts. D'où deux passes :
 *
 *   A. **Liens markdown relatifs** `[x](chemin)` de chaque `.md` : résolus depuis l'emplacement
 *      ACTUEL du fichier, puis recalculés depuis son emplacement FINAL, la cible étant elle-même
 *      remplacée par son emplacement final si c'est un ticket. Un lien dont la cible n'existe pas
 *      n'est jamais touché : on ne déplace pas un pointeur déjà mort, on le laisse se voir.
 *   B. **Mentions textuelles** `…backlog/tickets/[<statut>/]TCK-NNN-<slug>.md`, dans tout fichier
 *      texte suivi (commentaires `@see`, backticks, YAML) : le segment de statut est remplacé par
 *      celui du ticket.
 *
 * La correspondance se fait par NOM DE FICHIER (`TCK-NNN-<slug>.md`, unique — `check-backlog.mjs`
 * refuse les id en double), ce qui rend les deux passes idempotentes : relancées sur un dépôt rangé,
 * elles ne changent rien, et c'est exactement ce que `--check` vérifie.
 *
 * ⚠ Hors de portée, et voulu : un chemin construit par du code (`glob('…/tickets/*\/TCK-…')`) ou un
 * nom de ticket cité sans son chemin. Les messages de commit et les PR déjà écrits gardent leurs
 * anciens chemins : l'historique git les résout (`git log --follow`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TICKETS = 'docs/backlog/tickets';
/** Les statuts de `check-backlog.mjs` — un dossier n'existe que s'il porte au moins un ticket. */
export const STATUTS = ['todo', 'doing', 'review', 'blocked', 'done', 'obsolete'];
const NOM_TICKET = /^TCK-\d+-[A-Za-z0-9._-]+\.md$/;

const ARGS = process.argv.slice(2);
const CHECK = ARGS.includes('--check');
const DRY = CHECK || ARGS.includes('--dry-run');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

/** Tous les tickets, où qu'ils soient sous `tickets/` (racine incluse : un ticket neuf y atterrit). */
export function listerTickets(racine = ROOT) {
  const dossier = join(racine, TICKETS);
  return readdirSync(dossier, { recursive: true })
    .map((p) => p.split('\\').join('/'))
    .filter((p) => NOM_TICKET.test(posix.basename(p)))
    .sort();
}

function statutDe(chemin) {
  const tete = readFileSync(join(ROOT, chemin), 'utf8').match(/^---\n([\s\S]*?)\n---/);
  return tete?.[1].match(/^status:\s*["']?([a-z]+)/m)?.[1];
}

/* ─────────────────────────────────────────────── 1. où chaque ticket doit être */
const erreurs = [];
const final = new Map(); // nom de fichier → chemin final, relatif à la racine du dépôt
const deplacements = []; // [actuel, final]
for (const rel of listerTickets()) {
  const actuel = `${TICKETS}/${rel}`;
  const nom = posix.basename(rel);
  const statut = statutDe(actuel);
  if (!STATUTS.includes(statut)) {
    erreurs.push(`${actuel} : statut ${statut ? `inconnu « ${statut} »` : 'absent'} — laissé en place`);
    final.set(nom, actuel);
    continue;
  }
  if (final.has(nom)) erreurs.push(`${nom} : présent deux fois (${final.get(nom)} et ${actuel})`);
  const cible = `${TICKETS}/${statut}/${nom}`;
  final.set(nom, cible);
  if (cible !== actuel) deplacements.push([actuel, cible]);
}
const versFinal = new Map(deplacements);
const ou = (chemin) => versFinal.get(chemin) ?? chemin;

/* ─────────────────────────────────────────────── 2. les fichiers à relire */
const EXTENSIONS = /\.(md|mdx|mjs|cjs|js|jsx|ts|tsx|php|sh|ya?ml|json|py|txt|html|css|neon|xml)$/;
const fichiers = [
  ...git('ls-files', '-z').split('\0'),
  ...git('ls-files', '-z', '--others', '--exclude-standard').split('\0'),
// Un lien symbolique n'est pas relu : le réécrire écrirait dans sa CIBLE, parfois hors du dépôt.
].filter((f) => f && EXTENSIONS.test(f) && existsSync(join(ROOT, f)) && !lstatSync(join(ROOT, f)).isSymbolicLink());

const estTicket = (chemin) => {
  const d = posix.dirname(chemin);
  return NOM_TICKET.test(posix.basename(chemin))
    && (d === TICKETS || (d.startsWith(`${TICKETS}/`) && !d.slice(TICKETS.length + 1).includes('/')));
};

/** Passe A : les liens relatifs d'un fichier markdown, depuis son emplacement final. */
function passeLiens(texte, actuel) {
  const avant = posix.dirname(actuel);
  const apres = posix.dirname(ou(actuel));
  return texte.replace(/(\]\()(<?)([^)\s<>]+)(>?)(\s+"[^"]*")?\)/g, (tout, o, ch1, cible, ch2, titre = '') => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(cible)) return tout;
    const [chemin, ...ancre] = cible.split('#');
    if (!chemin) return tout;
    let resolu = posix.normalize(posix.join(avant, chemin));
    if (estTicket(resolu)) {
      const vise = final.get(posix.basename(resolu));
      if (!vise) return tout;
      resolu = vise;
    } else if (!existsSync(join(ROOT, resolu))) {
      return tout;
    } else if (apres === avant) {
      return tout;
    }
    let neuf = posix.relative(apres, resolu) || posix.basename(resolu);
    if (chemin.startsWith('./') && !neuf.startsWith('.')) neuf = `./${neuf}`;
    if (neuf === chemin) return tout;
    return `${o}${ch1}${[neuf, ...ancre].join('#')}${ch2}${titre})`;
  });
}

/** Passe B : les mentions `…backlog/tickets/[statut/]TCK-…md`, dans tout fichier texte. */
const MENTION = new RegExp(`(backlog/tickets/)(?:(?:${STATUTS.join('|')})/)?(TCK-\\d+-[A-Za-z0-9._-]*?\\.md)`, 'g');
function passeMentions(texte) {
  return texte.replace(MENTION, (tout, prefixe, nom) => {
    const vise = final.get(nom);
    return vise ? `${prefixe}${vise.slice(TICKETS.length + 1)}` : tout;
  });
}

const reecrits = [];
for (const f of fichiers) {
  const texte = readFileSync(join(ROOT, f), 'utf8');
  if (texte.includes('\0')) continue;
  let neuf = f.endsWith('.md') || f.endsWith('.mdx') ? passeLiens(texte, f) : texte;
  neuf = passeMentions(neuf);
  if (neuf !== texte) reecrits.push([f, neuf]);
}

/* ─────────────────────────────────────────────── 3. rendre compte, ou agir */
if (erreurs.length) {
  console.error(`✗ ${erreurs.length} ticket(s) impossible(s) à ranger :`);
  for (const e of erreurs) console.error(`  · ${e}`);
}

if (DRY) {
  const parStatut = {};
  for (const [, c] of deplacements) parStatut[c.split('/').at(-2)] = (parStatut[c.split('/').at(-2)] ?? 0) + 1;
  if (deplacements.length) {
    console.log(`${deplacements.length} ticket(s) mal rangé(s) : `
      + Object.entries(parStatut).map(([s, n]) => `${n} → ${s}/`).join(', '));
    for (const [a, c] of deplacements.slice(0, 20)) console.log(`  ${a}  →  ${c.split('/').at(-2)}/`);
    if (deplacements.length > 20) console.log(`  … et ${deplacements.length - 20} autre(s)`);
  }
  if (reecrits.length) {
    console.log(`${reecrits.length} fichier(s) dont des liens visent un emplacement périmé :`);
    for (const [f] of reecrits.slice(0, 20)) console.log(`  ${f}`);
    if (reecrits.length > 20) console.log(`  … et ${reecrits.length - 20} autre(s)`);
  }
  const propre = !deplacements.length && !reecrits.length && !erreurs.length;
  if (propre) console.log(`✓ ${final.size} tickets rangés par statut, aucun lien périmé.`);
  else if (CHECK) console.error('\n→ node docs/backlog/ranger-tickets.mjs   (range et réécrit, puis commiter)');
  process.exit(CHECK && !propre ? 1 : 0);
}

// Écrire d'abord, aux emplacements ACTUELS, puis déplacer sur le disque, puis UN SEUL passage par
// l'index. Pas un `git mv` par ticket : le premier rangement en déplaçait 1 854, et un autre
// processus git (un éditeur, un agent) qui prend `index.lock` au milieu arrêtait le script à
// mi-course, la moitié des tickets rangés. Git retrouve les renommages tout seul à la comparaison.
for (const [f, neuf] of reecrits) writeFileSync(join(ROOT, f), neuf);
for (const [a, c] of deplacements) {
  mkdirSync(join(ROOT, posix.dirname(c)), { recursive: true });
  renameSync(join(ROOT, a), join(ROOT, c));
}
if (deplacements.length) {
  try {
    git('add', '-A', '--', TICKETS);
  } catch (e) {
    console.error(`⚠ fichiers déplacés, mais l'index n'a pas suivi : relancer \`git add -A ${TICKETS}\`\n${e.stderr ?? e}`);
  }
}
console.log(`✓ ${deplacements.length} ticket(s) déplacé(s), ${reecrits.length} fichier(s) réécrit(s).`);
process.exit(erreurs.length ? 1 : 0);
