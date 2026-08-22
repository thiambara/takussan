#!/usr/bin/env node
/**
 * Garde du MOTEUR DE BASE : un seul moteur, une seule image, une seule collation.
 *
 * ─── Le défaut qu'elle attrape a été réel, et il a duré des mois ─────────────────────────────
 *
 * Le job `migrations-mysql` d'`api-ci.yml` et `docker-compose.yml` tournaient tous deux sur
 * `mariadb:11.4` avec `utf8mb4_unicode_ci`. Le commentaire du job justifiait ce choix par
 * « c'est ce que `apt install mariadb-server` pose sur le serveur ». Personne n'avait exécuté
 * cette commande. Mesuré sur le serveur le 2026-08-13 : `mysql-server 8.0.46`,
 * `utf8mb4_0900_ai_ci`. Ce n'était pas un écart de version, c'était le mauvais MOTEUR.
 *
 * *Ne jamais déduire l'état d'un environnement de la configuration — ni de la commande
 * d'installation — qui le vise.* Cette leçon-là survit à la migration ; c'est même elle qui
 * gouverne la forme que prend la constante CIBLE ci-dessous.
 *
 * ─── ADR-0020 : la cible n'est plus MySQL, et elle n'est plus MESURÉE ────────────────────────
 *
 * Le dépôt est passé à PostgreSQL 17 sur tous les environnements, suite de tests comprise.
 *
 * ⚠ Et c'est ici que cette garde change de NATURE, pas seulement de valeurs. La constante
 * s'appelait `PROD` et portait ce qu'on avait MESURÉ sur le serveur. Elle s'appelle désormais
 * `CIBLE` et porte ce qu'un ADR a DÉCIDÉ — parce que l'API n'a jamais été déployée (dette D-04 :
 * `api.takussan.com/up` → 404, `deploy.yml` mort deux fois le 2026-08-15 sur l'authentification
 * MySQL de `takussan_prod`). **Il n'existe aucun PostgreSQL de production à mesurer.**
 *
 * Renommer n'est pas cosmétique : une constante qui s'appelle `PROD` invite le lecteur à croire
 * qu'elle a été relevée quelque part. Celle-ci ne l'a pas été, et le prétendre serait refaire
 * exactement la faute de `mariadb:11.4` — un banc d'essai qui affirme reproduire une production
 * que personne n'a regardée.
 *
 * **Le jour où le serveur existe (TCK-288), la première chose à faire est de le mesurer et de
 * comparer à cette constante** — et si les deux divergent, c'est le serveur qui fait foi.
 *
 * ─── Ce que cette garde vérifie, exactement ──────────────────────────────────────────────────
 *
 * Elle ne cherche PAS « est-ce que le mot postgres apparaît quelque part » — ce serait mesurer
 * une ressemblance avec le dernier bug. Elle vérifie trois propriétés :
 *
 *   1. Toute image de conteneur de base déclarée dans le dépôt vaut EXACTEMENT l'image épinglée.
 *      ⚠ Le motif attrape DÉLIBÉRÉMENT `postgres:17` tout court, qui est le repli naturel de
 *      quiconque copie ce service ailleurs — et qui ferme le motif pgvector EN SILENCE :
 *      l'application démarre, les tests passent, et c'est le jour du chatbot que
 *      `CREATE EXTENSION vector` échoue, des mois plus tard.
 *   2. Aucune image MySQL/MariaDB ne réapparaît. Le moteur a été retiré, pas rendu optionnel
 *      (ADR-0020) ; un `docker-compose.override.yml` qui le ramène rouvre la divergence que
 *      toute la migration a servi à fermer.
 *   3. Toute déclaration de collation vaut celle de la cible. `--locale=C` porte la décision la
 *      plus lourde de l'ADR-0020 : comparaison DÉTERMINISTE, sensible à la casse et aux accents.
 *      Six contraintes d'unicité sur texte en dépendent — et une contrainte qui change de sens
 *      ne lève pas d'erreur, elle laisse passer un doublon en silence.
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
 * LA CIBLE — DÉCIDÉE par ADR-0020, et NON mesurée sur un serveur. Cf. l'en-tête : il n'existe
 * pas encore de production PostgreSQL (D-04).
 *
 * Ce qui A été mesuré, c'est le conteneur de développement, le 2026-08-21 :
 *
 *     SELECT current_setting('server_version'), datcollate, datctype, pg_encoding_to_char(encoding)
 *     FROM pg_database WHERE datname = current_database();
 *     → 17.11 (Debian 17.11-1.pgdg12+2) | C | C | UTF8
 *
 *     SELECT name, default_version FROM pg_available_extensions WHERE name = 'vector';
 *     → vector | 0.8.6
 *
 * ⚠ `current_setting('lc_collate')` N'EXISTE PLUS à l'exécution en PostgreSQL 17 (« unrecognized
 * configuration parameter ») : la collation est une propriété de la BASE, elle se lit dans
 * `pg_database`. La première version de cette mesure employait l'ancienne forme et échouait.
 *
 * L'image est épinglée sur la BRANCHE `pg17` : un correctif de la branche ne doit pas faire
 * rougir la CI, alors qu'un passage en 18 doit rester une décision.
 */
const CIBLE = {
  image: 'pgvector/pgvector:pg17',
  version: '17.11 (Debian 17.11-1.pgdg12+2)',
  collation: 'C',
  charset: 'UTF8',
  extension: 'vector',
  etat: 'décidée par ADR-0020 ; mesurée sur le conteneur de développement le 2026-08-21 ; JAMAIS mesurée en production (D-04)',
};

/**
 * Le périmètre — les fichiers qui déclarent un moteur ou une collation.
 *
 * `takussan-api/config/database.php` en est ABSENT volontairement : ses clés `mysql`, `mariadb`
 * et `sqlite` sont des définitions de driver livrées par Laravel, disponibles mais non utilisées
 * (`DB_CONNECTION=pgsql` partout). Elles n'épinglent rien, et les inclure ferait rougir la garde
 * sur du code qui ne décide de rien. *Une garde qui rougit sur du code juste finit par être
 * désarmée.*
 */
const FICHIERS = [
  'docker-compose.yml',
  '.github/workflows/api-ci.yml',
  'docker/pgsql-init.sql',
];

/**
 * Les images de conteneur de base de données — par identité d'image, pas par nom de service.
 *
 * ⚠ `[^\S\n]*` et non `\s*` pour l'indentation, et ce n'était pas une coquetterie : `\s` mange
 * les SAUTS DE LIGNE. Le `m.index` d'une correspondance ouverte par `^\s*` remonte donc aussi
 * haut que les lignes vides qui la précèdent — et comme `elaguer()` vide les commentaires,
 * l'image était rapportée trois lignes trop haut, en plein commentaire.
 * *Une garde qui pointe la mauvaise ligne fait chercher le défaut là où il n'est pas.*
 *
 * ⚠⚠ `postgres` figure dans l'alternance AVEC `pgvector` : c'est volontaire, et c'est le cas le
 * plus utile de tout ce fichier. `image: postgres:17` est parfaitement fonctionnel — il ne
 * rougirait nulle part ailleurs — et il retire silencieusement `pgvector`, donc le motif entier
 * de la migration (le chatbot). Un défaut qui ne se manifeste que des mois plus tard, sur un
 * autre chantier, est exactement ce qu'une garde doit attraper.
 */
const IMAGE_BDD = /^[^\S\n]*image:[^\S\n]*["']?((?:pgvector\/pgvector|postgres|postgis\/postgis|timescale\/timescaledb|mysql|mariadb|percona|bitnami\/(?:mysql|postgresql)|mysql\/mysql-server)[^"'\s]*)["']?[^\S\n]*$/gm;

/**
 * Les moteurs RETIRÉS par ADR-0020. Leur retour est un écart, pas une variante.
 *
 * Le message d'erreur les distingue de « mauvaise version du bon moteur » : ce n'est pas la même
 * faute et ce n'est pas la même correction.
 */
const RETIRES = /^(mysql|mariadb|percona|bitnami\/mysql|mysql\/mysql-server)/;

/** Toute collation de base déclarée dans un `POSTGRES_INITDB_ARGS`, quelle que soit sa syntaxe. */
const COLLATION = /--locale=([A-Za-z0-9_.@-]+)/g;

/**
 * Les COMMENTAIRES sont neutralisés avant l'analyse — et la première version ne le faisait pas.
 *
 * Elle rougissait sur des lignes qui *racontent* les moteurs écartés. Ces phrases sont exactes,
 * elles sont la mémoire du défaut, et une garde qui exige qu'on les efface fait payer la
 * documentation pour un mot. Ce que la garde doit vérifier, c'est ce qui DÉCLARE — une image, un
 * argument d'initialisation — pas ce qui mentionne. Un commentaire n'est exécuté par personne.
 *
 * ⚠ Cette neutralisation devient PLUS importante après la migration, pas moins : les fichiers du
 * périmètre sont désormais pleins de commentaires qui expliquent pourquoi MySQL a été retiré. Les
 * lignes sont VIDÉES et non supprimées, pour que les numéros rapportés restent ceux du fichier.
 */
function elaguer(texte, rel) {
  const motif = rel.endsWith('.sql') ? /^\s*--/ : /^\s*#/;
  return texte.split('\n').map((l) => (motif.test(l) ? '' : l)).join('\n');
}

/**
 * Les DÉCLARATIONS EXIGÉES — parce que « aucune valeur fausse » n'est pas « la bonne valeur ».
 *
 * Prouvé par mutation sur la version MySQL de cette garde : en supprimant purement et simplement
 * la ligne `--collation-server=…` de `docker-compose.yml`, la garde restait VERTE. Elle ne
 * trouvait plus aucune collation divergente, pour l'excellente raison qu'elle n'en trouvait plus
 * du tout à cet endroit — et le développement retombait sur le défaut de l'image, silencieusement.
 *
 * Le piège est IDENTIQUE ici, et il mord plus fort : sans `--locale=C`, l'image retombe sur la
 * locale par défaut du conteneur. Ce n'est pas une nuance de tri — c'est le sens des six
 * contraintes d'unicité sur texte (`users.email`, `users.username`, `properties.slug`,
 * `agencies.slug`, `tags.name`, `tags.slug`) qui change, sans qu'aucune erreur ne soit levée.
 *
 * *Une garde qui ne vérifie que l'absence d'erreur passe la suppression pour une correction.*
 */
const DECLARATIONS = [
  ['docker-compose.yml', `--locale=${CIBLE.collation}`,
    'le développement retombe sinon sur la locale par défaut de l\'image, et les six contraintes d\'unicité sur texte changent de sens en silence'],
  ['docker-compose.yml', `--encoding=${CIBLE.charset}`,
    'même raison, pour l\'encodage'],
  ['.github/workflows/api-ci.yml', `--locale=${CIBLE.collation}`,
    'une base de CI dans une autre collation n\'éprouve pas les comparaisons de chaînes du dépôt'],
  ['.github/workflows/api-ci.yml', `--encoding=${CIBLE.charset}`,
    'même raison, pour l\'encodage'],
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

    if (m[1] === CIBLE.image) continue;

    if (RETIRES.test(m[1])) {
      erreurs.push(
        `${rel}:${ligne} — image \`${m[1]}\` : ce moteur a été RETIRÉ par ADR-0020, pas rendu `
        + `optionnel. Le ramener rouvre la divergence « tests sur un moteur, production sur un `
        + `autre » que toute la migration a servi à fermer.`,
      );
    } else if (m[1].startsWith('postgres')) {
      erreurs.push(
        `${rel}:${ligne} — image \`${m[1]}\` au lieu de \`${CIBLE.image}\`. C'est le bon moteur `
        + `SANS pgvector : rien ne rougira, l'application démarrera, et c'est le jour du chatbot `
        + `que \`CREATE EXTENSION vector\` échouera (ADR-0020 §2).`,
      );
    } else {
      erreurs.push(
        `${rel}:${ligne} — image \`${m[1]}\` alors que la cible est \`${CIBLE.image}\`.`,
      );
    }
  }

  for (const m of texte.matchAll(COLLATION)) {
    const ligne = texte.slice(0, m.index).split('\n').length;
    vus.collations.push([rel, ligne, m[1]]);
    if (m[1] !== CIBLE.collation) {
      erreurs.push(
        `${rel}:${ligne} — locale \`${m[1]}\` alors que la cible est \`${CIBLE.collation}\`. `
        + `ADR-0020 exige une collation DÉTERMINISTE : une collation non déterministe fait `
        + `refuser \`LIKE\` par PostgreSQL, et le dépôt en compte 21.`,
      );
    }
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
    'aucune locale `--locale=` trouvée dans le périmètre — les déclarations de collation ont '
    + 'disparu ou déménagé, et le sens des contraintes d\'unicité sur texte n\'est plus fixé.',
  );
}

for (const [rel, attendu, pourquoi] of DECLARATIONS) {
  const chemin = join(ROOT, rel);
  if (!existsSync(chemin)) continue; // déjà signalé plus haut
  // Sur le texte ÉLAGUÉ : une déclaration commentée n'est pas une déclaration.
  if (!elaguer(readFileSync(chemin, 'utf8'), rel).includes(attendu)) {
    erreurs.push(`${rel} ne déclare plus \`${attendu}\` — ${pourquoi}.`);
  }
}

if (REPORT) {
  console.log(`Cible : ${CIBLE.image} · locale ${CIBLE.collation} · encodage ${CIBLE.charset}`);
  console.log(`  état : ${CIBLE.etat}`);
  console.log('  SELECT current_setting(\'server_version\'), datcollate, datctype,');
  console.log('         pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database();\n');
  console.log(`Fichiers balayés (${FICHIERS.length}) : ${FICHIERS.join(', ')}\n`);
  console.log(`Images de base de données (${vus.images.length}) :`);
  for (const [f, l, img] of vus.images) console.log(`  ${img.padEnd(24)} ${f}:${l}`);
  console.log(`\nLocales (${vus.collations.length}) :`);
  for (const [f, l, c] of vus.collations) console.log(`  ${c.padEnd(24)} ${f}:${l}`);
  console.log();
}

if (erreurs.length === 0) {
  console.log(
    `✓ moteur de base : ${vus.images.length} image(s) et ${vus.collations.length} locale(s) `
    + `alignées sur la cible (${CIBLE.image} · locale ${CIBLE.collation}).`,
  );
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} écart(s) avec le moteur cible :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nLa cible est DÉCIDÉE par ADR-0020, pas relevée sur un serveur : la production PostgreSQL\n`
  + `n'existe pas encore (D-04, TCK-288). Le jour où elle existera, la MESURER et comparer —\n`
  + `et si les deux divergent, c'est le serveur qui fait foi, jamais ce fichier.\n`
  + `Un banc d'essai sur une autre image éprouve un moteur que la production n'exécutera pas,\n`
  + `et deux collations différentes ne comparent pas les chaînes de la même façon.`,
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
