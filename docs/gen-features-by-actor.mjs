#!/usr/bin/env node
// Génère `docs/features-by-actor.md` depuis `docs/features.md`.
//
// POURQUOI CE SCRIPT EXISTE. `features-by-actor.md` se déclarait « vue miroir de features.md » et
// était maintenu À LA MAIN. Il a donc gelé au 2026-04-14 pendant que sa source évoluait six fois,
// et il a fallu lui coller un bandeau « ⚠️ MIROIR DÉSYNCHRONISÉ » le 2026-08-12 — un bandeau qui
// rend le mensonge honnête sans le retirer. C'est le défaut D-15 à l'identique, celui qui avait
// rendu `INDEX.md` faux sur 213 de ses 266 entrées : *aucune liste maintenue à la main ne reste
// juste ; seule une liste dérivée le reste.* (TCK-311)
//
// Usage :
//   node docs/gen-features-by-actor.mjs           # (ré)écrit docs/features-by-actor.md
//   node docs/gen-features-by-actor.mjs --check   # n'écrit rien, sort 1 si la sortie est périmée
//
// CE QUE LES DEUX FORMES REFUSENT. Trois défauts de la SOURCE font sortir en 1 — la forme
// écriture régénère d'abord, puis échoue : le défaut est dans `features.md`, pas dans la vue.
//
//  1. **Jeton employé sans être déclaré** (TCK-420). Un jeton de la colonne « Acteurs » qui ne
//     figure pas dans le tableau `### Acteurs`. `undeclared`, l. 195.
//  2. **Acteur déclaré et employé nulle part** (TCK-447). La réciproque du n°1, qui passait en
//     silence : l'acteur se faisait recopier dans la légende du fichier généré (l. 254, qui boucle
//     sur `legend` sans condition) et n'obtenait AUCUNE section, `groups` étant filtré par
//     `byActor.has(g.key)` (l. 218). `unusedDeclared`, l. 196.
//  3. **Ligne de fonctionnalité hors d'une section `### N.M`** (TCK-447). `parseFeatures`
//     l'ignorait purement : `if (!row) continue;` puis `if (!current)` (l. 149-150). Une ligne
//     `| Pn | acteurs | … |` posée avant le premier `### N.M`, ou après un `##` qui a clos la
//     section, n'a AUCUN domaine où être rangée — le générateur ne peut donc pas la rendre,
//     seulement la refuser. Il la refuse, en la citant par son numéro de ligne. `orphans`, l. 151.
//
// POURQUOI ON EN EST LÀ. Les n°2 et n°3 ont été mesurés en vérifiant TCK-420, et ont vécu écrits
// dans cet en-tête comme angles morts, parce qu'*une garde dont on croit la portée plus large
// qu'elle n'est coûte plus cher que pas de garde du tout* — on cesse de chercher à la main ce
// qu'on la croit capable d'attraper. TCK-447 les a fermés plutôt que documentés.
//
// LES SONDES, à rejouer puis restaurer (`git checkout docs/features.md`) — chacune EXIT 1 :
//   n°1  ajouter `| 🦄 | … |` à une ligne de la colonne « Acteurs » d'une section
//   n°2  ajouter `| 🦄 | Acteur bidon |` à la seule légende `### Acteurs`
//   n°3  ajouter `| P1 | 🦄 | bidon |` sous « ## Notes de priorisation »
//
// CE QUI RESTE NON GARDÉ, et qui ne l'a jamais été — mesuré le 2026-08-29 :
//   - Une ligne dont la PRIORITÉ ne s'écrit pas `P0`..`P3` ne correspond à aucune ligne de
//     fonctionnalité pour ce script, même AU MILIEU d'une section : elle est invisible partout,
//     y compris du n°3. Sonde : `| P4 | 🦄 | bidon |` inséré dans §1.1 → EXIT 0, 233 lignes /
//     286 placements INCHANGÉS. La refuser demanderait de décider ce qu'est « une ligne qui
//     voulait être une fonctionnalité », ce qu'aucune règle du dépôt ne dit.
//   - La légende est éprouvée sur la PRÉSENCE d'un jeton, jamais sur la justesse de son libellé.
//
// Les numéros de ligne ci-dessus sont EXACTS à ce commit et se re-dérivent sans les croire. En
// SIMPLES quotes, et par `-e` : en zsh interactif, un `!` entre doubles quotes part en expansion
// d'historique et le motif cherché n'est plus celui qu'on a écrit.
//   grep -n -e 'const undeclared = ' -e 'const unusedDeclared = ' -e 'row) continue;' -e 'if (!current) {' -e 'orphans.push(' -e 'byActor.has(g.key)' -e 'for (const a of legend)' docs/gen-features-by-actor.mjs | grep -v '://'
//
// La sortie est INTÉGRALEMENT dérivée : chaque ligne de fonctionnalité vient d'une ligne de
// `features.md`, et la colonne « Domaine » renvoie à la section d'origine. Aucun contenu n'est
// ajouté ici — si une information manque dans la vue par acteur, elle manque dans `features.md`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(DOCS, 'features.md');
const OUTPUT = join(DOCS, 'features-by-actor.md');
const SOURCE_NAME = 'features.md';
const OUTPUT_NAME = 'features-by-actor.md';

// Le libellé de la colonne « Acteurs » qui désigne « tout utilisateur authentifié », par
// opposition à un acteur nommé. `features.md` l'écrit en toutes lettres, pas en emoji.
const ALL_USERS = 'Tous';

/** Parse le tableau `### Acteurs` de la légende → [{ icon, label }] dans l'ordre du document. */
function parseActorLegend(src) {
  const start = src.indexOf('### Acteurs');
  if (start === -1) throw new Error(`Légende « ### Acteurs » introuvable dans ${SOURCE_NAME}`);
  const block = src.slice(start, src.indexOf('\n---', start));
  const actors = [];
  for (const line of block.split('\n')) {
    const m = line.match(/^\|\s*([^|\s][^|]*?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    if (m[1] === 'Icône' || /^-+$/.test(m[1])) continue;
    actors.push({ icon: m[1], label: m[2] });
  }
  if (!actors.length) throw new Error(`Aucun acteur lu dans la légende de ${SOURCE_NAME}`);
  return actors;
}

/**
 * Découpe une cellule « Acteurs » en jetons.
 *
 * Les emoji concernés sont des SÉQUENCES, pas des points de code isolés : 🛡️ vaut
 * U+1F6E1 U+FE0F et 🧑‍💼 vaut U+1F9D1 U+200D U+1F4BC. Un découpage naïf par caractère les
 * casserait en morceaux qui ne correspondent à aucun acteur. On consomme donc la cellule de
 * gauche à droite en essayant d'abord les icônes connues, les plus longues en premier.
 */
function splitActors(cell, icons) {
  const trimmed = cell.trim();
  if (trimmed === ALL_USERS) return [ALL_USERS];
  const ordered = [...icons].sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  while (i < trimmed.length) {
    const hit = ordered.find((icon) => trimmed.startsWith(icon, i));
    if (hit) {
      out.push(hit);
      i += hit.length;
      continue;
    }
    // Jeton non déclaré dans la légende : on le capture entier (une grappe graphème) plutôt
    // que de l'ignorer. Le taire reviendrait à masquer un défaut de la source.
    const seg = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(trimmed.slice(i))][0];
    const piece = seg ? seg.segment : trimmed[i];
    if (piece.trim()) out.push(piece);
    i += piece.length;
  }
  return out;
}

/**
 * Parse les sections `### N.M Titre` et leurs lignes `| Pn | acteurs | fonctionnalité |`.
 *
 * Une ligne rencontrée hors d'une section n'est pas ignorée : elle part dans `orphans` avec son
 * numéro de ligne, et fera échouer le script. Elle n'a pas de « Domaine » où être rangée — la
 * rendre est impossible, la taire reviendrait à faire disparaître une fonctionnalité de la vue
 * sans que rien ne le dise (TCK-447, angle mort n°2 du ticket).
 *
 * TOUT titre de niveau 2 clôt la section courante, numéroté ou non. Ce script exceptait
 * auparavant `## N. …` : une ligne posée entre `## 2. Domaines applicatifs transverses` et
 * `### 2.1` héritait alors du §1.12 en silence. Mesuré au 2026-08-29 : 0 ligne dans ce cas, la
 * sortie est donc inchangée — mais la borne dit désormais ce qu'elle applique.
 */
function parseFeatures(src, icons) {
  const lines = src.split('\n');
  const rows = [];
  const orphans = []; // [{ line, text }] — lignes de fonctionnalité hors de toute section
  const sections = new Map(); // "1.2" → titre
  let current = null;
  for (const [i, line] of lines.entries()) {
    const head = line.match(/^###\s+(\d+\.\d+)\s+(.+?)\s*$/);
    if (head) {
      current = head[1];
      sections.set(current, head[2]);
      continue;
    }
    if (/^##\s/.test(line) && !/^###/.test(line)) {
      current = null;
      continue;
    }
    const row = line.match(/^\|\s*(P[0-3])\s*\|([^|]*)\|\s*(.+?)\s*\|\s*$/);
    if (!row) continue;
    if (!current) {
      orphans.push({ line: i + 1, text: line.trim() });
      continue;
    }
    rows.push({
      prio: row[1],
      actors: splitActors(row[2], icons),
      feature: row[3].trim(),
      section: current,
    });
  }
  if (!rows.length) throw new Error(`Aucune ligne de fonctionnalité lue dans ${SOURCE_NAME}`);
  return { rows, sections, orphans };
}

/** Ancre GitHub d'un titre markdown. */
function anchor(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function render(src) {
  const legend = parseActorLegend(src);
  const icons = legend.map((a) => a.icon);
  const { rows, sections, orphans } = parseFeatures(src, icons);

  // Regroupement : acteur → section → lignes. L'ordre des acteurs suit la légende, l'ordre des
  // sections et des lignes suit `features.md`. Rien n'est trié ici : la source porte déjà l'ordre.
  const byActor = new Map();
  for (const row of rows) {
    for (const actor of row.actors) {
      if (!byActor.has(actor)) byActor.set(actor, new Map());
      const perSection = byActor.get(actor);
      if (!perSection.has(row.section)) perSection.set(row.section, []);
      perSection.get(row.section).push(row);
    }
  }

  const known = new Set([...icons, ALL_USERS]);
  // Les deux sens, et non plus un seul : employé-sans-être-déclaré (TCK-420), et déclaré-sans-
  // être-employé (TCK-447). Le second produisait une légende qui promet un acteur suivi d'aucune
  // section — la vue affirmait alors ce que la source ne dit nulle part.
  const undeclared = [...byActor.keys()].filter((a) => !known.has(a));
  const unusedDeclared = legend.map((a) => a.icon).filter((icon) => !byActor.has(icon));

  const groups = [
    ...legend.map((a) => ({ key: a.icon, title: `${a.icon} ${a.label}`, note: null })),
    {
      key: ALL_USERS,
      title: '👥 Tous les utilisateurs authentifiés',
      note:
        'Fonctionnalités transverses, marquées « Tous » dans `' +
        SOURCE_NAME +
        '` : elles valent pour tout utilisateur authentifié, quel que soit son profil. Elles ne ' +
        'sont pas répétées dans les sections par acteur ci-dessus.',
    },
    ...undeclared.map((a) => ({
      key: a,
      title: `⚠️ ${a} — acteur non déclaré dans la légende de \`${SOURCE_NAME}\``,
      note:
        'Ce jeton apparaît dans la colonne « Acteurs » de `' +
        SOURCE_NAME +
        '` sans figurer dans son tableau `### Acteurs`. Le générateur le remonte plutôt que de ' +
        "le taire : c'est un défaut de la source, pas de la vue.",
    })),
  ].filter((g) => byActor.has(g.key));

  const out = [];
  out.push('# Takussan — Fonctionnalités par acteur');
  out.push('');
  out.push(`> ## 🤖 FICHIER GÉNÉRÉ — ne pas éditer à la main`);
  out.push('>');
  out.push(
    `> Produit par \`node docs/gen-features-by-actor.mjs\` depuis [\`${SOURCE_NAME}\`](./${SOURCE_NAME}),`,
  );
  out.push(
    '> qui reste la **source de vérité**. Toute correction se fait dans la source, puis on régénère.',
  );
  out.push('>');
  out.push(
    "> Ce fichier était maintenu à la main. Il a gelé au 2026-04-14 pendant que sa source évoluait",
  );
  out.push(
    '> six fois, et a porté six semaines un bandeau « miroir désynchronisé » — un aveu, pas un',
  );
  out.push('> correctif. Il est désormais dérivé (TCK-311).');
  out.push('');
  out.push(
    'Vue par acteur du catalogue fonctionnel. Chaque ligne provient de la section indiquée en',
  );
  out.push(
    'colonne **Domaine**. Une fonctionnalité portée par plusieurs acteurs apparaît dans la section',
  );
  out.push('de chacun d\'eux — le dédoublement est voulu, la source de vérité ne l\'est pas.');
  out.push('');
  out.push('---');
  out.push('');
  out.push('## Légende');
  out.push('');
  out.push('| Icône | Acteur |');
  out.push('|-------|--------|');
  for (const a of legend) out.push(`| ${a.icon} | ${a.label} |`);
  out.push('');
  out.push('| Code | Signification |');
  out.push('|------|---------------|');
  out.push('| **P0** | MVP bloquant |');
  out.push('| **P1** | MVP important |');
  out.push('| **P2** | V2 |');
  out.push('| **P3** | Futur / nice-to-have |');
  out.push('');
  out.push('---');
  out.push('');
  out.push('## Sommaire');
  out.push('');
  groups.forEach((g, i) => {
    const count = [...byActor.get(g.key).values()].reduce((n, l) => n + l.length, 0);
    out.push(
      `${i + 1}. [${g.title}](#${anchor(g.title)}) — ${count} fonctionnalité${count > 1 ? 's' : ''}`,
    );
  });
  out.push('');
  out.push('---');
  out.push('');

  for (const g of groups) {
    out.push(`## ${g.title}`);
    out.push('');
    if (g.note) {
      out.push(`> ${g.note}`);
      out.push('');
    }
    const perSection = byActor.get(g.key);
    for (const [sectionId, list] of perSection) {
      out.push(`### §${sectionId} ${sections.get(sectionId)}`);
      out.push('');
      out.push('| Prio | Domaine | Fonctionnalité |');
      out.push('|------|---------|----------------|');
      for (const r of list) out.push(`| ${r.prio} | §${sectionId} | ${r.feature} |`);
      out.push('');
    }
    out.push('---');
    out.push('');
  }

  const total = rows.length;
  const placements = [...byActor.values()].reduce(
    (n, m) => n + [...m.values()].reduce((k, l) => k + l.length, 0),
    0,
  );
  out.push('## Provenance');
  out.push('');
  out.push(
    `- Source : [\`${SOURCE_NAME}\`](./${SOURCE_NAME}) — **${total}** lignes de fonctionnalité lues,`,
  );
  out.push(`  réparties en **${placements}** placements (une ligne multi-acteurs compte une fois par acteur).`);
  out.push(`- Générateur : \`docs/gen-features-by-actor.mjs\`.`);
  out.push(
    '- Fraîcheur vérifiée en CI par `node docs/gen-features-by-actor.mjs --check`, qui échoue si',
  );
  out.push('  cette sortie ne correspond plus à sa source.');
  out.push('');
  if (undeclared.length) {
    out.push(
      `> ⚠️ ${undeclared.length} jeton(s) de la colonne « Acteurs » ne figurent pas dans la légende de ` +
        `\`${SOURCE_NAME}\` : ${undeclared.join(', ')}. À corriger dans la source.`,
    );
    out.push('');
  }
  if (unusedDeclared.length) {
    out.push(
      `> ⚠️ ${unusedDeclared.length} acteur(s) de la légende de \`${SOURCE_NAME}\` ne portent aucune ` +
        `fonctionnalité : ${unusedDeclared.join(', ')}. Ils apparaissent dans la légende ci-dessus ` +
        'et n\'ont aucune section. À corriger dans la source.',
    );
    out.push('');
  }
  if (orphans.length) {
    out.push(
      `> ⚠️ ${orphans.length} ligne(s) de fonctionnalité de \`${SOURCE_NAME}\` sont hors de toute ` +
        `section \`### N.M\` (l. ${orphans.map((o) => o.line).join(', ')}) : sans domaine où les ` +
        'ranger, elles ne sont rendues nulle part. À corriger dans la source.',
    );
    out.push('');
  }
  return { text: out.join('\n'), undeclared, unusedDeclared, orphans, total, placements };
}

const src = readFileSync(SOURCE, 'utf8');
const { text, undeclared, unusedDeclared, orphans, total, placements } = render(src);
const check = process.argv.includes('--check');

/**
 * Un défaut de la source est un ÉCHEC, pas un avertissement (TCK-420, élargi par TCK-447).
 *
 * Ce script a émis `⚠ 1 acteur(s) non déclaré(s) … : 🔧` en sortant en **0** pendant tout le
 * temps où 🔧 manquait à la légende. Aucune CI ne casse sur une sortie 0 : l'écart ne se lisait
 * donc que si quelqu'un exécutait la commande ET lisait sa sortie — c'est-à-dire jamais. TCK-379
 * a fini par trancher le menu d'un prestataire sans que `features.md` ne dise rien de lui, et la
 * décision s'est écrite dans un commentaire de code.
 *
 * *Un avertissement qui sort en 0 n'est pas une garde ; c'est une trace que personne ne lit.*
 *
 * En mode écriture, la sortie est produite AVANT de sortir en 1 : le défaut est dans la source,
 * pas dans la vue, et refuser de régénérer punirait le mauvais fichier.
 *
 * Les trois défauts sont RAPPORTÉS ENSEMBLE avant de sortir. Un script qui s'arrête au premier
 * fait relancer autant de fois qu'il y a de défauts, et chaque relance coûte le temps de la CI.
 */
function failOnSourceDefects() {
  const problems = [];
  if (undeclared.length) {
    problems.push(
      `✗ ${undeclared.length} acteur(s) non déclaré(s) dans la légende de ${SOURCE_NAME} : ${undeclared.join(', ')}\n` +
        `  Chaque jeton de la colonne « Acteurs » doit figurer dans le tableau \`### Acteurs\` de ${SOURCE_NAME}.`,
    );
  }
  if (unusedDeclared.length) {
    problems.push(
      `✗ ${unusedDeclared.length} acteur(s) déclaré(s) dans la légende de ${SOURCE_NAME} et employé(s) nulle part : ${unusedDeclared.join(', ')}\n` +
        '  Un acteur en légende sans aucune fonctionnalité produit une vue qui le promet et ne le sert pas :\n' +
        `  il figure dans la légende générée et n'obtient aucune section. Le marquer sur au moins une ligne\n` +
        `  de ${SOURCE_NAME}, ou le retirer de la légende.`,
    );
  }
  if (orphans.length) {
    problems.push(
      `✗ ${orphans.length} ligne(s) de fonctionnalité hors de toute section \`### N.M\` dans ${SOURCE_NAME} :\n` +
        orphans.map((o) => `    l. ${o.line} : ${o.text}`).join('\n') +
        '\n  Une telle ligne n\'a pas de « Domaine » où être rangée : le générateur ne peut pas la rendre,\n' +
        '  seulement la refuser. La déplacer sous une section `### N.M`.',
    );
  }
  if (!problems.length) return;
  console.error(problems.join('\n'));
  process.exit(1);
}

if (check) {
  let current = null;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    console.error(`✗ ${OUTPUT_NAME} est absent. Lancer : node docs/gen-features-by-actor.mjs`);
    process.exit(1);
  }
  if (current !== text) {
    console.error(
      `✗ ${OUTPUT_NAME} ne suit plus ${SOURCE_NAME}.\n` +
        `  Lancer : node docs/gen-features-by-actor.mjs`,
    );
    process.exit(1);
  }
  failOnSourceDefects();
  console.log(`✓ ${OUTPUT_NAME} est à jour de ${SOURCE_NAME} (${total} lignes, ${placements} placements).`);
} else {
  writeFileSync(OUTPUT, text);
  console.log(`✓ ${OUTPUT_NAME} régénéré depuis ${SOURCE_NAME} (${total} lignes, ${placements} placements).`);
  failOnSourceDefects();
}
