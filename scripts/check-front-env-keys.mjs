#!/usr/bin/env node
/**
 * Garde de COUVERTURE des variables de build du front (TCK-431), et de leur CONFINEMENT
 * (ADR-0069 § 3).
 *
 * Toute variable `NEXT_PUBLIC_*` que `takussan-web/` LIT doit être déclarée dans
 * `takussan-web/.env.example` **et** relevée dans `docs/infra/frontend-deploiement.json`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * DEPUIS ADR-0069 : UN SEUL LECTEUR, ET AUCUNE `NEXT_PUBLIC_*` DANS L'IMAGE
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'image du front ne porte plus d'environnement : l'origine de l'API, celle du site et celle des
 * médias se lisent à l'exécution (`API_URL`, `SITE_URL`, `MEDIA_URL`), par un module unique,
 * `src/lib/config-publique.ts`, qui les transmet au navigateur. La garde refuse donc :
 *
 * · une lecture de `process.env.NEXT_PUBLIC_*`, ou de l'une des trois clés d'exécution, HORS de
 *   ce module (et de `next.config.ts`, qui valide la valeur de build de Vercel). Un composant
 *   client qui relirait `process.env.NEXT_PUBLIC_API_URL` recevrait `undefined` dans l'image, et
 *   partirait vers `http://localhost:8002` sans que rien rougisse ;
 * · toute `NEXT_PUBLIC_*` en `ARG` ou en `ENV` du Dockerfile, ou passée en `build-args` par
 *   `images.yml` : inlinée, elle referait une image par environnement ;
 * · une clé de plus dans la configuration transmise au navigateur (`ConfigPublique`), ou une
 *   variable d'environnement de plus lue par le module. Tout ce qu'il transmet est écrit en clair
 *   dans chaque page : la liste est fermée ICI, pour qu'un secret ne puisse pas y entrer sans
 *   qu'on modifie une garde en le sachant.
 *
 * Le repli `NEXT_PUBLIC_*` du module ne sert qu'au build de Vercel et au développement ; il
 * disparaît avec Vercel (phase F, F5).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TROISIÈME SOMMET, ALORS QUE DEUX GARDES D'ENVIRONNEMENT EXISTENT DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `check-env-parity.mjs` compare `.env.example` et `.env.docker` — **côté API uniquement**, et
 * entre eux. Le front n'a qu'UN seul fichier d'environnement suivi par git (`.gitignore` de
 * `takussan-web/` n'excepte que `.env.example`) : il n'y a rien à mettre en parité, et le motif
 * que `check-webhook-env-keys.mjs` a nommé pour l'API vaut ici entier — *une clé absente des
 * fichiers est en parité parfaite.* La seule mesure possible est donc code → fichiers.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE MODE DE DÉFAILLANCE : `undefined` INLINÉ, ET RIEN QUI ROUGISSE
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `NEXT_PUBLIC_*` est substituée **à la compilation** : une clé absente de l'environnement de
 * build ne casse pas le build, elle produit `undefined` dans le JavaScript livré, et le défaut
 * n'apparaît qu'en production, sur une requête partie vers `undefined/api/…`. Aucun test ne
 * l'attrape, aucun type ne le voit.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SCRIPT ET NON DU BASH DANS UN WORKFLOW
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Cette vérification existait — en ligne, dans le job `variables` de
 * `.github/workflows/front-deploy-map.yml`, qui ne se déclenche que sur `pull_request` et sur un
 * cron hebdomadaire. `NEXT_PUBLIC_SITE_URL` a donc pu être introduite par TCK-434 sans être
 * déclarée : personne ne pouvait jouer la garde avant de pousser. Elle vit ici désormais, le
 * workflow l'APPELLE, et `for g in scripts/check-*.mjs; do node "$g"; done` la trouve — c'est la
 * commande que le `CLAUDE.md` racine donne pour lister les gardes, et une garde qu'elle ne trouve
 * pas n'est pas dans l'inventaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Que la valeur servie en Production soit juste. Le dépôt ne lit pas le tableau de bord Vercel
 * (ADR-0017) ; il ne peut vérifier que la DÉCLARATION. Les variables non préfixées
 * `NEXT_PUBLIC_*` sont hors périmètre par construction : `VERCEL_ENV` et `VERCEL_URL` sont posées
 * par la plateforme et n'ont ni à être déclarées ni à être relevées.
 *
 * Usage :
 *   node scripts/check-front-env-keys.mjs            # sort en 1 au moindre trou
 *   node scripts/check-front-env-keys.mjs --report   # + la matrice complète
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'takussan-web');
const REPORT = process.argv.includes('--report');

const SOURCES = [join(WEB, 'src'), join(WEB, 'next.config.ts')];
const ENV_EXEMPLE = join(WEB, '.env.example');
const RELEVE = join(ROOT, 'docs', 'infra', 'frontend-deploiement.json');
/**
 * ADR-0069 § 3 — les deux sommets qui CONSTRUISENT l'image. Ils ne doivent porter AUCUNE
 * `NEXT_PUBLIC_*` : une valeur passée là serait inlinée, et l'image servirait un seul
 * environnement.
 */
const DOCKERFILE = join(WEB, 'Dockerfile');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'images.yml');

/** Le seul module qui lit la configuration publique, et `next.config.ts` (build de Vercel). */
const LECTEUR = join(WEB, 'src', 'lib', 'config-publique.ts');
const LECTEURS_ADMIS = new Set([LECTEUR, join(WEB, 'next.config.ts')]);

/** Les clés d'exécution de l'image (ADR-0069 § 3) : lues par le module seul, elles aussi. */
const CLES_EXECUTION = ['API_URL', 'SITE_URL', 'MEDIA_URL'];

/**
 * Ce que le module a le droit de lire dans `process.env` : les trois clés d'exécution, leurs
 * replis `NEXT_PUBLIC_*`, et les deux variables que Vercel pose (prévisualisation).
 */
const LECTURES_DU_MODULE = new Set([
  ...CLES_EXECUTION,
  ...CLES_EXECUTION.map((c) => `NEXT_PUBLIC_${c}`),
  'VERCEL_ENV',
  'VERCEL_URL',
]);

/** Les clés de `ConfigPublique`, écrites en clair dans chaque page servie. */
const CONFIG_DU_NAVIGATEUR = ['apiUrl', 'mediaUrl'];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

/**
 * Plancher de plausibilité. Posé bien sous le compte réel du 2026-08-27 (2 clés, 40 sites de
 * lecture, ~880 fichiers balayés) : il n'a pas à suivre la taille du dépôt, il attrape
 * « le dossier a été renommé », « le motif est cassé », « un glob rend zéro fichier ».
 *
 * *Une garde qui ne trouve plus sa cible passe au vert en ne gardant plus rien, et sa sortie
 * ressemble à un succès.* C'est le défaut le plus cher de ce dépôt (D-15, D-18, D-44).
 */
const PLANCHER_FICHIERS = 200;

function fichiersSources(chemin, acc = []) {
  if (!existsSync(chemin)) return acc;
  const stat = readdirSync(dirname(chemin), { withFileTypes: true }).find(
    (e) => join(dirname(chemin), e.name) === chemin,
  );
  if (stat && !stat.isDirectory()) {
    if (EXTENSIONS.has(extname(chemin))) acc.push(chemin);
    return acc;
  }
  for (const entree of readdirSync(chemin, { withFileTypes: true })) {
    const enfant = join(chemin, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === 'node_modules' || entree.name.startsWith('.')) continue;
      fichiersSources(enfant, acc);
    } else if (EXTENSIONS.has(extname(entree.name))) {
      acc.push(enfant);
    }
  }
  return acc;
}

const fichiers = SOURCES.flatMap((s) => fichiersSources(s));

if (fichiers.length < PLANCHER_FICHIERS) {
  console.error(
    `✗ ${fichiers.length} fichier(s) source balayé(s) sous le plancher de ${PLANCHER_FICHIERS}.\n` +
      `  Le balayage ne mesure plus rien — dossier déplacé, extensions changées, ou chemin faux.`,
  );
  process.exit(1);
}

// Les sites de LECTURE, dans leur forme littérale — la seule que Next substitue.
const lues = new Map(); // clé → [fichier:ligne]
const horsDuModule = []; // lectures d'une clé de configuration hors du lecteur unique
const lectureExecution = new RegExp(`process\\.env\\.(${CLES_EXECUTION.join('|')})\\b`, 'g');
for (const fichier of fichiers) {
  const lignes = readFileSync(fichier, 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    const site = `${relative(ROOT, fichier)}:${i + 1}`;
    for (const m of ligne.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Za-z0-9_]+)/g)) {
      const cle = m[1];
      if (!lues.has(cle)) lues.set(cle, []);
      lues.get(cle).push(site);
      if (!LECTEURS_ADMIS.has(fichier)) horsDuModule.push(`${cle} : lue par ${site}`);
    }
    for (const m of ligne.matchAll(lectureExecution)) {
      if (fichier !== LECTEUR) horsDuModule.push(`${m[1]} : lue par ${site}`);
    }
  });
}

if (lues.size === 0) {
  console.error(
    `✗ aucune variable NEXT_PUBLIC_* lue dans ${SOURCES.map((s) => relative(ROOT, s)).join(', ')}.\n` +
      `  Il y en avait 2 le 2026-08-27, pour 40 sites de lecture. Une disparition totale est un\n` +
      `  déplacement de fichiers ou un motif cassé, pas un progrès — cette garde ne mesure plus rien.`,
  );
  process.exit(1);
}

for (const chemin of [ENV_EXEMPLE, RELEVE, DOCKERFILE, WORKFLOW, LECTEUR]) {
  if (!existsSync(chemin)) {
    console.error(`✗ ${relative(ROOT, chemin)} : introuvable. Le périmètre de la garde est périmé.`);
    process.exit(1);
  }
}

const declarees = new Set(
  readFileSync(ENV_EXEMPLE, 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/))
    .filter(Boolean)
    .map((m) => m[1]),
);

let relevees;
try {
  const json = JSON.parse(readFileSync(RELEVE, 'utf8'));
  relevees = new Set((json.variables_build ?? []).map((v) => v.cle));
} catch (err) {
  console.error(`✗ ${relative(ROOT, RELEVE)} illisible : ${err.message}`);
  process.exit(1);
}

if (relevees.size === 0) {
  console.error(
    `✗ ${relative(ROOT, RELEVE)} ne relève aucune variable de build.\n` +
      `  La dérivation est cassée, ou le relevé a changé de forme : dans les deux cas la garde ne\n` +
      `  peut rien affirmer.`,
  );
  process.exit(1);
}

// Toute mention NON COMMENTÉE d'une `NEXT_PUBLIC_*` : `ARG`, `ENV` (et ses lignes de
// continuation), `build-args`. Les commentaires peuvent en parler, la construction non.
function mentionsDansLaConstruction(chemin) {
  return readFileSync(chemin, 'utf8')
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.replace(/#.*$/, ''), n: i + 1 }))
    .flatMap(({ ligne, n }) =>
      [...ligne.matchAll(/\b(NEXT_PUBLIC_[A-Za-z0-9_]+)\b/g)].map((m) => `${m[1]} : ${relative(ROOT, chemin)}:${n}`),
    );
}
const dansLaConstruction = [...mentionsDansLaConstruction(DOCKERFILE), ...mentionsDansLaConstruction(WORKFLOW)];

const sourceDuModule = readFileSync(LECTEUR, 'utf8');
const lectureshorsListe = [...new Set([...sourceDuModule.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].filter(
  (cle) => !LECTURES_DU_MODULE.has(cle),
);
const typeConfig = sourceDuModule.match(/export type ConfigPublique = \{([\s\S]*?)\n\};/);
const clesConfig = typeConfig ? [...typeConfig[1].matchAll(/^\s*readonly (\w+)\??:/gm)].map((m) => m[1]) : [];

const erreurs = [];
for (const h of horsDuModule) {
  erreurs.push(`${h}, hors de ${relative(ROOT, LECTEUR)} — seul lecteur de la configuration (ADR-0069 § 3)`);
}
for (const d of dansLaConstruction) {
  erreurs.push(`${d} — l'image ne porte aucune NEXT_PUBLIC_* : elle serait inlinée (ADR-0069 § 3)`);
}
for (const cle of lectureshorsListe) {
  erreurs.push(
    `${relative(ROOT, LECTEUR)} lit process.env.${cle}, hors de la liste fermée de cette garde ` +
      `(ce module transmet sa configuration au navigateur, en clair)`,
  );
}
if (clesConfig.join(',') !== CONFIG_DU_NAVIGATEUR.join(',')) {
  erreurs.push(
    `ConfigPublique (${relative(ROOT, LECTEUR)}) porte [${clesConfig.join(', ') || 'introuvable'}], ` +
      `attendu [${CONFIG_DU_NAVIGATEUR.join(', ')}] : chaque clé est écrite en clair dans chaque page. ` +
      `Une clé de plus s'ajoute ici, à la main, en sachant qu'elle devient publique.`,
  );
}
for (const [cle, sites] of lues) {
  if (!declarees.has(cle)) {
    erreurs.push(
      `${cle} : lue par ${sites[0]}${sites.length > 1 ? ` (+${sites.length - 1})` : ''}, ` +
        `absente de ${relative(ROOT, ENV_EXEMPLE)}`,
    );
  }
  if (!relevees.has(cle)) {
    erreurs.push(
      `${cle} : lue par ${sites[0]}${sites.length > 1 ? ` (+${sites.length - 1})` : ''}, ` +
        `absente de ${relative(ROOT, RELEVE)}`,
    );
  }
}

if (REPORT) {
  const large = Math.max(...[...lues.keys()].map((k) => k.length));
  console.log(
    `${lues.size} clé(s) NEXT_PUBLIC_* lue(s) dans ${fichiers.length} fichiers balayés :\n`,
  );
  console.log(`${'clé'.padEnd(large)}  lectures  .env.example  relevé  lecteurs`);
  for (const cle of [...lues.keys()].sort()) {
    const lecteurs = [...new Set(lues.get(cle).map((s) => s.replace(/:\d+$/, '').replace(/^takussan-web\//, '')))];
    console.log(
      `${cle.padEnd(large)}  ${String(lues.get(cle).length).padEnd(8)}  ` +
        `${(declarees.has(cle) ? '✓' : '✗').padEnd(12)}  ${(relevees.has(cle) ? '✓' : '✗').padEnd(6)}  ` +
        lecteurs.join(', '),
    );
  }
  console.log('');
}

if (erreurs.length === 0) {
  console.log(
    `✓ variables de build du front : ${lues.size} clé(s) NEXT_PUBLIC_* lue(s), toutes déclarées ` +
      `dans .env.example et relevées dans frontend-deploiement.json ; lues par le seul ` +
      `config-publique.ts (et next.config.ts) ; aucune dans le Dockerfile ni dans images.yml ; ` +
      `configuration du navigateur fermée sur [${CONFIG_DU_NAVIGATEUR.join(', ')}].`,
  );
  process.exit(0);
}

console.error(`✗ ${erreurs.length} écart(s) sur les variables de build du front :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nUne NEXT_PUBLIC_* absente de l'environnement de build ne casse PAS le build : elle est\n` +
    `substituée par \`undefined\` dans le bundle livré, et le défaut n'apparaît qu'en production.\n` +
    `Déclarer la clé dans takussan-web/.env.example, et consigner sa valeur d'environnement dans\n` +
    `docs/infra/frontend-deploiement.json (champ variables_build). Et la lire par\n` +
    `src/lib/config-publique.ts, jamais ailleurs (ADR-0069 § 3).`,
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
