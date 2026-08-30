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
//     figure pas dans le tableau `### Acteurs`. `undeclared`, l. 257.
//  2. **Acteur déclaré et employé nulle part** (TCK-447). La réciproque du n°1, qui passait en
//     silence : l'acteur se faisait recopier dans la légende du fichier généré (l. 316, qui boucle
//     sur `legend` sans condition) et n'obtenait AUCUNE section, `groups` étant filtré par
//     `byActor.has(g.key)` (l. 280). `unusedDeclared`, l. 258.
//  3. **Ligne de fonctionnalité hors d'une section `### N.M`** (TCK-447). `parseFeatures`
//     l'ignorait purement : `if (!row) continue;` puis `if (!current)` (l. 211-212). Une ligne
//     `| Pn | acteurs | … |` posée avant le premier `### N.M`, ou après un `##` qui a clos la
//     section, n'a AUCUN domaine où être rangée — le générateur ne peut donc pas la rendre,
//     seulement la refuser. Il la refuse, en la citant par son numéro de ligne. `orphans`, l. 213.
//
// POURQUOI ON EN EST LÀ. Les n°2 et n°3 ont été mesurés en vérifiant TCK-420, et ont vécu écrits
// dans cet en-tête comme angles morts, parce qu'*une garde dont on croit la portée plus large
// qu'elle n'est coûte plus cher que pas de garde du tout* — on cesse de chercher à la main ce
// qu'on la croit capable d'attraper. TCK-447 les a fermés plutôt que documentés.
//
// LES SONDES SONT DEVENUES UN CORPUS (TCK-473). Elles vivaient ici en trois lignes à rejouer à la
// main, et *une sonde qu'on doit penser à lancer n'est pas une garde, c'est une note*. Le corpus
// est en bas de ce fichier, tourne à CHAQUE invocation avant de lire le dépôt, et jette au lieu
// d'avertir. Il vit ENTIÈREMENT EN MÉMOIRE : aucun cas n'écrit dans `features.md`, qu'une
// exécution interrompue laisserait cassé.
//
// CE QUE LES SONDES DE L'EN-TÊTE NE PROUVAIENT PAS — mesuré le 2026-08-30, avant d'écrire le
// corpus, en les rejouant à la lettre sur une COPIE du dépôt.
//
//   Les trois sortaient bien en 1 sous `--check`. Mais toutes les trois par le MÊME message :
//
//     ✗ features-by-actor.md ne suit plus features.md.
//
//   `--check` compare la fraîcheur AVANT d'appeler `failOnSourceDefects()`, et toute mutation de
//   la source périme la vue. Les trois sondes prouvaient donc la garde de FRAÎCHEUR, trois fois,
//   et **rien du tout** des trois gardes qu'elles prétendaient éprouver — dans le seul mode que
//   la CI exécute. Retirer les trois branches de `failOnSourceDefects()` ne les aurait donc PAS
//   fait changer d'avis : elles seraient restées rouges, par la garde de fraîcheur, et on aurait
//   lu ce rouge comme la preuve de gardes qui n'existaient plus.
//
//   *Une sonde qui ne dit pas PAR QUEL CHEMIN elle a échoué ne garde pas ce qu'elle croit garder.*
//   D'où les GENRES portés par chaque refus, et l'égalité stricte entre genres attendus et genres
//   obtenus dans le corpus : « ça a échoué » n'y est jamais un succès.
//
//   Elles tiraient bien par le bon chemin en mode ÉCRITURE, lui qui régénère d'abord — et c'est
//   probablement là qu'elles avaient été mises au point. La forme rejouée n'était pas celle de
//   la CI.
//
// COMBIEN DE GARDES — la réponse mesurée est HUIT, pas trois. Aux trois défauts de source
// ci-dessus s'ajoutent les deux verdicts de fraîcheur de `--check` (`sortie-absente`,
// `sortie-perimee`) et les trois invariants fatals de l'analyse (`legende-absente`,
// `legende-vide`, `aucune-ligne`). Les huit sont énumérés dans `GENRES`, et chacun doit être
// exercé par au moins un cas — un détecteur qu'aucun cas n'atteint se retire en silence.
//
// CE QUE LE CORPUS COÛTE — mesuré le 2026-08-30, AVANT et APRÈS entrelacés dans la même fenêtre
// (2 × 15 exécutions de chaque, alternées), parce qu'un temps absolu ne dit rien d'une machine qui
// portait alors huit agents : `uptime` 3,22 → 3,52 sur 8 cœurs (`sysctl -n hw.ncpu`).
//   médiane AVANT 59,0 ms · APRÈS 69,9 ms → **+10,9 ms (+18,6 %)**
// L'essentiel des 59 ms est le démarrage de Node ; le corpus lui-même est la dizaine de
// millisecondes ajoutée, pour 20 cas. `--check` reste du même ordre de grandeur, et la CI le
// rejoue une fois par PR.
//
// CE QUI A ÉTÉ DÉMONTÉ POUR VÉRIFIER, dans l'ORDRE qui trouve les trous (corpus d'abord, garde
// ensuite) — chaque modification prouvée par `md5` avant lecture du résultat, restaurée par `cp` :
//   geste 1 seul  (les 4 boucles → `for (const cas of [])`)                        → EXIT 1
//   geste 1 PUIS geste 2 (+ branche `undeclared` démontée)                         → EXIT 1
//   geste 1 + contrôle des genres neutralisé PUIS geste 2                          → EXIT 1
//   les trois + le contrôle des BORNES qui vit dehors, retiré                      → EXIT 0
// Il faut donc TROIS gestes distincts pour faire taire cette garde, et même le troisième laisse
// la trace dans la ligne de succès : elle imprime « corpus : 0 cas rouges, 0 témoins … ». *Un
// corpus dont personne ne voit la taille est un corpus qu'on peut vider.*
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

/**
 * Fabrique un refus PORTEUR DE SON GENRE.
 *
 * Le genre n'est pas décoratif : c'est ce qui permet au corpus d'épreuve (plus bas) d'exiger
 * qu'un cas rougisse **par le chemin qu'il prétend éprouver**, et pas par un autre. Un corpus qui
 * se contente de « ça a échoué » ne distingue pas une garde qui tire d'une garde voisine qui la
 * masque — c'est exactement le défaut qu'avaient les trois sondes manuelles de l'en-tête
 * (cf. « CE QUE LES SONDES DE L'EN-TÊTE NE PROUVAIENT PAS »).
 */
function refus(genre, message) {
  const e = new Error(message);
  e.genre = genre;
  return e;
}

/** Parse le tableau `### Acteurs` de la légende → [{ icon, label }] dans l'ordre du document. */
function parseActorLegend(src) {
  const start = src.indexOf('### Acteurs');
  if (start === -1) throw refus('legende-absente', `Légende « ### Acteurs » introuvable dans ${SOURCE_NAME}`);
  const block = src.slice(start, src.indexOf('\n---', start));
  const actors = [];
  for (const line of block.split('\n')) {
    const m = line.match(/^\|\s*([^|\s][^|]*?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    if (m[1] === 'Icône' || /^-+$/.test(m[1])) continue;
    actors.push({ icon: m[1], label: m[2] });
  }
  if (!actors.length) throw refus('legende-vide', `Aucun acteur lu dans la légende de ${SOURCE_NAME}`);
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
  if (!rows.length) throw refus('aucune-ligne', `Aucune ligne de fonctionnalité lue dans ${SOURCE_NAME}`);
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
 *
 * ⚠ Cette fonction est PURE et prend son argument : c'est ce qui la rend éprouvable. Elle lisait
 * auparavant les variables de module produites par l'unique `render()` du dépôt — un corpus ne
 * pouvait donc pas l'atteindre sans écrire dans `features.md`, ce que le ticket TCK-473 interdit
 * explicitement (« qu'une exécution interrompue laisserait cassé »). Elle DÉCIDE ici et n'imprime
 * rien : l'impression et le `process.exit` vivent chez l'appelant, sans quoi le corpus tuerait le
 * processus au premier cas rouge.
 */
function verdictsDeSource({ undeclared, unusedDeclared, orphans }) {
  const problems = [];
  if (undeclared.length) {
    problems.push({
      genre: 'undeclared',
      message:
        `✗ ${undeclared.length} acteur(s) non déclaré(s) dans la légende de ${SOURCE_NAME} : ${undeclared.join(', ')}\n` +
        `  Chaque jeton de la colonne « Acteurs » doit figurer dans le tableau \`### Acteurs\` de ${SOURCE_NAME}.`,
    });
  }
  if (unusedDeclared.length) {
    problems.push({
      genre: 'unusedDeclared',
      message:
        `✗ ${unusedDeclared.length} acteur(s) déclaré(s) dans la légende de ${SOURCE_NAME} et employé(s) nulle part : ${unusedDeclared.join(', ')}\n` +
        '  Un acteur en légende sans aucune fonctionnalité produit une vue qui le promet et ne le sert pas :\n' +
        `  il figure dans la légende générée et n'obtient aucune section. Le marquer sur au moins une ligne\n` +
        `  de ${SOURCE_NAME}, ou le retirer de la légende.`,
    });
  }
  if (orphans.length) {
    problems.push({
      genre: 'orphans',
      message:
        `✗ ${orphans.length} ligne(s) de fonctionnalité hors de toute section \`### N.M\` dans ${SOURCE_NAME} :\n` +
        orphans.map((o) => `    l. ${o.line} : ${o.text}`).join('\n') +
        '\n  Une telle ligne n\'a pas de « Domaine » où être rangée : le générateur ne peut pas la rendre,\n' +
        '  seulement la refuser. La déplacer sous une section `### N.M`.',
    });
  }
  return problems;
}

/**
 * Le verdict de FRAÎCHEUR de `--check` — la quatrième et la cinquième garde de ce script, que le
 * ticket TCK-473 ne comptait pas et que les sondes de l'en-tête faisaient tirer sans le dire.
 *
 * `current === null` vaut « sortie absente » ; c'est l'appelant qui traduit l'échec de lecture,
 * parce qu'un corpus n'a pas de fichier à ne pas lire.
 */
function verdictFraicheur(current, text) {
  if (current === null) {
    return {
      genre: 'sortie-absente',
      message: `✗ ${OUTPUT_NAME} est absent. Lancer : node docs/gen-features-by-actor.mjs`,
    };
  }
  if (current !== text) {
    return {
      genre: 'sortie-perimee',
      message:
        `✗ ${OUTPUT_NAME} ne suit plus ${SOURCE_NAME}.\n` +
        `  Lancer : node docs/gen-features-by-actor.mjs`,
    };
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────────────────────── */
/* LE CORPUS D'ÉPREUVE (TCK-473) — voir l'en-tête, « CE QUE LES SONDES … NE PROUVAIENT PAS ».     */
/* ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * La source minimale CONFORME dont dérivent tous les cas. Elle vit en mémoire, jamais sur le
 * disque : le ticket l'exige, et une exécution interrompue ne doit laisser aucun fichier du dépôt
 * modifié.
 *
 * Elle porte délibérément les trois formes d'icône que `splitActors` doit savoir ne PAS casser :
 * un point de code simple (🏢), une séquence ZWJ (🧑‍💼 = U+1F9D1 U+200D U+1F4BC) et un sélecteur
 * de variante (🛡️ = U+1F6E1 U+FE0F). Si le découpage régressait, ces jetons éclateraient en
 * morceaux et feraient tirer `undeclared` ET `unusedDeclared` — les témoins verts ci-dessous
 * l'attraperaient donc sans qu'aucun cas n'ait à nommer le découpage.
 */
const BASE = [
  '# Titre',
  '',
  '### Acteurs',
  '',
  '| Icône | Acteur |',
  '|-------|--------|',
  '| 🏢 | Bailleur |',
  '| 🧑‍💼 | Agent immobilier |',
  '| 🛡️ | Admin |',
  '',
  '---',
  '',
  '## 1. Domaines métier',
  '',
  '### 1.1 Gestion des biens',
  '',
  '| Prio | Acteurs | Fonctionnalité |',
  '|------|---------|----------------|',
  '| P0 | 🏢🧑‍💼 | Créer un bien |',
  '| P1 | 🛡️ | Modérer un bien |',
  '| P2 | Tous | Se connecter |',
  '',
  '## Notes de priorisation',
  '',
  '- rien à signaler',
  '',
].join('\n');

/** Insère `ligne` juste après la première occurrence de `apres`. */
function apres(src, ancre, ...ajouts) {
  const lines = src.split('\n');
  const i = lines.indexOf(ancre);
  if (i === -1) throw new Error(`CORPUS CASSÉ — ancre introuvable : ${ancre}`);
  return [...lines.slice(0, i + 1), ...ajouts, ...lines.slice(i + 1)].join('\n');
}

/** Remplace la première occurrence exacte de `avant` par `apres`. */
function remplace(src, avant, apres_) {
  if (!src.includes(avant)) throw new Error(`CORPUS CASSÉ — motif introuvable : ${avant}`);
  return src.replace(avant, apres_);
}

/**
 * Les cas qui DOIVENT rougir, chacun avec le ou les GENRES attendus — jamais « au moins un
 * constat ».
 *
 * Les genres, et pas un simple compte : sans eux, un cas qui prétend éprouver `orphans` mais
 * rougit par `undeclared` passerait pour vert, et la garde qu'il prétend tenir pourrait
 * disparaître sans que rien ne bronche. C'est la leçon déjà payée par
 * `scripts/check-auth-interrupts.mjs`.
 */
const EPREUVES_ROUGES = [
  {
    nom: 'n°1 — jeton employé sans être déclaré (la sonde 🦄 de l’en-tête)',
    src: remplace(BASE, '| P0 | 🏢🧑‍💼 |', '| P0 | 🏢🧑‍💼🦄 |'),
    genres: ['undeclared'],
  },
  {
    nom: 'n°1 bis — jeton non déclaré qui n’est pas un emoji (chemin grappe de `splitActors`)',
    src: remplace(BASE, '| P0 | 🏢🧑‍💼 |', '| P0 | 🏢🧑‍💼Z |'),
    genres: ['undeclared'],
  },
  {
    nom: 'n°2 — acteur déclaré et employé nulle part (la sonde 🦄 de l’en-tête)',
    src: apres(BASE, '| 🛡️ | Admin |', '| 🦄 | Acteur bidon |'),
    genres: ['unusedDeclared'],
  },
  {
    nom: 'n°2 bis — acteur déclaré à SÉQUENCE ZWJ et employé nulle part',
    src: apres(BASE, '| 🛡️ | Admin |', '| 👩‍🔧 | Technicienne |'),
    genres: ['unusedDeclared'],
  },
  {
    nom: 'n°3 — ligne de fonctionnalité APRÈS un `##` qui a clos la section (sonde de l’en-tête)',
    src: apres(BASE, '## Notes de priorisation', '', '| P1 | 🏢 | bidon |'),
    genres: ['orphans'],
  },
  {
    nom: 'n°3 bis — ligne posée entre un `## N.` numéroté et le premier `### N.M`',
    src: apres(BASE, '## 1. Domaines métier', '', '| P1 | 🏢 | bidon |'),
    genres: ['orphans'],
  },
  {
    nom: 'n°3 ter — ligne posée AVANT toute section, sous la légende',
    src: apres(BASE, '# Titre', '', '| P1 | 🏢 | bidon |'),
    genres: ['orphans'],
  },
  {
    nom: 'les trois ENSEMBLE — le rapport groupé promis par le docblock',
    src: apres(
      apres(remplace(BASE, '| P0 | 🏢🧑‍💼 |', '| P0 | 🏢🧑‍💼🦄 |'), '| 🛡️ | Admin |', '| 🐙 | Poulpe |'),
      '## Notes de priorisation',
      '',
      '| P1 | 🏢 | bidon |',
    ),
    genres: ['undeclared', 'unusedDeclared', 'orphans'],
  },
];

/**
 * Les TÉMOINS — sources légitimes qui doivent passer. Ils sont la moitié du corpus que la
 * première rédaction d'une garde oublie, et sans laquelle `return ['tout est faux']` serait vert.
 */
const EPREUVES_VERTES = [
  { nom: 'la source de base, conforme', src: BASE },
  {
    nom: 'une ligne « Tous » supplémentaire — le libellé n’est pas un acteur non déclaré',
    src: apres(BASE, '| P2 | Tous | Se connecter |', '| P3 | Tous | Changer de mot de passe |'),
  },
  {
    nom: 'un `##` NON numéroté clôt la section, et la suite est bien rangée sous un `### N.M`',
    src: apres(
      BASE,
      '- rien à signaler',
      '',
      '## Autre chapitre',
      '',
      '### 2.1 Paiements',
      '',
      '| Prio | Acteurs | Fonctionnalité |',
      '|------|---------|----------------|',
      '| P0 | 🏢 | Encaisser un loyer |',
    ),
  },
  {
    nom: 'NON GARDÉ, et assumé — une priorité `P4` hors section reste invisible (en-tête)',
    src: apres(BASE, '## Notes de priorisation', '', '| P4 | 🏢 | bidon |'),
  },
  {
    nom: 'NON GARDÉ, et assumé — une priorité `P4` DANS une section reste invisible (en-tête)',
    src: apres(BASE, '| P2 | Tous | Se connecter |', '| P4 | 🦄 | bidon |'),
  },
  {
    nom: 'un acteur employé SEUL dans sa cellule, sans voisin à découper',
    src: remplace(BASE, '| P0 | 🏢🧑‍💼 |', '| P0 | 🧑‍💼 |').replace(
      '| P1 | 🛡️ | Modérer un bien |',
      '| P1 | 🛡️🏢 | Modérer un bien |',
    ),
  },
];

/** Les cas qui doivent JETER, avec le genre porté par le refus. */
const EPREUVES_FATALES = [
  {
    nom: 'légende `### Acteurs` absente',
    src: BASE.replace('### Acteurs', '### Personae'),
    genre: 'legende-absente',
  },
  {
    nom: 'légende présente mais sans aucune ligne d’acteur',
    src: BASE.split('\n')
      .filter((l) => !/^\| (🏢|🧑‍💼|🛡️) \|/.test(l))
      .join('\n'),
    genre: 'legende-vide',
  },
  {
    nom: 'aucune ligne de fonctionnalité dans toute la source',
    src: BASE.split('\n')
      .filter((l) => !/^\| P[0-3] \|/.test(l))
      .join('\n'),
    genre: 'aucune-ligne',
  },
];

/** Les cas de FRAÎCHEUR, joués sur `verdictFraicheur` — deux rouges, un témoin. */
const EPREUVES_FRAICHEUR = [
  { nom: 'sortie absente', args: [null, 'x'], genre: 'sortie-absente' },
  { nom: 'sortie périmée', args: ['ancien', 'neuf'], genre: 'sortie-perimee' },
  { nom: 'sortie à jour — le témoin', args: ['pareil', 'pareil'], genre: null },
];

/**
 * Les GENRES de refus que ce script sait produire — la réponse mesurée à « combien de gardes ? ».
 *
 * Le ticket TCK-473 en annonçait TROIS ; il y en a HUIT, et les cinq oubliés ne sont pas des
 * détails : deux d'entre eux (`sortie-absente`, `sortie-perimee`) sont précisément ceux qui
 * masquaient les trois autres sous `--check`. Chacun doit être exercé par au moins un cas rouge,
 * sans quoi un détecteur peut disparaître sans que le corpus s'en aperçoive.
 */
const GENRES = [
  'undeclared',
  'unusedDeclared',
  'orphans',
  'sortie-absente',
  'sortie-perimee',
  'legende-absente',
  'legende-vide',
  'aucune-ligne',
];

/**
 * LES BORNES DÉCLARÉES, et elles décrivent les bornes APPLIQUÉES (AC3 de TCK-473).
 *
 * Elles sont comparées aux cas RÉELLEMENT EXÉCUTÉS, jamais à `.length` des tableaux. La
 * différence n'est pas théorique : elle a été mesurée sur `scripts/check-enum-namespaces.mjs` le
 * 2026-08-29, où neutraliser les boucles (`for (const cas of [])`) puis démonter la branche de
 * garde rendait `exit 0`, l'inégalité portant sur une taille de tableau que personne n'avait
 * touchée. *Un corpus qu'on ne parcourt pas est un corpus vide, quelle que soit sa longueur.*
 *
 * Retirer un cas d'un des quatre tableaux fait donc rougir le COMPTE, avant même que la garde
 * qu'il éprouvait ne soit touchée.
 */
const BORNES = { ROUGES: 8, VERTS: 6, FATALES: 3, FRAICHEUR: 3, GENRES: 8 };

/**
 * Le corpus, joué à CHAQUE invocation, AVANT de lire quoi que ce soit du dépôt — et il jette au
 * lieu d'avertir.
 *
 * Il n'emprunte que les fonctions de production : `render`, `verdictsDeSource`,
 * `verdictFraicheur`. Une auto-épreuve qui recoderait la décision n'éprouverait qu'elle-même.
 */
function corpusDEpreuve() {
  let rouges = 0;
  let verts = 0;
  let fatales = 0;
  let fraicheur = 0;
  const exerces = new Set();

  for (const cas of EPREUVES_ROUGES) {
    const genres = verdictsDeSource(render(cas.src)).map((p) => p.genre);
    const attendus = [...cas.genres].sort().join(', ');
    const obtenus = [...genres].sort().join(', ');
    if (obtenus !== attendus) {
      throw new Error(
        `CORPUS D'ÉPREUVE ÉCHOUÉ — la garde ne tire plus par le chemin annoncé : ${cas.nom}\n` +
          `  attendu : [${attendus}]\n  obtenu  : [${obtenus || '—'}]`,
      );
    }
    for (const g of genres) exerces.add(g);
    rouges += 1;
  }

  for (const cas of EPREUVES_VERTES) {
    const problems = verdictsDeSource(render(cas.src));
    if (problems.length) {
      throw new Error(
        `CORPUS D'ÉPREUVE ÉCHOUÉ — la garde refuse à tort : ${cas.nom}\n` +
          `  → ${problems.map((p) => p.genre).join(', ')}`,
      );
    }
    verts += 1;
  }

  for (const cas of EPREUVES_FATALES) {
    let vu = null;
    try {
      render(cas.src);
    } catch (e) {
      vu = e.genre ?? '(refus sans genre)';
    }
    if (vu !== cas.genre) {
      throw new Error(
        `CORPUS D'ÉPREUVE ÉCHOUÉ — invariant fatal muet ou déplacé : ${cas.nom}\n` +
          `  attendu : ${cas.genre}\n  obtenu  : ${vu ?? '(aucun refus)'}`,
      );
    }
    exerces.add(cas.genre);
    fatales += 1;
  }

  for (const cas of EPREUVES_FRAICHEUR) {
    const v = verdictFraicheur(...cas.args);
    const genre = v ? v.genre : null;
    if (genre !== cas.genre) {
      throw new Error(
        `CORPUS D'ÉPREUVE ÉCHOUÉ — verdict de fraîcheur faux : ${cas.nom}\n` +
          `  attendu : ${cas.genre ?? '(aucun)'}\n  obtenu  : ${genre ?? '(aucun)'}`,
      );
    }
    if (genre) exerces.add(genre);
    fraicheur += 1;
  }

  // Chaque genre doit avoir été exercé. Un détecteur qu'aucun cas n'atteint est un détecteur
  // qu'on peut retirer en silence — c'est l'état d'où ce corpus vient.
  const muets = GENRES.filter((g) => !exerces.has(g));
  if (muets.length) {
    throw new Error(
      `CORPUS D'ÉPREUVE ÉCHOUÉ — ${muets.length} genre(s) de refus qu'aucun cas n'exerce : ${muets.join(', ')}`,
    );
  }

  return { rouges, verts, fatales, fraicheur, genres: exerces.size };
}

/* ──────────────────────────────────────────────────────────────────────────────────────────── */

const corpus = corpusDEpreuve();

/**
 * La vérification des bornes vit DEHORS de {@link corpusDEpreuve}, et c'est tout l'enjeu.
 *
 * Court-circuiter les quatre boucles du corpus (`for (const cas of [])`) PUIS démonter une
 * branche de garde rendrait `exit 0` si ce contrôle était à l'intérieur — l'ordre exact qui a
 * trouvé le trou sur deux autres gardes de ce dépôt. Ici, le premier des deux gestes suffit à
 * faire rougir : les compteurs rendus tombent sous les bornes déclarées.
 */
if (
  corpus.rouges < BORNES.ROUGES ||
  corpus.verts < BORNES.VERTS ||
  corpus.fatales < BORNES.FATALES ||
  corpus.fraicheur < BORNES.FRAICHEUR ||
  corpus.genres < BORNES.GENRES
) {
  console.error(
    `✗ CORPUS D'ÉPREUVE MUET — ${corpus.rouges}/${BORNES.ROUGES} cas rouges, ${corpus.verts}/${BORNES.VERTS} témoins, ` +
      `${corpus.fatales}/${BORNES.FATALES} invariants, ${corpus.fraicheur}/${BORNES.FRAICHEUR} cas de fraîcheur, ` +
      `${corpus.genres}/${BORNES.GENRES} genres exercés.`,
  );
  console.error("  Les gardes n'ont pas été éprouvées : le verdict de ce script sur le dépôt ne vaut rien.");
  process.exit(1);
}

const RESUME_CORPUS =
  `corpus : ${corpus.rouges} cas rouges, ${corpus.verts} témoins, ${corpus.fatales} invariants, ` +
  `${corpus.fraicheur} cas de fraîcheur, ${corpus.genres} genres`;

const src = readFileSync(SOURCE, 'utf8');
const resultat = render(src);
const { text, total, placements } = resultat;
const check = process.argv.includes('--check');

/** Imprime les défauts de source et sort en 1, ou ne fait rien. */
function failOnSourceDefects() {
  const problems = verdictsDeSource(resultat);
  if (!problems.length) return;
  console.error(problems.map((p) => p.message).join('\n'));
  process.exit(1);
}

if (check) {
  let current = null;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    current = null;
  }
  const stale = verdictFraicheur(current, text);
  if (stale) {
    console.error(stale.message);
    process.exit(1);
  }
  failOnSourceDefects();
  console.log(
    `✓ ${OUTPUT_NAME} est à jour de ${SOURCE_NAME} (${total} lignes, ${placements} placements ; ${RESUME_CORPUS}).`,
  );
} else {
  writeFileSync(OUTPUT, text);
  console.log(
    `✓ ${OUTPUT_NAME} régénéré depuis ${SOURCE_NAME} (${total} lignes, ${placements} placements ; ${RESUME_CORPUS}).`,
  );
  failOnSourceDefects();
}
