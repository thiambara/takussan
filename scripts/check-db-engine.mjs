#!/usr/bin/env node
/**
 * Garde du MOTEUR DE BASE : un seul moteur, une seule version, une seule collation.
 *
 * ─── Le défaut qu'elle attrape a été réel, et il a duré six semaines ─────────────────────────
 *
 * Le job `migrations-mysql` d'`api-ci.yml` et `docker-compose.yml` tournaient tous deux sur
 * `mariadb:11.4` avec `utf8mb4_unicode_ci`. Le commentaire du job justifiait ce choix par
 * « c'est ce que `apt install mariadb-server` pose sur le serveur ». Personne n'avait exécuté
 * cette commande. Mesuré sur le serveur le 2026-08-13 :
 *
 *     $ dpkg -l | grep -Ei 'mysql-server|mariadb-server'
 *     ii  mysql-server  8.0.46-0ubuntu0.24.04.3
 *     $ sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"
 *     8.0.46-0ubuntu0.24.04.3 | utf8mb4_0900_ai_ci | utf8mb4
 *
 * Ce n'était pas un écart de version : c'était le mauvais MOTEUR, et une autre collation. Le
 * banc d'essai éprouvait donc un DDL sur un moteur que la production n'exécuterait jamais, en
 * annonçant l'inverse à chaque exécution.
 *
 * ─── Ce que cette garde vérifie, exactement ─────────────────────────────────────────────────
 *
 * Elle ne cherche PAS « est-ce que le mot mysql apparaît quelque part » — ce serait mesurer une
 * ressemblance avec le dernier bug. Elle vérifie deux propriétés :
 *
 *   1. Toute image de conteneur de base de données déclarée dans le dépôt vaut EXACTEMENT
 *      l'image épinglée. Une seule ligne revenue à `mariadb:11.4` rougit, où qu'elle soit.
 *   2. Toute collation `utf8mb4_*` écrite dans le dépôt vaut EXACTEMENT celle de la production.
 *      Une base de test créée dans une autre collation n'éprouve pas les comparaisons de
 *      chaînes de la production (unicité des e-mails, `LIKE` de recherche).
 *
 * La valeur de référence est celle de la PRODUCTION, et elle est écrite ici avec la commande qui
 * l'a produite et la date où elle l'a été. *Le banc d'essai reproduit la production ; il ne la
 * prescrit pas.* Le jour où le serveur change de moteur, c'est cette constante qu'on remesure —
 * et les consommateurs suivent, parce que la garde ne les laisse pas rester en arrière.
 *
 * Usage :
 *   node scripts/check-db-engine.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-db-engine.mjs --report   # + l'inventaire de ce qui a été lu
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

/**
 * LA PRODUCTION, MESURÉE — pas déduite d'une commande d'installation supposée.
 *
 * Serveur Contabo, Ubuntu 24.04, le 2026-08-13 :
 *     sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"
 *     8.0.46-0ubuntu0.24.04.3 | utf8mb4_0900_ai_ci | utf8mb4
 *
 * L'image est épinglée sur la BRANCHE `8.0` et non sur `8.0.46` : le correctif de sécurité que
 * `apt` posera sur le serveur ne doit pas faire rougir la CI, alors qu'un passage en 8.4 ou en
 * 9.x, lui, doit être une décision.
 */
const PROD = {
  image: 'mysql:8.0',
  version: '8.0.46-0ubuntu0.24.04.3',
  collation: 'utf8mb4_0900_ai_ci',
  charset: 'utf8mb4',
  mesure: '2026-08-13',
};

/**
 * Le périmètre — les fichiers qui déclarent un moteur ou une collation.
 *
 * `takussan-api/config/database.php` en est ABSENT volontairement : sa clé `mariadb` est une
 * définition de driver livrée par Laravel, disponible mais non utilisée (`DB_CONNECTION=mysql`
 * partout). Elle n'épingle rien, et l'inclure ferait rougir la garde sur du code qui ne décide
 * de rien. *Une garde qui rougit sur du code juste finit par être désarmée.*
 */
const FICHIERS = [
  'docker-compose.yml',
  '.github/workflows/api-ci.yml',
  'docker/mysql-init.sql',
];

/**
 * Les images de conteneur de base de données — par identité d'image, pas par nom de service.
 *
 * ⚠ `[^\S\n]*` et non `\s*` pour l'indentation, et ce n'était pas une coquetterie : `\s` mange
 * les SAUTS DE LIGNE. Le `m.index` d'une correspondance ouverte par `^\s*` remonte donc aussi
 * haut que les lignes vides qui la précèdent — et comme `elaguer()` vide les commentaires,
 * l'image de `docker-compose.yml` était rapportée ligne 78 quand elle est ligne 81.
 *
 * La garde était juste sur le fond et fausse sur l'adresse : elle envoyait lire trois lignes
 * plus haut, en plein commentaire. Trouvé en confrontant sa sortie à un `grep -n`.
 * *Une garde qui pointe la mauvaise ligne fait chercher le défaut là où il n'est pas.*
 */
const IMAGE_BDD = /^[^\S\n]*image:[^\S\n]*["']?((?:mysql|mariadb|percona|bitnami\/mysql|mysql\/mysql-server)[^"'\s]*)["']?[^\S\n]*$/gm;

/** Toute collation utf8mb4 écrite, quel que soit le fichier et la syntaxe qui la porte. */
const COLLATION = /utf8mb4_[a-z0-9_]+/g;

/**
 * Les COMMENTAIRES sont neutralisés avant l'analyse — et la première version ne le faisait pas.
 *
 * Elle rougissait sur deux lignes d'`api-ci.yml` qui *racontent* les collations écartées :
 * « `utf8mb4_unicode_ci` (ce que posait le compose) ne compare pas comme `utf8mb4_0900_ai_ci` »,
 * et « `utf8mb4_general_ci` jusqu'à MySQL 5.7 ». Ces phrases sont exactes, elles sont la mémoire
 * du défaut, et une garde qui exige qu'on les efface fait payer la documentation pour un mot.
 *
 * Ce que la garde doit vérifier, c'est ce qui DÉCLARE — un argument de serveur, un `COLLATE`,
 * une comparaison de shell — pas ce qui mentionne. Un commentaire n'est exécuté par personne.
 *
 * Les lignes sont VIDÉES et non supprimées : les numéros de ligne rapportés restent ceux du
 * fichier réel. Une garde qui pointe la mauvaise ligne envoie chercher le défaut ailleurs.
 */
function elaguer(texte, rel) {
  const motif = rel.endsWith('.sql') ? /^\s*--/ : /^\s*#/;
  return texte.split('\n').map((l) => (motif.test(l) ? '' : l)).join('\n');
}

/**
 * Les DÉCLARATIONS EXIGÉES — parce que « aucune valeur fausse » n'est pas « la bonne valeur ».
 *
 * Prouvé par mutation : en supprimant purement et simplement la ligne `--collation-server=…` de
 * `docker-compose.yml`, la garde restait VERTE. Elle ne trouvait plus aucune collation
 * divergente, pour l'excellente raison qu'elle n'en trouvait plus du tout à cet endroit — et le
 * développement retombait sur le défaut de l'image, silencieusement.
 *
 * Aujourd'hui ce défaut vaut justement `utf8mb4_0900_ai_ci`, donc rien ne casserait. C'est
 * exactement ce qui rend l'omission dangereuse : elle ne se manifesterait qu'au changement de
 * version de l'image, longtemps après que la ligne a disparu, et le compose affirme dans son
 * propre commentaire qu'« un défaut non écrit est un défaut qu'on ne remarque pas quand il
 * change ».
 *
 * *Une garde qui ne vérifie que l'absence d'erreur passe la suppression pour une correction.*
 */
const DECLARATIONS = [
  ['docker-compose.yml', `--collation-server=${PROD.collation}`,
    'le développement retombe sinon sur le défaut de l\'image, sans que rien ne le dise'],
  ['docker-compose.yml', `--character-set-server=${PROD.charset}`,
    'même raison, pour le jeu de caractères'],
  ['docker/mysql-init.sql', `COLLATE ${PROD.collation}`,
    'la base de TEST doit comparer les chaînes comme la production, sinon elle n\'éprouve rien'],
  ['.github/workflows/api-ci.yml', '@@collation_server',
    'le conteneur de service n\'accepte pas d\'arguments : sa collation ne peut être que MESURÉE'],
];

const erreurs = [];
const vus = { images: [], collations: [] };

for (const rel of FICHIERS) {
  const chemin = join(ROOT, rel);
  if (!existsSync(chemin)) {
    // Un fichier du périmètre qui disparaît doit rougir, pas être ignoré en silence : c'est
    // exactement ainsi qu'une garde se met à ne plus rien lire tout en restant verte.
    erreurs.push(`${rel} est introuvable — la garde ne peut rien y vérifier.`);
    continue;
  }
  const texte = elaguer(readFileSync(chemin, 'utf8'), rel);

  for (const m of texte.matchAll(IMAGE_BDD)) {
    const ligne = texte.slice(0, m.index).split('\n').length;
    vus.images.push([rel, ligne, m[1]]);
    if (m[1] !== PROD.image) {
      erreurs.push(
        `${rel}:${ligne} — image \`${m[1]}\` alors que la production tourne sur \`${PROD.image}\`.`,
      );
    }
  }

  for (const m of texte.matchAll(COLLATION)) {
    const ligne = texte.slice(0, m.index).split('\n').length;
    vus.collations.push([rel, ligne, m[0]]);
    if (m[0] !== PROD.collation) {
      erreurs.push(
        `${rel}:${ligne} — collation \`${m[0]}\` alors que la production sert \`${PROD.collation}\`.`,
      );
    }
  }
}

for (const [rel, attendu, pourquoi] of DECLARATIONS) {
  const chemin = join(ROOT, rel);
  if (!existsSync(chemin)) continue; // déjà signalé plus haut
  // Sur le texte ÉLAGUÉ : une déclaration commentée n'est pas une déclaration.
  if (!elaguer(readFileSync(chemin, 'utf8'), rel).includes(attendu)) {
    erreurs.push(`${rel} ne déclare plus \`${attendu}\` — ${pourquoi}.`);
  }
}

// Une garde qui ne trouve RIEN à vérifier est une garde qui ne garde plus rien — et elle sort
// verte, ce qui est le pire des deux mondes. `check-queues.mjs` a payé cette leçon : un motif
// qui cesse de correspondre passe inaperçu tant que personne ne compte ses correspondances.
if (vus.images.length === 0) {
  erreurs.push(
    'aucune image de base de données trouvée dans le périmètre — le motif ne correspond plus à '
    + 'rien, ou les déclarations ont déménagé. La garde ne vérifiait plus le moteur.',
  );
}
if (vus.collations.length === 0) {
  erreurs.push(
    'aucune collation `utf8mb4_*` trouvée dans le périmètre — les déclarations de collation ont '
    + 'disparu ou déménagé, et la comparaison de chaînes de la production n\'est plus reproduite.',
  );
}

if (REPORT) {
  console.log(
    `Production mesurée le ${PROD.mesure} : ${PROD.version} · ${PROD.collation} · ${PROD.charset}`,
  );
  console.log(`  sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"\n`);
  console.log(`Fichiers balayés (${FICHIERS.length}) : ${FICHIERS.join(', ')}\n`);
  console.log(`Images de base de données (${vus.images.length}) :`);
  for (const [f, l, img] of vus.images) console.log(`  ${img.padEnd(14)} ${f}:${l}`);
  console.log(`\nCollations (${vus.collations.length}) :`);
  for (const [f, l, c] of vus.collations) console.log(`  ${c.padEnd(20)} ${f}:${l}`);
  console.log();
}

if (erreurs.length === 0) {
  console.log(
    `✓ moteur de base : ${vus.images.length} image(s) et ${vus.collations.length} collation(s) `
    + `alignées sur la production (${PROD.image} · ${PROD.collation}).`,
  );
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} écart(s) avec le moteur de production :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nLa production a été MESURÉE le ${PROD.mesure} : ${PROD.version}, ${PROD.collation}.\n`
  + `Un banc d'essai sur un autre moteur éprouve un DDL que la production n'exécutera jamais,\n`
  + `et deux collations différentes ne comparent pas les chaînes de la même façon.\n`
  + `Si le serveur a changé, remesure-le et corrige la constante PROD de ce fichier — c'est la\n`
  + `production qui fait foi, jamais l'inverse.`,
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
