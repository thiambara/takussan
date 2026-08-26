#!/usr/bin/env node
/**
 * Garde du VOCABULAIRE DE COULEUR du frontend : il n'y a qu'un jeu de jetons, celui des
 * guidelines. Le dialecte parallèle `--app-*` / `bg-app-surface-1` / `text-app-ink` est éteint et
 * ne doit pas repousser.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF — ce qu'un doublon de jetons coûte, et pourquoi un grep de répertoire ne l'attrape pas
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/app/globals.css` a longtemps déclaré HUIT variables qui redisaient, au hex près, des
 * jetons déjà documentés dans `docs/design-guidelines.md` :
 *
 *     --app-bg         #fcf9f3   ≡ --background          --app-surface-1  #ffffff  ≡ --card
 *     --app-ink        #1f1812   ≡ --foreground          --app-surface-2  #f1ece0  ≡ --muted
 *     --app-ink-muted  #6e655a   ≡ --muted-foreground    --app-surface-3  #ebe5d5  ≡ --border
 *     --app-accent     #a85332   ≡ --primary             --app-topbar     #1f1812  ≡ --foreground
 *
 * Deux mots pour une couleur, c'est deux endroits où la changer et un seul qui sera trouvé. Et
 * le doublon n'était pas symétrique : le bloc `.dark` de `globals.css` redéfinissait `--background`,
 * `--card`, `--sidebar` et leurs voisins, et **pas un seul `--app-*`**. Le shell de `/admin`,
 * bâti entièrement sur ce dialecte, serait resté en clair au premier commutateur de thème.
 *
 * TCK-244 avait déjà entrepris cette migration et avait été marqué `done`. Ses critères rejoués
 * verbatim le 2026-08-26, quatre mois plus tard :
 *
 *     $ grep -RE "text-app-ink|bg-app-surface|…" 'src/app/(dashboard)'   → 7
 *
 * L'AC exigeait « aucun résultat » et échouait **dans son propre périmètre**. Trois échappatoires,
 * toutes structurelles — et c'est la première qui gouverne la forme de cette garde :
 *
 *   1. **Le périmètre.** L'AC greppait `src/app/(dashboard)` — les *pages*, qui sont des
 *      enveloppes serveur de quelques dizaines de lignes. Le vocabulaire vivait dans les
 *      composants qu'elles montent : **1049 occurrences dans `src/components`** pour 15 dans le
 *      répertoire audité. *Un grep qui ne suit pas les imports mesure le répertoire, pas l'écran.*
 *      → Cette garde lit `takussan-web/src` **en entier**, sans exception de répertoire.
 *   2. **Le préfixe.** L'AC cherchait `stroke-`. Le code écrivait `fill-`. Une palette hors charte
 *      a survécu à un caractère près.
 *      → Cette garde énumère les préfixes d'utilitaires de couleur de Tailwind, `fill`/`stroke`/
 *        `placeholder`/`caret`/`from`/`via`/`to` compris.
 *   3. **Le « ou ».** Une AC alternative ne nomme pas un objectif, elle nomme la sortie de secours
 *      et l'autorise. → Cette garde n'a pas de branche alternative : zéro, ou rouge.
 *
 * Et rien ne l'a rattrapé pendant quatre mois parce qu'aucune garde ne rejouait l'AC. C'est le
 * défaut de fond, pas l'usage : *un `done` mesuré une fois redevient faux sans que personne le
 * voie.* (TCK-372, correction de TCK-244.)
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE — et c'est rare, elle prouve vraiment
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Contrairement à `check-feedback-states.mjs`, dont deux contrôles sur trois sont des cliquets
 * heuristiques, la propriété visée ici est **décidable par lecture de texte** : « la chaîne
 * `app-<jeton>` n'apparaît nulle part sous `takussan-web/src` ». Une classe Tailwind est un
 * littéral ; elle ne se calcule pas, sous peine de ne pas être compilée du tout. Il n'y a donc
 * ni faux négatif structurel ni plancher à assumer :
 *
 *   A. **Aucune déclaration** `--app-*` ni `--color-app-*` dans les CSS de `src/`. C'est la fin
 *      de course de TCK-372 : tant que les variables existent, une garde doit énumérer des
 *      usages ; une fois retirées, l'absence se prouve toute seule.
 *   B. **Aucun usage** `<préfixe>-app-<jeton>` dans un fichier de `src/`, quel que soit le
 *      répertoire, l'extension ou la variante (`hover:`, `data-highlighted:`, `/40`, `md:`…).
 *   C. **Aucune lecture** `var(--app-…)` — la forme qui contournerait A et B ensemble.
 *
 * Les commentaires ne sont **pas** retirés avant analyse, délibérément : un docblock qui explique
 * de poser `text-app-ink` est exactement la sorte de documentation périmée que ce ticket éteint.
 *
 * Relevé daté, avec ce script inchangé :
 *
 *     2026-08-26, avant TCK-372 : A = 16 déclarations · B = 1084 usages · C = 0
 *     2026-08-26, après TCK-372 : A = 0              · B = 0            · C = 0
 *
 * Les 1084 usages se sont traduits par le jeton documenté de MÊME RÔLE (table `TRADUCTION`
 * ci-dessous), à valeur identique : le rendu ne bouge pas.
 *
 * Usage :
 *   node scripts/check-app-tokens.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-app-tokens.mjs --report   # + le détail fichier par fichier
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SRC = join(ROOT, 'takussan-web', 'src');

/**
 * La table de traduction appliquée par TCK-372, imprimée dans le message d'erreur.
 *
 * Elle est là pour que la garde ne se contente pas d'interdire : celui qui la fait rougir a
 * besoin du jeton de remplacement, pas d'un refus. Le choix se fait par RÔLE et non par hex —
 * `#1f1812` est à la fois `--foreground`, `--card-foreground` et `--sidebar-foreground`.
 */
const TRADUCTION = new Map([
  ['app-bg', 'background'],
  ['app-ink', 'foreground'],
  ['app-ink-muted', 'muted-foreground'],
  ['app-surface-1', 'card'],
  ['app-surface-2', 'muted'],
  ['app-surface-3', 'border'],
  ['app-accent', 'primary'],
  // `--app-topbar` valait `#1f1812`, l'encre : la barre et la barre latérale sombres sont une
  // surface d'encre inversée, pas une couleur à part. `bg-foreground` / `text-foreground`.
  ['app-topbar', 'foreground'],
  // Trois classes n'avaient JAMAIS existé comme variable — `--app-border`, `--app-primary` et
  // `--app-surface` (sans chiffre) n'étaient déclarées nulle part. Tailwind ne génère pas la
  // classe, et le style était donc silencieusement absent. Elles figurent ici parce que c'est le
  // jeton que leur auteur visait, et parce qu'une garde qui les laisserait passer laisserait
  // repousser le dialecte par sa branche la plus discrète : celle qui ne rend rien.
  ['app-border', 'border'],
  ['app-primary', 'primary'],
  ['app-surface', 'card'],
]);

/**
 * Les préfixes d'utilitaires de couleur de Tailwind v4.
 *
 * La liste est délibérément LARGE — c'est la leçon de l'AC2 de TCK-244, qui cherchait `stroke-`
 * quand le code écrivait `fill-`. Un préfixe manquant ici est un trou muet : la garde reste
 * verte et le dialecte revit sous un nom d'utilitaire voisin.
 */
const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'divide', 'fill', 'stroke', 'placeholder',
  'outline', 'shadow', 'from', 'via', 'to', 'caret', 'accent', 'decoration',
];

const JETONS = [...TRADUCTION.keys()].sort((a, b) => b.length - a.length);

// `\b` avant le préfixe suffit à écarter les mots composés (`whatsapp-…` : `app` y est précédé
// d'un `s`, la frontière ne s'ouvre pas). La variante Tailwind (`hover:`, `md:`,
// `data-highlighted:`) et le modificateur d'opacité (`/40`) encadrent le motif sans le rompre.
const USAGE = new RegExp(`\\b(?:${PREFIXES.join('|')})-(?:${JETONS.join('|')})\\b`, 'g');
const DECLARATION = /--(?:color-)?app-[a-z0-9-]+\s*:/g;
const LECTURE = /var\(\s*--(?:color-)?app-[a-z0-9-]+/g;

const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/;

function fichiers(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === 'node_modules') continue;
      fichiers(chemin, acc);
      continue;
    }
    // Aucune exclusion de répertoire : ni `__tests__`, ni `(dashboard)`, ni `ui/`. Le défaut que
    // cette garde corrige EST une exclusion de répertoire.
    if (EXTENSIONS.test(entree)) acc.push(chemin);
  }
  return acc;
}

if (!existsSync(SRC)) {
  console.error(`✗ ${relative(ROOT, SRC)} est introuvable — la garde n'a rien pu lire.`);
  process.exit(1);
}

const tous = fichiers(SRC);
if (tous.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : la forme de
  // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
  console.error(`✗ aucun fichier lisible sous ${relative(ROOT, SRC)} — la garde n'aurait rien vérifié.`);
  process.exit(1);
}

const declarations = [];
const usages = [];
const lectures = [];

for (const chemin of tous) {
  const rel = relative(ROOT, chemin);
  const lignes = readFileSync(chemin, 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    for (const [motif, seau] of [[DECLARATION, declarations], [USAGE, usages], [LECTURE, lectures]]) {
      motif.lastIndex = 0;
      for (const m of ligne.matchAll(motif)) seau.push([rel, i + 1, m[0]]);
    }
  });
}

if (REPORT) {
  console.log(`vocabulaire app-* — ${tous.length} fichiers lus sous ${relative(ROOT, SRC)}\n`);
  console.log(`  A · déclarations --app-* / --color-app-* : ${declarations.length}`);
  for (const [f, l, m] of declarations) console.log(`      ✗ ${f}:${l}  ${m}`);
  console.log(`  B · usages <préfixe>-app-<jeton> : ${usages.length}`);
  for (const [f, l, m] of usages) console.log(`      ✗ ${f}:${l}  ${m}`);
  console.log(`  C · lectures var(--app-…) : ${lectures.length}`);
  for (const [f, l, m] of lectures) console.log(`      ✗ ${f}:${l}  ${m}`);
  console.log();
}

const total = declarations.length + usages.length + lectures.length;

if (total === 0) {
  console.log(
    `✓ vocabulaire app-* : 0 déclaration, 0 usage, 0 lecture sur ${tous.length} fichiers `
    + `de ${relative(ROOT, SRC)} (contre 16 / 1084 / 0 le 2026-08-26, avant TCK-372).`,
  );
  console.log('  PORTÉE — ce contrôle est EXACT, pas heuristique : une classe Tailwind est un');
  console.log('  littéral, elle ne se calcule pas sous peine de ne pas être compilée. Un vert');
  console.log('  ici veut bien dire « il n’en reste aucun ». Ce qu’il ne dit pas : qu’aucun');
  console.log('  AUTRE dialecte de couleur n’existe — la palette Tailwind brute (`emerald-500`,');
  console.log('  `sky-500`) est un défaut voisin, gardé ailleurs.');
  process.exit(0);
}

console.error(`\n✗ ${total} réapparition(s) du vocabulaire app-* sous ${relative(ROOT, SRC)} :\n`);

for (const [f, l, m] of declarations) {
  console.error(
    `  · ${f}:${l} — \`${m}\` redéclare un jeton du design system sous un second nom. `
    + 'Les jetons documentés sont dans `docs/design-guidelines.md` ; ils existent en clair ET en '
    + 'sombre, ce que `--app-*` n’a jamais fait.',
  );
}
for (const [f, l, m] of lectures) {
  console.error(`  · ${f}:${l} — \`${m}…)\` lit une variable éteinte par TCK-372.`);
}

const parJeton = new Map();
for (const [f, l, m] of usages) {
  const jeton = JETONS.find((j) => m.endsWith(`-${j}`));
  if (!parJeton.has(jeton)) parJeton.set(jeton, []);
  parJeton.get(jeton).push(`${f}:${l}`);
}
for (const [jeton, lieux] of parJeton) {
  const cible = TRADUCTION.get(jeton);
  console.error(
    `  · \`${jeton}\` → écris \`${cible}\` à la place (${lieux.length} occurrence(s) : `
    + `${lieux.slice(0, 5).join(', ')}${lieux.length > 5 ? `, +${lieux.length - 5}` : ''}).`,
  );
}

console.error(
  '\n  Le dialecte `app-*` a été éteint par TCK-372, qui corrigeait un TCK-244 marqué `done`\n'
  + '  dont l’AC échouait dans son propre périmètre. Le rejouer n’est pas un raccourci : c’est\n'
  + '  un second jeu de jetons, absent du mode sombre et absent des guidelines.\n',
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
