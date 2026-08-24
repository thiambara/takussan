#!/usr/bin/env node
/**
 * Garde des DÉPENDANCES DE DÉVELOPPEMENT ATTEIGNABLES DEPUIS LE CODE DE PRODUCTION
 * (TCK-354).
 *
 * Le défaut qu'elle attrape ne vit dans aucun fichier : il vit ENTRE deux, et aucun des
 * deux ne se contredit.
 *
 *   · `scripts/deploy.sh` installe en `composer install --no-dev` — juste, pour un
 *     déploiement ;
 *   · `App\Services\Payments\PaymentReceiptPdf` faisait `new Dompdf(…)` — du code de
 *     production parfaitement valide ;
 *   · `dompdf/dompdf` n'est déclaré NULLE PART dans `composer.json`. Il n'arrivait qu'en
 *     développement, et TRANSITIVEMENT, par les `require-dev` de
 *     `phpoffice/phpspreadsheet` et `spatie/laravel-pdf`.
 *
 * ⇒ Le téléchargement d'un reçu de paiement rendait **500 sur tout environnement
 *   déployé**, et localement il marchait. Mesuré le 2026-08-24 sur la préproduction :
 *   `Error — Class "Dompdf\Options" not found`.
 *
 * ⚠ **Aucun test ne peut voir cette classe de défaut**, et c'est le point : la suite
 * tourne avec les dépendances de développement installées. Un test qui appelle le reçu
 * est VERT en local et VERT en CI, pendant que la production rend 500. Seule une lecture
 * de `composer.lock` sait faire la différence entre « disponible ici » et « livré ».
 *
 * *Une dépendance qu'on n'a pas demandée est le pire cas : elle est là en développement,
 * absente en production, et rien dans le dépôt ne nomme l'écart.*
 *
 * ── CE QUE LA GARDE VÉRIFIE ────────────────────────────────────────────────────
 *
 *   A. Aucun `use` de `takussan-api/app/` ne vise un espace de noms fourni par un paquet
 *      que `composer.lock` ne connaît QU'EN `packages-dev`. L'index paquet→namespace est
 *      DÉRIVÉ du lock (`autoload.psr-4` et `psr-0`), jamais écrit à la main : un paquet
 *      qui change de namespace est suivi tout seul.
 *
 *   B. Aucun `use` de `app/` ne vise l'`autoload-dev` du dépôt lui-même (`Tests\`). Même
 *      défaut, même conséquence, et il ne passerait pas par le lock.
 *
 *   C. NON-VACUITÉ, sur les trois bouts. Un lock illisible, un index de namespaces vide,
 *      ou zéro import résolu depuis `app/` font ROUGIR la garde. Elle ne conclut jamais
 *      « aucun défaut » sur un tableau vide — c'est le mode de défaillance qui a déjà
 *      produit un faux négatif ailleurs dans ce dépôt (cf. `check-pro-routes.mjs`).
 *
 * ── CE QU'ELLE NE VÉRIFIE PAS ──────────────────────────────────────────────────
 *
 * Les usages qui ne passent pas par un `use` : `new \Dompdf\Dompdf`, `class_exists('…')`,
 * un nom de classe construit à l'exécution. Aucune lecture statique ne les couvre tous.
 * La garde est un PLANCHER — elle attrape la forme qui a réellement coûté, pas toutes les
 * formes concevables.
 *
 * Elle ne lit que `app/`. `database/seeders/` dépend de Faker par construction et n'a
 * aucune raison d'être livré : c'est TCK-353 qui traite ce cas-là, et par un autre
 * moyen.
 *
 * Usage :
 *   node scripts/check-deps-dev-atteignables.mjs
 *   node scripts/check-deps-dev-atteignables.mjs --report
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const API = join(ROOT, 'takussan-api');
const APP = join(API, 'app');
const LOCK = join(API, 'composer.lock');
const COMPOSER = join(API, 'composer.json');

/**
 * Planchers de non-vacuité. Mesurés le 2026-08-24 : 115 paquets de production,
 * 40 de développement, 4506 `use` résolus depuis 936 fichiers de `app/`.
 * Volontairement bas — ils disent « la garde reconnaît encore sa cible », pas « le dépôt
 * n'a pas changé ». Un plancher serré se fait desserrer ; un plancher qui n'attrape que
 * l'effondrement se fait garder.
 */
const MINIMUM_PAQUETS_PROD = 50;
const MINIMUM_PAQUETS_DEV = 5;
const MINIMUM_IMPORTS_RESOLUS = 200;

function echec(message) {
  console.error(`✗ dépendances de dév atteignables : ${message}`);
  process.exit(1);
}

for (const [chemin, quoi] of [
  [LOCK, 'composer.lock'],
  [COMPOSER, 'composer.json'],
  [APP, 'app/'],
]) {
  if (!existsSync(chemin)) {
    echec(
      `« takussan-api/${quoi} » est introuvable.\n` +
        `  La garde n'a PAS conclu « aucun défaut » : elle ne sait plus où chercher.`,
    );
  }
}

// ── L'index namespace → paquet, DÉRIVÉ du lock ────────────────────────────────
let lock;
try {
  lock = JSON.parse(readFileSync(LOCK, 'utf8'));
} catch (e) {
  echec(`composer.lock illisible (${e.message}).`);
}

const paquetsProd = lock.packages ?? [];
const paquetsDev = lock['packages-dev'] ?? [];

if (paquetsProd.length < MINIMUM_PAQUETS_PROD) {
  echec(
    `${paquetsProd.length} paquet(s) de production dans le lock, plancher ${MINIMUM_PAQUETS_PROD}.\n` +
      `  La garde ne reconnaît plus sa cible ; elle refuse de dire « rien à signaler ».`,
  );
}
if (paquetsDev.length < MINIMUM_PAQUETS_DEV) {
  echec(
    `${paquetsDev.length} paquet(s) de développement dans le lock, plancher ${MINIMUM_PAQUETS_DEV}.\n` +
      `  Sans eux la garde n'aurait plus rien à interdire — et se tairait.`,
  );
}

/** @returns {string[]} les préfixes de namespace qu'un paquet du lock déclare. */
function prefixesDe(paquet) {
  const out = [];
  for (const cle of ['psr-4', 'psr-0']) {
    const bloc = paquet.autoload?.[cle];
    if (!bloc) continue;
    for (const prefixe of Object.keys(bloc)) {
      if (prefixe) out.push(prefixe);
    }
  }
  return out;
}

/** namespace (avec `\` final) → { paquet, section }. La production gagne toujours. */
const index = new Map();
for (const [section, paquets] of [
  ['dev', paquetsDev],
  ['prod', paquetsProd],
]) {
  for (const paquet of paquets) {
    for (const prefixe of prefixesDe(paquet)) {
      // `prod` écrase `dev` volontairement : un paquet présent des deux côtés est livré.
      index.set(prefixe, { paquet: paquet.name, section });
    }
  }
}

// L'`autoload-dev` du dépôt lui-même (contrôle B) : même interdit, autre source.
let composer;
try {
  composer = JSON.parse(readFileSync(COMPOSER, 'utf8'));
} catch (e) {
  echec(`composer.json illisible (${e.message}).`);
}
for (const prefixe of Object.keys(composer['autoload-dev']?.['psr-4'] ?? {})) {
  index.set(prefixe, { paquet: 'takussan-api (autoload-dev)', section: 'dev' });
}
for (const prefixe of Object.keys(composer.autoload?.['psr-4'] ?? {})) {
  index.set(prefixe, { paquet: 'takussan-api (autoload)', section: 'prod' });
}

if (index.size === 0) {
  echec(`aucun préfixe de namespace dérivé du lock — l'index est vide, la garde est aveugle.`);
}

/** Le préfixe le PLUS LONG gagne : `Spatie\LaravelPdf\` avant `Spatie\`. */
const prefixesTries = [...index.keys()].sort((a, b) => b.length - a.length);

function paquetDe(fqcn) {
  for (const prefixe of prefixesTries) {
    if (fqcn.startsWith(prefixe)) return { prefixe, ...index.get(prefixe) };
  }
  return null;
}

// ── Les `use` de app/ ─────────────────────────────────────────────────────────
function fichiersPhp(repertoire) {
  const out = [];
  for (const entree of readdirSync(repertoire)) {
    const chemin = join(repertoire, entree);
    if (statSync(chemin).isDirectory()) out.push(...fichiersPhp(chemin));
    else if (entree.endsWith('.php')) out.push(chemin);
  }
  return out;
}

/**
 * Les `use` de PORTÉE FICHIER seulement — ceux qui commencent la ligne. Un
 * `use SomeTrait;` indenté dans un corps de classe est un trait, pas un import, et le
 * confondre ferait rougir la garde sur du code juste.
 *
 * Formes couvertes : `use A\B;`, `use A\B as C;`, `use function A\b;`,
 * `use const A\B;`, et le groupé `use A\B\{C, D as E};`.
 */
function importsDe(source) {
  const out = [];
  const re = /^use\s+(?:function\s+|const\s+)?([^;]+);/gm;
  let m;
  while ((m = re.exec(source)) !== null) {
    const brut = m[1].trim();
    const groupe = brut.match(/^(.+?)\\\{(.+)\}$/s);
    if (groupe) {
      const base = groupe[1].replace(/^\\/, '');
      for (const membre of groupe[2].split(',')) {
        const nom = membre.trim().split(/\s+as\s+/i)[0].trim();
        if (nom) out.push(`${base}\\${nom}`);
      }
      continue;
    }
    const nom = brut.split(/\s+as\s+/i)[0].trim().replace(/^\\/, '');
    // Sans antislash, ce n'est pas un import qualifié : rien à résoudre.
    if (nom.includes('\\')) out.push(nom);
  }
  return out;
}

const fichiers = fichiersPhp(APP);
if (fichiers.length === 0) {
  echec(`aucun fichier PHP sous app/ — la garde ne conclut pas sur un répertoire vide.`);
}

const erreurs = [];
let resolus = 0;
const paquetsVus = new Set();

for (const chemin of fichiers) {
  const source = readFileSync(chemin, 'utf8');
  const lignes = source.split('\n');
  for (const fqcn of importsDe(source)) {
    const trouve = paquetDe(fqcn);
    if (!trouve) continue;
    resolus += 1;
    paquetsVus.add(trouve.paquet);
    if (trouve.section !== 'dev') continue;

    const ligne = lignes.findIndex((l) => l.includes(fqcn.split('\\').slice(0, 3).join('\\'))) + 1;
    erreurs.push(
      `${relative(ROOT, chemin)}${ligne > 0 ? `:${ligne}` : ''} — importe « ${fqcn} »\n` +
        `      fourni par « ${trouve.paquet} », que composer.lock ne connaît qu'en require-dev.\n` +
        `      « composer install --no-dev » ne l'installe pas : ce code rend 500 en déploiement,\n` +
        `      et il est vert ici parce que la suite tourne avec les dépendances de dév.`,
    );
  }
}

// ── C. Non-vacuité côté résolution ────────────────────────────────────────────
if (resolus < MINIMUM_IMPORTS_RESOLUS) {
  echec(
    `${resolus} import(s) de app/ résolus vers un paquet, plancher ${MINIMUM_IMPORTS_RESOLUS}.\n` +
      `  L'appariement namespace→paquet ne fonctionne plus : la garde se tairait sur tout.`,
  );
}

if (REPORT) {
  console.log(`dépendances de dév atteignables depuis app/`);
  console.log(`  lock : ${paquetsProd.length} paquets de production, ${paquetsDev.length} de développement`);
  console.log(`  index : ${index.size} préfixes de namespace, dérivés du lock (jamais écrits à la main)`);
  console.log(`  app/ : ${fichiers.length} fichiers, ${resolus} imports résolus vers ${paquetsVus.size} paquets`);
  console.log(`  portée : les \`use\` de portée fichier. Un \`new \\Dompdf\\Dompdf\` en dur ou un`);
  console.log(`           class_exists('…') échappent à toute lecture statique — la garde est un`);
  console.log(`           plancher, pas une preuve d'absence.`);
}

if (erreurs.length > 0) {
  console.error(`✗ dépendances de dév atteignables — ${erreurs.length} défaut(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(
  `✓ dépendances de dév atteignables : ${resolus} imports de app/ vérifiés contre le lock, ` +
    `aucun ne vise un paquet require-dev`,
);
