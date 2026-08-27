#!/usr/bin/env node
/**
 * Garde de COUVERTURE des variables de build du front (TCK-431).
 *
 * Toute variable `NEXT_PUBLIC_*` que `takussan-web/` LIT doit être déclarée dans
 * `takussan-web/.env.example` **et** relevée dans `docs/infra/frontend-deploiement.json`.
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
for (const fichier of fichiers) {
  const lignes = readFileSync(fichier, 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    for (const m of ligne.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Za-z0-9_]+)/g)) {
      const cle = m[1];
      if (!lues.has(cle)) lues.set(cle, []);
      lues.get(cle).push(`${relative(ROOT, fichier)}:${i + 1}`);
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

for (const chemin of [ENV_EXEMPLE, RELEVE]) {
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

const erreurs = [];
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
  console.log(`${'clé'.padEnd(large)}  lectures  .env.example  relevé`);
  for (const cle of [...lues.keys()].sort()) {
    console.log(
      `${cle.padEnd(large)}  ${String(lues.get(cle).length).padEnd(8)}  ` +
        `${(declarees.has(cle) ? '✓' : '✗').padEnd(12)}  ${relevees.has(cle) ? '✓' : '✗'}`,
    );
  }
  console.log('');
}

if (erreurs.length === 0) {
  console.log(
    `✓ variables de build du front : ${lues.size} clé(s) NEXT_PUBLIC_* lue(s), toutes déclarées ` +
      `dans .env.example ET relevées dans frontend-deploiement.json.`,
  );
  process.exit(0);
}

console.error(`✗ ${erreurs.length} écart(s) sur les variables de build du front :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nUne NEXT_PUBLIC_* absente de l'environnement de build ne casse PAS le build : elle est\n` +
    `substituée par \`undefined\` dans le bundle livré, et le défaut n'apparaît qu'en production.\n` +
    `Déclarer la clé dans takussan-web/.env.example, et consigner sa valeur d'environnement dans\n` +
    `docs/infra/frontend-deploiement.json (champ variables_build).`,
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
