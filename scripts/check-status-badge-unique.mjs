#!/usr/bin/env node
/**
 * Garde de l'UNICITÉ DU DÉCIDEUR DE COULEUR D'UN STATUT — TCK-472.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EMPÊCHE, ET POURQUOI AUCUNE GARDE EXISTANTE NE LE VOYAIT
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `console/StatusBadge.tsx` ouvrait sur : « les classes de chaque ton — **le seul endroit du dépôt
 * où la couleur d'un statut est décidée** ». Relevé le 2026-08-30 : ils étaient QUATRE, et trois
 * d'entre eux portaient le NOM `StatusBadge` sans être celui-là.
 *
 * Le mécanisme est silencieux de bout en bout. Dans un fichier qui définit son propre
 * `StatusBadge`, `<StatusBadge …>` résout vers le local ; le typage est content, le lint est
 * content, et `customer-dashboard/CustomerList.tsx` importait `DataTable` du barrel `console`
 * quatre lignes au-dessus de son homonyme sans que personne ne s'en aperçoive.
 *
 * ⚠ **Et le relevé qui aurait dû les trouver ne le pouvait pas.** L'AC3 de TCK-450 partait des
 * fichiers qui **importent** `StatusBadge`, puis y cherchait les formes qui résolvent un ton. Un
 * homonyme local n'importe rien : il est invisible par construction. *Un relevé qui part des
 * importateurs ne voit jamais les doublons — il ne voit que les usages corrects.* Cette garde part
 * donc des DÉFINITIONS et des LITTÉRAUX, jamais des imports.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LES TROIS CONTRÔLES
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   **A — l'homonyme.** Toute définition d'un identifiant nommé EXACTEMENT `StatusBadge` hors du
 *   fichier canonique doit importer le canonique. C'est la forme de `kyc/kyc-components.tsx`, la
 *   seule façon d'écrire un homonyme sans dupliquer la décision : garder le nom, importer sous
 *   alias, ne traduire que le SENS. Il n'y a **aucune liste de noms connus** ici : le contrôle est
 *   une forme, donc un fichier neuf, jamais vu, est couvert le jour où il est écrit.
 *
 *   **B — la valeur de statut qui choisit une classe.** `status === 'sold' && 'bg-success/15 …'`
 *   est la forme exacte du doublon de `PropertyList`. Elle ne se cherche pas par un nom de
 *   composant : elle se cherche par ce qu'elle FAIT, et elle rougit sous n'importe quel nom.
 *
 *   **C — la table de tons en dur.** `{ pending: 'bg-warning/15 text-warning', … }` : le même
 *   défaut, écrit en table plutôt qu'en ternaires. Ce contrôle ne réclame RIEN — il compte, et
 *   confronte le compte à une liste FIGÉE, dans les deux sens.
 *
 * ⚠ **Pourquoi C est un cliquet et non une interdiction.** Des fichiers décident encore une
 * couleur depuis une table à eux, sous un vocabulaire qui n'est pas celui de `StatusBadge`
 * (inventaire, maintenance, calendrier). Les absorber est un vrai travail de design, hors du
 * périmètre de TCK-472 — mais les laisser SANS TRACE, c'est reproduire exactement ce que ce
 * ticket corrige : une affirmation d'unicité qui n'est plus vraie et que personne ne remesure.
 * La liste `TABLES_DE_TONS_CONNUES` est donc **la déclaration nommée** que l'AC4 réclame à défaut
 * de garde — sauf qu'elle est exécutable. Elle échoue **DANS LES DEUX SENS** : un fichier de plus
 * est un doublon neuf ; un fichier de moins est une entrée périmée, et une liste périmée est
 * précisément ce dont ce ticket est né.
 *
 * ✅ **ELLE S'EST VIDÉE UNE PREMIÈRE FOIS — 5 → 3 (TCK-484), et c'est le sens « de moins » qui
 * l'a rendu visible.** Deux entrées ont été absorbées, chacune dans le même diff que son
 * absorption :
 *
 *   · `calendar/CalendarPage.tsx` — sa légende RECOPIAIT `event-colors.ts`, et la copie avait
 *     divergé : elle peignait la visite en `--info`, c'est-à-dire de la couleur d'une
 *     réservation, quand la grille juste en dessous la peignait en `--primary`. Elle dérive
 *     désormais par `paletteForType()`. *Une duplication qui a divergé ne se corrige pas, elle se
 *     supprime : corriger la copie ne fait que remettre le compteur à zéro.*
 *   · `maintenance/MaintenancePriorityBadge.tsx` — retenu au motif d'une variante `dark:` que
 *     `StatusBadge` n'a pas. La variante était l'unique apport du fichier, et elle rendait
 *     **2,16:1** (`dark:bg-foreground dark:text-muted-foreground` : crème sur crème). Ses quatre
 *     priorités tombent sur quatre des cinq tons ; il traduit et délègue désormais.
 *
 * *Les trois qui restent portent chacune, dans leur propre fichier, la phrase qui dit ce que
 * `StatusBadge` ne sait pas faire pour elles* — la raison abrégée ci-dessous en est le résumé,
 * pas la source.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE GARDE PAS, DÉLIBÉRÉMENT
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les bandeaux et encarts qui emploient `bg-warning/10` ou `bg-destructive/10` pour un MESSAGE et
 * non pour un statut : ce n'est pas le même vocabulaire, et les confondre ferait rougir la moitié
 * du parc sans rien apprendre. C'est le hors-périmètre écrit de TCK-472 et de TCK-450.
 * `media/MediaManager.tsx` en est le seul cas qui tombe malgré tout dans la forme du contrôle B
 * (`p.status === 'error'` colore la LIGNE d'un téléversement en échec, pas une pastille) : il est
 * déclaré dans `LIGNES_DE_MESSAGE_CONNUES`, avec le même cliquet à deux sens.
 *
 * `src/components/ui/` est hors périmètre entier : ce sont les primitives du design system, dont
 * les recettes de variantes SONT la table de référence.
 *
 * ⚠ **UN FAUX VERT EST POSSIBLE, et il est nommé ici plutôt que découvert plus tard.** Mesuré le
 * 2026-08-30, en éprouvant la garde par des formes inventées après coup : le contrôle B attrape
 * `status === 'x' && 'bg-…'`, `row.status === …`, et même `item.etat === …` — il n'est donc PAS
 * une liste de noms connus, ce que son AC exigeait. Mais il laisse passer une **variable locale
 * nue au nom quelconque** :
 *
 *   const _f = (s) => s === 'rejected' && 'bg-destructive/15 text-destructive';   // ← VERT
 *
 * Le discriminant est l'accès de propriété ou le nom `status` ; un paramètre d'une lettre n'a ni
 * l'un ni l'autre. La forme est rare — dans ce dépôt un statut arrive par une prop ou un objet —
 * mais elle existe, et *une garde dont on ignore l'angle mort est une garde à laquelle on fait
 * plus confiance qu'elle n'en mérite.* Élargir le contrôle à tout identifiant comparé à un
 * littéral rendrait des faux rouges en masse ; le choix est assumé, il n'est pas ignoré.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/check-status-badge-unique.mjs            # silencieux si vert
 *   node scripts/check-status-badge-unique.mjs --report   # imprime le relevé complet
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'takussan-web', 'src');
const CANONIQUE = 'takussan-web/src/components/console/StatusBadge.tsx';
const RAPPORT = process.argv.includes('--report');

/**
 * Les fichiers qui décident une couleur de statut depuis une table à eux, au 2026-08-30.
 *
 * ⚠ Cette liste ne se complète pas : elle se VIDE. Chaque entrée est une dette nommée, pas une
 * autorisation. Ajouter une ligne ici demande un ticket qui dise pourquoi le vocabulaire de
 * `StatusBadge` ne convient pas — « c'est historique » n'est pas cette phrase.
 */
const TABLES_DE_TONS_CONNUES = new Map([
  ['takussan-web/src/components/inventory/labels.ts',
    "TYPES (`move_in`/`move_out`, deux opposés qui ne se rangent pas sur l'axe des cinq tons) et "
    + "ÉTATS D'ÉLÉMENT (quatre crans de dégradation pour un seul jeton d'avertissement)"],
  ['takussan-web/src/components/maintenance/labels.ts',
    'onze statuts, dont `quote_requested`/`quote_submitted` : une SUSPENSION du cycle, qui n’est '
    + 'ni « en cours » ni « à traiter » — aucun des cinq tons ne la dit'],
  ['takussan-web/src/components/calendar/event-colors.ts',
    "une couleur par TYPE d'événement, jamais par statut — dans la grille du mois la bulle tronque "
    + 'son titre, la teinte y est le seul canal d’information'],
]);

/** Les lignes de MESSAGE qui tombent dans la forme du contrôle B sans être des statuts. */
const LIGNES_DE_MESSAGE_CONNUES = new Map([
  ['takussan-web/src/components/media/MediaManager.tsx',
    "`p.status === 'error'` colore la ligne d'un téléversement en échec — un message, pas une pastille"],
]);

const JETONS = 'success|warning|destructive|info|accent|primary';

/** A — une DÉFINITION d'un identifiant nommé exactement `StatusBadge`. */
const DEFINITION = /^[ \t]*(?:export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?(?:function|const|let|var|class)[ \t]+StatusBadge\b/;

/** A' — l'import du canonique, sous n'importe quel alias, depuis le barrel ou le fichier. */
const IMPORTE_LE_CANONIQUE =
  /import[\s\S]{0,400}?\bStatusBadge\b[\s\S]{0,400}?from\s+['"](?:@\/components\/console(?:\/StatusBadge)?|[.\/]*console\/StatusBadge|\.\/StatusBadge)['"]/;

/** B — une valeur de statut choisit une classe de ton, sur la même ligne. */
const VALEUR_CHOISIT_CLASSE = new RegExp(
  String.raw`\b\w*(?:status|statut|stage|state|etat)\w*\s*===\s*['"][a-z_]+['"][\s\S]{0,80}?\b(?:bg|text)-(?:${JETONS})\b`,
  'i',
);

/** C — une entrée d'objet dont la VALEUR est un couple aplat + encre. */
const ENTREE_DE_TABLE = new RegExp(
  // La clé accepte les guillemets ET les caractères non-ASCII : `inventory/labels.ts` en porte
  // deux (`'usé'`, `'endommagé'`), et un `[\w-]+` les manquait — la table restait détectée par ses
  // autres lignes, mais un fichier qui n'aurait QUE des clés accentuées serait passé entier.
  String.raw`^[ \t]*(?:'[^']+'|"[^"]+"|[^\s:'"(){}]+)[ \t]*:[ \t]*['"][^'"]*\bbg-(?:${JETONS}|muted|secondary)(?:\/\d+)?\b[^'"]*\btext-(?:${JETONS}|muted-foreground|secondary-foreground)\b`,
);

function fichiers(repertoire) {
  const sortie = [];
  for (const entree of readdirSync(repertoire)) {
    const chemin = join(repertoire, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === '__tests__' || entree === 'node_modules') continue;
      sortie.push(...fichiers(chemin));
    } else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

const homonymes = [];
const decisionsEnLigne = new Map();
const tablesDeTons = new Map();

for (const chemin of fichiers(SRC)) {
  const rel = relative(RACINE, chemin).split('\\').join('/');
  const source = readFileSync(chemin, 'utf8');
  const lignes = source.split('\n');
  const dansUi = rel.startsWith('takussan-web/src/components/ui/');

  if (rel !== CANONIQUE) {
    for (const [i, ligne] of lignes.entries()) {
      if (DEFINITION.test(ligne)) {
        homonymes.push({ rel, n: i + 1, delegue: IMPORTE_LE_CANONIQUE.test(source) });
      }
      if (VALEUR_CHOISIT_CLASSE.test(ligne)) {
        (decisionsEnLigne.get(rel) ?? decisionsEnLigne.set(rel, []).get(rel)).push(i + 1);
      }
      if (!dansUi && ENTREE_DE_TABLE.test(ligne)) {
        (tablesDeTons.get(rel) ?? tablesDeTons.set(rel, []).get(rel)).push(i + 1);
      }
    }
  }
}

const echecs = [];

// ── A ────────────────────────────────────────────────────────────────────────────────────────
for (const { rel, n, delegue } of homonymes) {
  if (delegue) continue;
  echecs.push(
    `A — ${rel}:${n} définit un \`StatusBadge\` qui n'importe PAS ${CANONIQUE}.\n`
    + "      Un homonyme local capture tous les `<StatusBadge …>` du fichier, en silence.\n"
    + '      Forme juste : `import { StatusBadge as ConsoleStatusBadge } from \'@/components/console\'`,\n'
    + '      puis ne traduire que le SENS (cf. `kyc/kyc-components.tsx`).',
  );
}

// ── B ────────────────────────────────────────────────────────────────────────────────────────
for (const [rel, ns] of decisionsEnLigne) {
  if (LIGNES_DE_MESSAGE_CONNUES.has(rel)) continue;
  echecs.push(
    `B — ${rel}:${ns.join(',')} fait choisir une classe de ton par une VALEUR de statut.\n`
    + '      La couleur d’un statut se décide dans `TONE_CLASSES`, jamais au site de rendu.\n'
    + '      Forme juste : une table `Record<Statut, StatusTone>` + `<StatusBadge tone={…} />`.',
  );
}
for (const [rel, raison] of LIGNES_DE_MESSAGE_CONNUES) {
  if (!decisionsEnLigne.has(rel)) {
    echecs.push(
      `B — CLIQUET PÉRIMÉ : ${rel} est déclaré hors périmètre (${raison}) mais ne correspond\n`
      + '      plus à la forme. Retirer l’entrée de `LIGNES_DE_MESSAGE_CONNUES`.',
    );
  }
}

// ── C ────────────────────────────────────────────────────────────────────────────────────────
for (const [rel, ns] of tablesDeTons) {
  if (TABLES_DE_TONS_CONNUES.has(rel)) continue;
  echecs.push(
    `C — ${rel}:${ns.join(',')} porte une table de tons en dur, hors du fichier canonique.\n`
    + '      Si c’est un statut : passer par `StatusBadge`. Si c’est un autre vocabulaire,\n'
    + '      l’écrire dans `TABLES_DE_TONS_CONNUES` de cette garde, avec la phrase qui dit ce\n'
    + '      que `StatusBadge` ne sait pas faire pour lui.',
  );
}
for (const [rel, raison] of TABLES_DE_TONS_CONNUES) {
  if (!tablesDeTons.has(rel)) {
    echecs.push(
      `C — CLIQUET PÉRIMÉ : ${rel} est déclaré comme table connue (${raison}) mais n’en porte\n`
      + '      plus. C’est une bonne nouvelle — retirer l’entrée pour que la liste reste vraie.',
    );
  }
}

if (RAPPORT) {
  console.log(`\nRELEVÉ — décideurs de couleur de statut sous ${relative(RACINE, SRC)}\n`);
  console.log(`  canonique                    ${CANONIQUE}`);
  console.log(`  homonymes \`StatusBadge\`      ${homonymes.length}`);
  for (const { rel, n, delegue } of homonymes) {
    console.log(`      ${delegue ? '✓ délègue' : '✗ DÉCIDE '}  ${rel}:${n}`);
  }
  console.log(`  décisions en ligne (B)       ${decisionsEnLigne.size} fichier(s)`);
  for (const [rel, ns] of decisionsEnLigne) console.log(`      ${rel}:${ns.join(',')}`);
  console.log(`  tables de tons en dur (C)    ${tablesDeTons.size} fichier(s)`);
  for (const [rel, ns] of tablesDeTons) console.log(`      ${rel}:${ns.join(',')}`);
  console.log('');
}

if (echecs.length > 0) {
  console.error(`✗ Décideur de couleur de statut — ${echecs.length} défaut(s) :\n`);
  for (const e of echecs) console.error(`    ${e}\n`);
  process.exit(1);
}

console.log(
  `✓ Couleur de statut : 1 décideur canonique, ${homonymes.length} homonyme(s) qui délèguent, `
  + `${TABLES_DE_TONS_CONNUES.size} table(s) d'un autre vocabulaire déclarée(s), `
  + `${LIGNES_DE_MESSAGE_CONNUES.size} ligne(s) de message déclarée(s).`,
);
