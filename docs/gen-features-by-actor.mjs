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
// Les DEUX formes sortent aussi en 1 si `features.md` marque un acteur qui n'est pas dans sa
// légende (TCK-420) — la forme écriture régénère d'abord, puis échoue.
//
// OÙ CETTE GARDE S'ARRÊTE. Elle ne couvre qu'UN sens et qu'UN emplacement ; les deux angles morts
// ci-dessous ont été mesurés (TCK-420), et sont écrits ici parce qu'*une garde dont on croit la
// portée plus large qu'elle n'est coûte plus cher que pas de garde du tout* — on cesse de
// chercher à la main ce qu'on la croit capable d'attraper.
//
//  1. **Sens unique : déclaré-mais-inemployé passe en silence.** `undeclared` (l. 165) ne calcule
//     que « employé sans être déclaré ». La réciproque n'est calculée nulle part : un acteur ajouté
//     à la légende et marqué sur aucune ligne sort en 0 dans les deux formes, se fait recopier
//     dans la légende du fichier généré (l. 223, qui boucle sur `legend` sans condition) et
//     n'obtient AUCUNE section — `groups` est filtré par `byActor.has(g.key)` (l. 187). Mesuré :
//     un `| 🦄 | … |` ajouté à la légende seule → EXIT 0, 🦄 présent dans la légende générée,
//     0 section sous lui.
//  2. **Hors d'une section `### N.M`, une ligne de tableau est INVISIBLE.** `parseFeatures` fait
//     `if (!row || !current) continue;` (l. 126) : tant qu'aucun titre `### N.M` n'a été
//     rencontré — ou après qu'un `##` non numéroté a remis `current` à `null` —, toute ligne
//     `| Pn | acteurs | … |` est ignorée, acteur non déclaré compris. Mesuré : une ligne
//     `| P1 | 🦄 | … |` ajoutée sous « ## Notes de priorisation » → EXIT 0 et compte de
//     placements INCHANGÉ (286), donc pas même lue.
//
// Aucun des deux n'est exigé par les AC de TCK-420 et aucun n'est corrigé ici : les nommer est ce
// qui permettra de décider plus tard s'ils valent un ticket. Les quatre numéros ci-dessus sont
// EXACTS à ce commit et se re-dérivent sans les croire :
//   grep -n "if (!row || !current) continue;\|const undeclared = \|byActor.has(g.key)\|for (const a of legend)" docs/gen-features-by-actor.mjs
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

/** Parse les sections `### N.M Titre` et leurs lignes `| Pn | acteurs | fonctionnalité |`. */
function parseFeatures(src, icons) {
  const lines = src.split('\n');
  const rows = [];
  const sections = new Map(); // "1.2" → titre
  let current = null;
  for (const line of lines) {
    const head = line.match(/^###\s+(\d+\.\d+)\s+(.+?)\s*$/);
    if (head) {
      current = head[1];
      sections.set(current, head[2]);
      continue;
    }
    if (/^##\s/.test(line) && !/^###/.test(line)) {
      // Un titre de niveau 2 (« ## Notes de priorisation ») clôt la section courante.
      if (!/^##\s+\d/.test(line)) current = null;
      continue;
    }
    const row = line.match(/^\|\s*(P[0-3])\s*\|([^|]*)\|\s*(.+?)\s*\|\s*$/);
    if (!row || !current) continue;
    rows.push({
      prio: row[1],
      actors: splitActors(row[2], icons),
      feature: row[3].trim(),
      section: current,
    });
  }
  if (!rows.length) throw new Error(`Aucune ligne de fonctionnalité lue dans ${SOURCE_NAME}`);
  return { rows, sections };
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
  const { rows, sections } = parseFeatures(src, icons);

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
  const undeclared = [...byActor.keys()].filter((a) => !known.has(a));

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
  return { text: out.join('\n'), undeclared, total, placements };
}

const src = readFileSync(SOURCE, 'utf8');
const { text, undeclared, total, placements } = render(src);
const check = process.argv.includes('--check');

/**
 * Un acteur non déclaré est un ÉCHEC, pas un avertissement (TCK-420).
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
 */
function failOnUndeclared() {
  if (!undeclared.length) return;
  console.error(
    `✗ ${undeclared.length} acteur(s) non déclaré(s) dans la légende de ${SOURCE_NAME} : ${undeclared.join(', ')}\n` +
      `  Chaque jeton de la colonne « Acteurs » doit figurer dans le tableau \`### Acteurs\` de ${SOURCE_NAME}.`,
  );
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
  failOnUndeclared();
  console.log(`✓ ${OUTPUT_NAME} est à jour de ${SOURCE_NAME} (${total} lignes, ${placements} placements).`);
} else {
  writeFileSync(OUTPUT, text);
  console.log(`✓ ${OUTPUT_NAME} régénéré depuis ${SOURCE_NAME} (${total} lignes, ${placements} placements).`);
  failOnUndeclared();
}
