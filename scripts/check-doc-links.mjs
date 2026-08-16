#!/usr/bin/env node
// Aucun document normatif ne cite un chemin markdown qui n'existe pas.
//
// POURQUOI. Un pointeur mort dans une source de vérité ne se signale pas tout seul : il coûte dix
// minutes au lecteur, puis dix minutes au suivant, à vie. `docs/models-spec.md` a cité
// `docs/claude-code-prompt-notifications.md` — un document JAMAIS ÉCRIT — assez longtemps pour
// qu'on finisse par annoter la citation *(jamais écrit — pointeur mort)* au lieu de la retirer.
// L'ardoise (D-19) en dénombrait cinq ; la re-mesure du 2026-08-16 n'en a trouvé qu'un. La dette
// avait fondu de 5 à 1 sans que personne ne l'écrive — parce que RIEN ne la mesurait. (TCK-311)
//
// Usage :
//   node scripts/check-doc-links.mjs            # sort 1 au premier chemin mort
//   node scripts/check-doc-links.mjs --report   # + le périmètre exact et les compteurs
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// PÉRIMÈTRE, ET POURQUOI IL N'EST PAS « TOUT `docs/` »
//
// Mesuré au 2026-08-16 : `docs/` porte 294 chemins markdown morts, dont 269 dans le seul
// `docs/backlog/_archive/INDEX-manuel-2026-08-12.md`. Ces fichiers sont des ARCHIVES GELÉES À
// DESSEIN — l'index manuel faux est conservé comme pièce à conviction, les `sync-passes/` sont des
// procès-verbaux datés. Un pointeur mort y est un FAIT D'HISTOIRE, pas un défaut : le « corriger »
// falsifierait l'archive.
//
// Une garde qu'on ne peut pas rendre verte n'est pas une garde, c'est un avertissement de plus —
// exactement le bandeau « ⚠️ désynchronisé » que ce ticket existe pour retirer. Elle porte donc
// sur les documents NORMATIFS : ceux dont on attend d'un lecteur qu'il les applique aujourd'hui.
// ────────────────────────────────────────────────────────────────────────────────────────────

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Fichiers normatifs isolés, hors `docs/`. */
const NORMATIVE_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'takussan-api/CLAUDE.md',
  'takussan-web/CLAUDE.md',
  'takussan-web/README.md',
];

/** Dossiers normatifs balayés récursivement. */
const NORMATIVE_DIRS = ['docs/adr'];

/** `docs/` au premier niveau : les documents de référence courants. */
const NORMATIVE_TOP_LEVEL = 'docs';

/**
 * Marqueur de citation délibérément morte. Un document dont le métier est de NOMMER ce qui
 * manque — `docs/ardoise.md` au premier chef — cite légitimement des fichiers absents. Il le
 * déclare, ligne par ligne, plutôt que de désarmer la garde sur tout le fichier : ses autres
 * pointeurs, eux, doivent rester gardés.
 */
const DEAD_ON_PURPOSE = '<!-- lien-mort-assumé -->';

/**
 * Le marqueur accepte un motif : `<!-- lien-mort-assumé : parce que … -->`.
 * (Pas de `\b` final : `é` n'est pas un caractère `\w`, la limite de mot ne s'y forme jamais.)
 */
const DEAD_ON_PURPOSE_RE = /<!--\s*lien-mort-assumé\s*(?::|-->)/;

/**
 * Une citation n'est un CHEMIN que si elle porte un séparateur. `` `models-spec.md` `` est un
 * NOM de document — la façon normale de désigner une spec en prose — et le résoudre relativement
 * au fichier citant produirait des faux positifs en masse (149 sur 443 à la mesure).
 */
function isPath(p) {
  return p.includes('/');
}

/** Gabarits et exemples : `TCK-NNN-<slug>.md`, `docs/**\/*.md`… — pas des chemins réels. */
function isPlaceholder(p) {
  return /[<>{}*]|NNN|…/.test(p);
}

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (e.endsWith('.md')) acc.push(p);
  }
  return acc;
}

function collectScope() {
  const files = new Set();
  for (const f of NORMATIVE_FILES) {
    const p = join(ROOT, f);
    if (existsSync(p)) files.add(p);
  }
  for (const d of NORMATIVE_DIRS) for (const p of walk(join(ROOT, d))) files.add(p);
  const top = join(ROOT, NORMATIVE_TOP_LEVEL);
  for (const e of readdirSync(top)) {
    const p = join(top, e);
    if (statSync(p).isFile() && e.endsWith('.md')) files.add(p);
  }
  return [...files].sort();
}

/** Extrait les citations markdown d'une ligne : `[texte](chemin.md)` et `` `chemin.md` ``. */
function citations(line) {
  const out = [];
  for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+?\.md)(?:#[^)\s]*)?\)/g)) out.push(m[1]);
  for (const m of line.matchAll(/`([^`\s]*?\.md)`/g)) out.push(m[1]);
  return out;
}

const scope = collectScope();
const dead = [];
let checked = 0;
let waived = 0;

for (const file of scope) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const excused = DEAD_ON_PURPOSE_RE.test(line);
    for (const raw of citations(line)) {
      if (!isPath(raw) || isPlaceholder(raw)) continue;
      if (/^(https?:)?\/\//.test(raw)) continue;
      const cleaned = raw.replace(/^\.\//, '');
      checked += 1;
      const found =
        existsSync(resolve(dirname(file), cleaned)) || existsSync(resolve(ROOT, cleaned));
      if (found) continue;
      if (excused) {
        waived += 1;
        continue;
      }
      dead.push({ file: rel, line: i + 1, path: raw });
    }
  });
}

const report = process.argv.includes('--report');

if (report) {
  console.log(`Périmètre : ${scope.length} documents normatifs`);
  console.log(`  · ${NORMATIVE_TOP_LEVEL}/*.md (premier niveau)`);
  for (const d of NORMATIVE_DIRS) console.log(`  · ${d}/**/*.md`);
  for (const f of NORMATIVE_FILES) console.log(`  · ${f}`);
  console.log(
    'Hors périmètre — archives et procès-verbaux gelés à dessein : docs/backlog/**, ' +
      'docs/sync-passes/**, docs/superpowers/**, docs/plans/**, docs/qa/**, docs/smoke-tests/**.',
  );
  console.log(
    '  (les `spec_refs` des tickets sont gardés séparément par docs/backlog/check-backlog.mjs)',
  );
  console.log(`Chemins markdown confrontés au disque : ${checked}`);
  console.log(`Citations mortes déclarées volontaires (${DEAD_ON_PURPOSE}) : ${waived}`);
}

if (dead.length) {
  console.error(`\n✗ ${dead.length} chemin(s) markdown cité(s) par un document normatif sont morts :\n`);
  for (const d of dead) console.error(`  ${d.file}:${d.line}  →  ${d.path}`);
  console.error(
    `\nSoit le document existe et le chemin est faux, soit il n'existe pas et la citation doit\n` +
      `partir. Si l'absence est le PROPOS de la phrase (une ardoise nomme ce qui manque), ajouter\n` +
      `${DEAD_ON_PURPOSE} en fin de ligne.\n`,
  );
  process.exit(1);
}

console.log(`✓ Aucun chemin markdown mort dans les ${scope.length} documents normatifs.`);
