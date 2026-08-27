#!/usr/bin/env node
/**
 * Garde de la CONSOLE SUPER-ADMIN : elle ne parle qu'un vocabulaire de couleur, celui des jetons
 * du design system. Aucune échelle Tailwind brute (`stone-700`, `amber-500`, `emerald-100`…),
 * aucun `bg-white`, aucun reste du dialecte `app-*`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF — pourquoi cette garde existe, et pourquoi elle nomme QUATRE répertoires
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-245 avait déjà fait ce travail et avait été marqué `done`. Son AC1 exigeait zéro classe de
 * palette brute — et le greppait sur `src/app/(super-admin)/**`, c'est-à-dire les *wrappers* de
 * page. L'écran, lui, vit dans les composants que ces wrappers montent. Relevé du 2026-08-26,
 * quatre mois plus tard, en rejouant l'AC verbatim :
 *
 *     src/app/(super-admin)/**  — le périmètre de l'AC1 ....................  11 (l'AC exigeait 0)
 *     src/components/admin/super/** .......................................  218
 *     src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx ...........   12
 *     src/components/super-admin/** .......................................    1
 *
 * Les 11 du périmètre audité n'y étaient même pas restées : elles étaient REVENUES, avec
 * `/agency-upgrade-requests` et `/super-admins`, deux pages créées après TCK-245. *Un `done`
 * mesuré une fois redevient faux sans que personne le voie* — c'est la même leçon que
 * `check-app-tokens.mjs`, payée une seconde fois sur un autre périmètre.
 *
 * Sur l'ensemble de la console au 2026-08-26 : 348 utilitaires de palette brute contre 109
 * jetons et 25 jetons `app-*`. **Trois vocabulaires**, dont six fichiers en mélangeaient deux.
 *
 * ⚠ Le tableau ci-dessus est la mesure du 2026-08-26 citée par TCK-358. **Re-mesuré le
 * 2026-08-27, au moment d'implémenter, les comptes avaient bougé** — TCK-357 (primitives
 * partagées) était passé entre-temps et avait absorbé une partie du travail :
 *
 *     src/app/(super-admin)/** ............................................   18
 *     src/components/admin/super/** .......................................   85
 *     src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx ...........   16
 *     src/components/super-admin/** .......................................    9
 *                                                                    total   128
 *
 * Les deux relevés figurent ici ensemble, avec leurs dates : c'est ce qui permettra, la
 * prochaine fois, de savoir lequel est périmé plutôt que de le supposer juste.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE — et ce qu'elle ne prouve pas
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle prouve, par lecture de texte et sans heuristique, qu'aucun fichier des quatre périmètres
 * n'écrit une classe de couleur hors jetons. Une classe Tailwind est un littéral : elle ne se
 * calcule pas, sous peine de ne pas être compilée du tout. Il n'y a donc pas de faux négatif
 * structurel — sauf le cas, hors sujet ici, d'un style inline en `style={{ color: '#…' }}`.
 *
 * Elle ne prouve RIEN sur la justesse du rendu : un `bg-card` posé là où il fallait `bg-muted`
 * la laisse verte. C'est un plancher de vocabulaire, pas une revue de design.
 *
 * **Les commentaires ne sont pas retirés avant analyse**, délibérément et pour la même raison
 * que `check-app-tokens.mjs` : un docblock qui montre `bg-stone-100` est exactement la
 * documentation périmée qui fait repousser le motif. Le récit d'une migration s'écrit en toutes
 * lettres (« pierre 100 »), pas en classes copiables.
 *
 * Usage :
 *   node scripts/check-super-admin-tokens.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-super-admin-tokens.mjs --report   # + le détail fichier par fichier
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WEB_SRC = join(ROOT, 'takussan-web', 'src');

/**
 * LES QUATRE PÉRIMÈTRES — répertoires entiers, plus trois fichiers nommés.
 *
 * `src/components/layout/` n'y entre pas en entier : il sert aussi le shell agence, qui n'est
 * pas l'objet de ce ticket. Les trois fichiers `SuperAdmin*` y sont donc listés un par un, et
 * un quatrième qui apparaîtrait demain ne serait PAS couvert — c'est la faiblesse assumée de
 * cette forme. Le motif `layout/SuperAdmin*.tsx` la referme : tout fichier du répertoire dont
 * le nom commence par `SuperAdmin` est repris, quel que soit le jour où il naît.
 */
const PERIMETRES = [
  { type: 'dir', chemin: join(WEB_SRC, 'app', '(super-admin)') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'admin', 'super') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'super-admin') },
  { type: 'glob', dir: join(WEB_SRC, 'components', 'layout'), prefixe: 'SuperAdmin' },
];

/**
 * Les préfixes d'utilitaires de couleur de Tailwind v4 — liste délibérément LARGE.
 *
 * C'est la leçon de l'AC2 de TCK-244, qui cherchait `stroke-` quand le code écrivait `fill-` :
 * une palette hors charte a survécu à un caractère près. Un préfixe manquant ici est un trou
 * muet — la garde reste verte et la palette brute revit sous un nom d'utilitaire voisin.
 */
const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'divide', 'fill', 'stroke', 'placeholder',
  'outline', 'shadow', 'from', 'via', 'to', 'caret', 'accent', 'decoration',
];

/**
 * Les familles de l'échelle Tailwind par défaut, TOUTES.
 *
 * L'AC1 de TCK-358 n'en nommait que dix (`stone|amber|emerald|red|green|blue|slate|gray|zinc|
 * neutral`) — celles que la console utilisait ce jour-là. Une garde qui recopierait cette liste
 * laisserait passer le premier `bg-teal-100` venu. La liste ci-dessous est celle de Tailwind,
 * pas celle du relevé.
 */
const FAMILLES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

const P = PREFIXES.join('|');

/** A · échelle numérotée : `bg-stone-100`, `hover:text-amber-700`, `ring-amber-500/30`. */
const ECHELLE = new RegExp(`\\b(?:${P})-(?:${FAMILLES.join('|')})-[0-9]{2,3}\\b`, 'g');

/**
 * B · les couleurs NOMMÉES sans échelle : `bg-white`, `text-black`, `border-white/10`.
 *
 * Elles échappent au motif A faute de chiffre, et c'est par elles que le blanc en dur revenait :
 * 14 `bg-white` dans les quatre périmètres au 2026-08-27, tous des surfaces qui voulaient dire
 * `--card`. Le blanc FONCTIONNEL — le fond d'un QR code, qui doit rester blanc en thème sombre —
 * passe par la classe `.qr-surface` de `globals.css`, nommée pour ce qu'elle fait.
 */
const NOMMEES = new RegExp(`\\b(?:${P})-(?:white|black)\\b`, 'g');

/**
 * C · le dialecte `app-*`, que `check-app-tokens.mjs` garde déjà sur `src` entier.
 *
 * Le doublon est délibéré et il coûte trois lignes : si cette garde-ci était la seule à tourner
 * un jour (exécution ciblée, bissection), la console ne perdrait pas son contrôle le plus
 * ancien. Deux gardes qui se recouvrent valent mieux qu'un trou entre elles.
 */
const APP_DIALECTE = new RegExp(`\\b(?:${P})-app-[a-z0-9-]+\\b`, 'g');

const CONTROLES = [
  ['A', 'échelle Tailwind brute (bg-stone-100, text-amber-700…)', ECHELLE],
  ['B', 'couleur nommée en dur (bg-white, text-black…)', NOMMEES],
  ['C', 'dialecte app-* (éteint par TCK-372)', APP_DIALECTE],
];

const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/;

function fichiersDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === 'node_modules') continue;
      fichiersDe(chemin, acc);
      continue;
    }
    if (EXTENSIONS.test(entree)) acc.push(chemin);
  }
  return acc;
}

const manquants = [];
const tous = [];

for (const p of PERIMETRES) {
  if (p.type === 'dir') {
    if (!existsSync(p.chemin)) { manquants.push(relative(ROOT, p.chemin)); continue; }
    fichiersDe(p.chemin, tous);
  } else {
    if (!existsSync(p.dir)) { manquants.push(relative(ROOT, p.dir)); continue; }
    const trouves = readdirSync(p.dir).filter(
      (e) => e.startsWith(p.prefixe) && EXTENSIONS.test(e),
    );
    // Un périmètre défini par un préfixe de nom peut se vider sans erreur : le jour où les trois
    // `SuperAdmin*.tsx` sont renommés, cette garde perdrait un quart de sa portée en silence.
    if (trouves.length === 0) manquants.push(`${relative(ROOT, p.dir)}/${p.prefixe}*`);
    for (const e of trouves) tous.push(join(p.dir, e));
  }
}

if (manquants.length > 0) {
  console.error('✗ périmètre introuvable — la garde n\'aurait rien vérifié dessus :');
  for (const m of manquants) console.error(`    ${m}`);
  console.error('  Si le répertoire a été renommé ou supprimé, METTRE À JOUR `PERIMETRES`.');
  process.exit(1);
}

if (tous.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : la forme de
  // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
  console.error('✗ aucun fichier lisible dans les quatre périmètres — la garde n\'aurait rien vérifié.');
  process.exit(1);
}

// Les tests ne sont PAS analysés : ils peuvent légitimement asserter la classe d'un composant
// tiers, et l'AC1 de TCK-358 les exclut explicitement.
const analyses = tous.filter((c) => !c.split(/[\\/]/).includes('__tests__'));

const trouvailles = new Map(CONTROLES.map(([id]) => [id, []]));

for (const chemin of analyses) {
  const rel = relative(ROOT, chemin);
  const lignes = readFileSync(chemin, 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    for (const [id, , motif] of CONTROLES) {
      motif.lastIndex = 0;
      for (const m of ligne.matchAll(motif)) trouvailles.get(id).push([rel, i + 1, m[0]]);
    }
  });
}

if (REPORT) {
  console.log(
    `console super-admin — ${analyses.length} fichiers analysés `
    + `(${tous.length - analyses.length} fichiers de test écartés)\n`,
  );
  for (const [id, libelle] of CONTROLES) {
    const hits = trouvailles.get(id);
    console.log(`  ${id} · ${libelle} : ${hits.length}`);
    for (const [f, l, m] of hits) console.log(`      ✗ ${f}:${l}  ${m}`);
  }
  console.log();
}

const total = CONTROLES.reduce((n, [id]) => n + trouvailles.get(id).length, 0);

if (total === 0) {
  console.log(
    `✓ console super-admin : 0 classe de couleur hors jetons sur ${analyses.length} fichiers `
    + '(contre 128 le 2026-08-27, avant TCK-358).',
  );
  console.log(
    '  PORTÉE — plancher de VOCABULAIRE, pas revue de design : un `bg-card` posé là où il',
  );
  console.log(
    '  fallait `bg-muted` laisse cette garde verte. Elle prouve seulement qu\'aucune couleur',
  );
  console.log('  n\'est décidée en dehors de `globals.css`.');
  process.exit(0);
}

console.error(`✗ ${total} classe(s) de couleur hors jetons dans la console super-admin :\n`);
for (const [id, libelle] of CONTROLES) {
  const hits = trouvailles.get(id);
  if (hits.length === 0) continue;
  console.error(`  ${id} · ${libelle} — ${hits.length} :`);
  for (const [f, l, m] of hits) console.error(`      ${f}:${l}  ${m}`);
  console.error('');
}
console.error('  Traduire par RÔLE, jamais par teinte proche :');
console.error('      surface de carte ............ bg-card          (ex-bg-white)');
console.error('      surface secondaire .......... bg-muted         (ex-bg-stone-50|100|200)');
console.error('      bordure / anneau ............ border-border · ring-border');
console.error('      texte principal ............. text-foreground  (ex-text-stone-900|950)');
console.error('      texte secondaire ............ text-muted-foreground');
console.error('      accent de marque ............ text-primary · bg-primary');
console.error('      avertissement ............... WarningBanner · bg-warning/10 · text-warning');
console.error('      erreur ...................... ErrorState · text-destructive');
console.error('      pastille de statut .......... <StatusBadge tone="…"> — jamais une classe');
console.error('  Surface sombre permanente (topbar / sidebar) : la classe `dark` plus les jetons');
console.error('  `--sidebar-*`, cf. le docblock de `SuperAdminSidebar`.');
console.error('  Blanc FONCTIONNEL (fond de QR code) : la classe `.qr-surface` de `globals.css`.');
process.exit(1);
