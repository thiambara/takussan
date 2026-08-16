#!/usr/bin/env node
/**
 * Garde des VERSIONS D'INFRASTRUCTURE : le dépôt dit-il encore la vérité sur ce qu'il exécute,
 * et avoue-t-il encore ce qu'il ignore de la production ?
 *
 * ─── Le défaut qu'elle attrape ──────────────────────────────────────────────────────────────
 *
 * Mesuré le 2026-08-16 (TCK-298) : développement et CI sont épinglés des deux côtés — `mysql:8.0`,
 * `getmeili/meilisearch:v1.16`, `redis:8-alpine`, `axllent/mailpit:v1.30.3`, PHP `8.4`, Node `24`.
 * La PRODUCTION ne l'est nulle part. `scripts/server-setup.sh` n'installe rien : il vérifie la
 * présence de PHP-FPM et de nginx et imprime la commande à lancer à la main. Le seul document qui
 * nomme une installation — `docs/infra/deploy-preview.html` §6.4, `apt install meilisearch` — est
 * un GUIDE, et un guide n'a jamais été exécuté par personne au moment où on le lit.
 *
 * C'est mot pour mot la mécanique de D-43 : le compose et la CI ont tourné sur `mariadb:11.4`
 * parce qu'un commentaire affirmait ce que « `apt install mariadb-server` pose sur le serveur ».
 * La machine, elle, servait MySQL 8.0.46. *Ne jamais déduire l'état d'un environnement de la
 * configuration — ni de la commande d'installation — qui le vise.*
 *
 * ─── Ce que cette garde vérifie, exactement ─────────────────────────────────────────────────
 *
 * Elle ne cherche pas « une version quelque part ». Elle tient cinq propriétés :
 *
 *   R1  Le catalogue et le dépôt disent la MÊME chose. Chaque valeur `dev`/`ci` de
 *       `docs/infra/versions.json` est une citation : la garde la retrouve dans le fichier qui la
 *       déclare, à l'identique.
 *   R2  Le dépôt ne déclare RIEN que le catalogue ignore. Toute image de conteneur, tout
 *       `php-version:`/`node-version:` trouvé dans le périmètre doit être rattachable à un
 *       service du catalogue. Ajouter un service sans l'y inscrire rougit.
 *   R3  Une déclaration ne peut pas DISPARAÎTRE en silence. Un service dont le catalogue annonce
 *       une valeur pour un environnement doit y être trouvé au moins une fois.
 *   R4  L'aveu d'ignorance est OBLIGATOIRE et OUTILLÉ. Chaque service porte, pour la production,
 *       soit une valeur mesurée (commande + date + référence), soit `non_mesure` avec la commande
 *       qui la mesurerait. Il n'existe pas de troisième état — une version « probable » est une
 *       version fausse qui n'a pas encore coûté.
 *   R5  Les valeurs partagées avec une autre garde restent d'accord (`accords_croises`).
 *
 * ─── Pourquoi R3 et R2, et pas seulement R1 ─────────────────────────────────────────────────
 *
 * `check-db-engine.mjs` a payé cette leçon, prouvée par mutation : en SUPPRIMANT la ligne
 * `--collation-server=…` du compose, la garde restait verte — elle ne trouvait plus de valeur
 * divergente parce qu'elle n'en trouvait plus du tout. *Une garde qui ne vérifie que l'absence
 * d'erreur prend la suppression pour une correction.* R3 couvre la disparition, R2 l'arrivée.
 *
 * Usage :
 *   node scripts/check-infra-versions.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-infra-versions.mjs --report   # + le tableau dev / CI / prod
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const CATALOGUE = 'docs/infra/versions.json';

/**
 * Le périmètre, par ENVIRONNEMENT — c'est le groupe du fichier qui dit quel environnement une
 * valeur trouvée décrit, jamais le catalogue. Une image lue dans `docker-compose.yml` décrit le
 * développement ; la même lue dans un workflow décrit la CI.
 *
 * Les workflows sont ÉNUMÉRÉS PAR LECTURE DU DOSSIER et non listés à la main. Une garde dont le
 * périmètre est une liste écrite cesse de couvrir le fichier qu'on ajoute — et c'est précisément
 * ce que l'en-tête de `repo-ci.yml` raconte avoir vécu trois fois de suite sur ses déclencheurs.
 */
const DOSSIER_WORKFLOWS = '.github/workflows';

function fichiersYaml() {
  const dir = join(ROOT, DOSSIER_WORKFLOWS);
  if (!existsSync(dir)) return { dev: ['docker-compose.yml'], ci: [] };
  const ci = readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map((f) => `${DOSSIER_WORKFLOWS}/${f}`);
  return { dev: ['docker-compose.yml'], ci };
}

/**
 * ⚠ `[^\S\n]*` et non `\s*` pour l'indentation. `\s` mange les SAUTS DE LIGNE : le `m.index`
 * d'une correspondance ouverte par `^\s*` remonte alors jusqu'aux lignes vides qui la précèdent,
 * et le numéro rapporté envoie lire ailleurs. `check-db-engine.mjs` a rapporté la ligne 78 pour
 * une image qui est ligne 81, en plein commentaire. *Une garde qui pointe la mauvaise ligne fait
 * chercher le défaut là où il n'est pas.*
 */
const IMAGE = /^[^\S\n]*image:[^\S\n]*["']?([^"'\s#]+)["']?[^\S\n]*$/gm;
const cleYaml = (cle) => new RegExp(`^[^\\S\\n]*${cle}:[^\\S\\n]*["']?([^"'\\s#]+)["']?[^\\S\\n]*$`, 'gm');

/**
 * Les COMMENTAIRES sont neutralisés avant l'analyse. Ce fichier-ci, `check-db-engine.mjs`,
 * `docker-compose.yml` et `repo-ci.yml` RACONTENT tous les versions écartées — « le compose
 * tournait sur `mariadb:11.4` » — et ces phrases sont la mémoire du défaut. Une garde qui exige
 * qu'on les efface fait payer la documentation pour un mot. Ce qui compte, c'est ce qui DÉCLARE.
 *
 * Les lignes sont VIDÉES et non supprimées : les numéros rapportés restent ceux du fichier réel.
 */
function elaguer(texte) {
  return texte.split('\n').map((l) => (/^\s*#/.test(l) ? '' : l)).join('\n');
}

/**
 * Même principe pour un fichier JavaScript — et ce n'est PAS un raffinement, c'est une correction.
 *
 * L'accord croisé avec `check-db-engine.mjs` (R5) cherchait le littéral dans le fichier ENTIER.
 * Prouvé par mutation : en remplaçant `version: '8.0.46-…'` par `'8.0.47-…'` dans la constante
 * `PROD`, la garde restait VERTE — parce que l'ancienne valeur survit trois fois dans le docblock
 * qui RACONTE la mesure (`ii mysql-server 8.0.46-…`). La garde lisait donc la mémoire du défaut et
 * la prenait pour la déclaration.
 *
 * *Un accord croisé qui accepte une correspondance en commentaire n'accorde rien : il constate que
 * les deux fichiers se souviennent de la même chose, pas qu'ils déclarent la même chose.*
 *
 * Les blocs `/* … *\/` sont vidés, ainsi que les lignes dont le premier caractère non blanc ouvre
 * un commentaire. Un `//` en FIN de ligne de code est laissé : le retirer exigerait de savoir ce
 * qui est une chaîne, et une garde qui tronque `'http://…'` rougirait sur du code juste.
 */
function elaguerJs(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? '' : l))
    .join('\n');
}

const sansCommentaires = (texte, rel) => (/\.(m?js|cjs|ts)$/.test(rel) ? elaguerJs(texte) : elaguer(texte));

const numeroLigne = (texte, index) => texte.slice(0, index).split('\n').length;

const erreurs = [];
const trouvailles = []; // [service|null, env, fichier, ligne, valeur, type]

// ─── Le catalogue ────────────────────────────────────────────────────────────────────────────
const cheminCatalogue = join(ROOT, CATALOGUE);
if (!existsSync(cheminCatalogue)) {
  console.error(`\n✗ ${CATALOGUE} est introuvable — la garde n'a rien à confronter au dépôt.`);
  process.exit(1);
}

let catalogue;
try {
  catalogue = JSON.parse(readFileSync(cheminCatalogue, 'utf8'));
} catch (e) {
  console.error(`\n✗ ${CATALOGUE} n'est pas un JSON valide : ${e.message}`);
  process.exit(1);
}

const services = catalogue.services ?? {};
const noms = Object.keys(services);

if (noms.length === 0) {
  console.error(`\n✗ ${CATALOGUE} ne décrit aucun service — la garde ne garderait rien.`);
  process.exit(1);
}

// ─── R4 — la forme du catalogue : mesuré, ou avoué non mesuré ────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;

for (const [nom, svc] of Object.entries(services)) {
  if (svc.sondes === undefined || !Array.isArray(svc.sondes) || svc.sondes.length === 0) {
    erreurs.push(`${nom} — aucune \`sondes\` : rien ne rattacherait ce service à une déclaration du dépôt.`);
  }

  for (const env of ['dev', 'ci']) {
    const e = svc[env];
    if (e === undefined) {
      erreurs.push(`${nom}.${env} — entrée absente. Les trois environnements sont obligatoires.`);
      continue;
    }
    if (!('valeur' in e)) {
      erreurs.push(`${nom}.${env} — pas de champ \`valeur\`.`);
      continue;
    }
    // Nuller sans expliquer, c'est désarmer la garde en silence : cf. la mutation de D-43.
    if (e.valeur === null && !e.absence) {
      erreurs.push(
        `${nom}.${env} — \`valeur: null\` sans \`absence\`. Un environnement sans déclaration doit `
        + `dire POURQUOI ; sinon supprimer une version épinglée revient à rendre la garde muette.`,
      );
    }
  }

  const p = svc.prod;
  if (p === undefined) {
    erreurs.push(`${nom}.prod — entrée absente.`);
  } else if (p.etat === 'mesure') {
    // AC3 : une valeur de production cite sa source — commande ET date.
    if (!p.valeur) erreurs.push(`${nom}.prod — \`etat: mesure\` sans \`valeur\`.`);
    if (!p.commande) erreurs.push(`${nom}.prod — mesuré sans \`commande\` : la mesure n'est pas reproductible.`);
    if (!ISO.test(p.date ?? '')) erreurs.push(`${nom}.prod — \`date\` absente ou hors format AAAA-MM-JJ (lu : ${JSON.stringify(p.date)}).`);
    if (!p.source) erreurs.push(`${nom}.prod — mesuré sans \`source\` : on ne peut pas remonter à qui l'a relevé.`);
  } else if (p.etat === 'non_mesure') {
    // AC1 : « non mesuré » n'est acceptable QUE s'il nomme la commande à lancer.
    if (p.valeur !== null) {
      erreurs.push(
        `${nom}.prod — \`etat: non_mesure\` mais \`valeur\` vaut ${JSON.stringify(p.valeur)}. `
        + `Une version non mesurée n'est pas une version : c'est une supposition.`,
      );
    }
    if (!p.commande) {
      erreurs.push(
        `${nom}.prod — « non mesuré » sans \`commande\`. Avouer l'ignorance sans dire comment en `
        + `sortir laisse le lecteur exactement où il était.`,
      );
    }
    if (!p.pourquoi) erreurs.push(`${nom}.prod — « non mesuré » sans \`pourquoi\`.`);
  } else {
    erreurs.push(
      `${nom}.prod — \`etat\` vaut ${JSON.stringify(p.etat)} ; seuls \`mesure\` et \`non_mesure\` `
      + `existent. Une version déduite d'un guide d'installation ou d'un déploiement réussi n'est `
      + `pas une mesure (ardoise D-43).`,
    );
  }
}

// ─── L'index des sondes : de ce qu'on lit dans le dépôt vers un service ──────────────────────
const parDepot = new Map();   // 'mysql' → nom de service
const parCleYaml = new Map(); // 'php-version' → nom de service
const sondesJson = [];        // { service, env, fichier, chemin }

for (const [nom, svc] of Object.entries(services)) {
  for (const sonde of svc.sondes ?? []) {
    if (sonde.type === 'image') {
      if (parDepot.has(sonde.depot)) {
        erreurs.push(`dépôt d'image \`${sonde.depot}\` réclamé par ${parDepot.get(sonde.depot)} ET ${nom}.`);
      }
      parDepot.set(sonde.depot, nom);
    } else if (sonde.type === 'cle-yaml') {
      if (parCleYaml.has(sonde.cle)) {
        erreurs.push(`clé YAML \`${sonde.cle}\` réclamée par ${parCleYaml.get(sonde.cle)} ET ${nom}.`);
      }
      parCleYaml.set(sonde.cle, nom);
    } else if (sonde.type === 'json') {
      sondesJson.push({ service: nom, ...sonde });
    } else {
      erreurs.push(`${nom} — type de sonde inconnu : ${JSON.stringify(sonde.type)}.`);
    }
  }
}

// ─── Le balayage : R1 (les valeurs concordent) et R2 (rien n'échappe au catalogue) ───────────
const GROUPES = fichiersYaml();

for (const [env, fichiers] of Object.entries(GROUPES)) {
  for (const rel of fichiers) {
    const chemin = join(ROOT, rel);
    if (!existsSync(chemin)) {
      // Un fichier du périmètre qui disparaît doit rougir, pas être ignoré : c'est ainsi qu'une
      // garde se met à ne plus rien lire tout en restant verte.
      erreurs.push(`${rel} est introuvable — la garde ne peut rien y vérifier.`);
      continue;
    }
    const texte = elaguer(readFileSync(chemin, 'utf8'));

    for (const m of texte.matchAll(IMAGE)) {
      const ligne = numeroLigne(texte, m.index);
      const ref = m[1];
      // Le dépôt de l'image, c'est tout ce qui précède le DERNIER `:` — un registre porteur de
      // port (`registry:5000/x:1.2`) ne doit pas faire prendre le port pour un tag.
      const coupe = ref.lastIndexOf(':');
      const depot = coupe > 0 ? ref.slice(0, coupe) : ref;
      const service = parDepot.get(depot) ?? null;
      trouvailles.push([service, env, rel, ligne, ref, 'image']);

      if (!service) {
        erreurs.push(
          `${rel}:${ligne} — image \`${ref}\` déclarée dans le dépôt mais ABSENTE de ${CATALOGUE}. `
          + `Un service qu'aucun catalogue ne nomme est un service dont personne ne sait ce que la `
          + `production en exécute.`,
        );
        continue;
      }
      comparer(service, env, rel, ligne, ref);
    }

    for (const [cle, service] of parCleYaml) {
      for (const m of texte.matchAll(cleYaml(cle))) {
        const ligne = numeroLigne(texte, m.index);
        trouvailles.push([service, env, rel, ligne, m[1], cle]);
        comparer(service, env, rel, ligne, m[1]);
      }
    }
  }
}

for (const sonde of sondesJson) {
  const chemin = join(ROOT, sonde.fichier);
  if (!existsSync(chemin)) {
    erreurs.push(`${sonde.fichier} est introuvable — sonde \`json\` de ${sonde.service} inopérante.`);
    continue;
  }
  let valeur;
  try {
    valeur = sonde.chemin.reduce((o, k) => (o == null ? undefined : o[k]), JSON.parse(readFileSync(chemin, 'utf8')));
  } catch (e) {
    erreurs.push(`${sonde.fichier} n'est pas un JSON valide : ${e.message}`);
    continue;
  }
  if (valeur === undefined) {
    erreurs.push(
      `${sonde.fichier} — le chemin \`${sonde.chemin.join('.')}\` a disparu, alors que ${CATALOGUE} `
      + `y lit la version ${sonde.env} de ${sonde.service}.`,
    );
    continue;
  }
  trouvailles.push([sonde.service, sonde.env, sonde.fichier, null, String(valeur), sonde.chemin.join('.')]);
  comparer(sonde.service, sonde.env, sonde.fichier, null, String(valeur));
}

function comparer(service, env, rel, ligne, trouve) {
  const attendu = services[service]?.[env];
  const ou = ligne === null ? rel : `${rel}:${ligne}`;
  if (!attendu) return; // déjà signalé par le contrôle de forme
  if (attendu.valeur === null) {
    erreurs.push(
      `${ou} — ${service} est déclaré ici (\`${trouve}\`) alors que ${CATALOGUE} annonce `
      + `\`${env}: null\`. Le catalogue croit ce service absent de cet environnement.`,
    );
    return;
  }
  if (trouve !== attendu.valeur) {
    erreurs.push(
      `${ou} — ${service} en ${env.toUpperCase()} vaut \`${trouve}\` ; ${CATALOGUE} déclare `
      + `\`${attendu.valeur}\`. Aligner la déclaration sur le catalogue, ou mettre le catalogue à `
      + `jour — mais pas les deux séparément, c'est ainsi qu'ils divergent.`,
    );
  }
}

// ─── R3 — une déclaration ne disparaît pas en silence ────────────────────────────────────────
for (const [nom, svc] of Object.entries(services)) {
  for (const env of ['dev', 'ci']) {
    if (!svc[env] || svc[env].valeur === null) continue;
    const vus = trouvailles.filter(([s, e]) => s === nom && e === env);
    if (vus.length === 0) {
      erreurs.push(
        `${nom}.${env} — ${CATALOGUE} déclare \`${svc[env].valeur}\`, mais AUCUNE déclaration n'a `
        + `été trouvée dans le périmètre ${env}. Soit elle a été supprimée, soit elle a déménagé `
        + `hors de portée de la garde ; dans les deux cas la garde ne vérifiait plus rien ici.`,
      );
    }
  }
}

// ─── R5 — les valeurs partagées avec une autre garde restent d'accord ────────────────────────
let accords = 0;
for (const [nom, svc] of Object.entries(services)) {
  for (const [rel, litteral] of svc.accords_croises ?? []) {
    accords += 1;
    const chemin = join(ROOT, rel);
    if (!existsSync(chemin)) {
      erreurs.push(`${rel} est introuvable — accord croisé de ${nom} invérifiable.`);
      continue;
    }
    // Sur le texte ÉLAGUÉ : une valeur qui ne survit qu'en commentaire n'est plus déclarée.
    if (!sansCommentaires(readFileSync(chemin, 'utf8'), rel).includes(litteral)) {
      erreurs.push(
        `${rel} ne déclare plus \`${litteral}\` (hors commentaires), valeur que ${CATALOGUE} attribue à ${nom}. `
        + `Deux gardes qui portent la même valeur mesurée doivent la porter à l'identique, sinon `
        + `l'une des deux ment sans que l'autre s'en aperçoive.`,
      );
    }
  }
}

// Une garde qui ne trouve RIEN à vérifier est une garde qui ne garde plus rien — et elle sort
// verte, ce qui est le pire des deux mondes.
if (trouvailles.length === 0) {
  erreurs.push(
    'aucune déclaration de version trouvée dans le périmètre — les motifs ne correspondent plus, '
    + 'ou les déclarations ont déménagé. La garde ne vérifiait plus aucune version.',
  );
}

// ─── Sortie ──────────────────────────────────────────────────────────────────────────────────
if (REPORT) {
  const mesures = noms.filter((n) => services[n].prod?.etat === 'mesure');
  console.log(`Catalogue : ${CATALOGUE} — ${noms.length} service(s).\n`);
  const l = (s, n) => String(s).padEnd(n);
  console.log(`  ${l('SERVICE', 14)}${l('DEV', 28)}${l('CI', 28)}PROD`);
  for (const nom of noms) {
    const s = services[nom];
    const prod = s.prod?.etat === 'mesure'
      ? `${s.prod.valeur}  (mesuré ${s.prod.date})`
      : 'NON MESURÉ';
    console.log(`  ${l(nom, 14)}${l(s.dev?.valeur ?? '—', 28)}${l(s.ci?.valeur ?? '—', 28)}${prod}`);
  }
  console.log(
    `\n  ${mesures.length}/${noms.length} service(s) mesuré(s) en production. Les autres portent la `
    + `commande qui les mesurerait — cf. docs/infra/versions.md.`,
  );
  console.log(
    `\nPérimètre : ${GROUPES.dev.join(', ')} (dev) · ${GROUPES.ci.length} workflow(s) (CI) · `
    + `${sondesJson.length} sonde(s) JSON · ${accords} accord(s) croisé(s).`,
  );
  console.log(`\nDéclarations confrontées (${trouvailles.length}) :`);
  for (const [s, e, f, li, v, t] of trouvailles) {
    console.log(`  ${l(e, 5)}${l(s ?? '???', 14)}${l(v, 28)}${f}${li === null ? ` (${t})` : `:${li}`}`);
  }
  console.log();
}

if (erreurs.length === 0) {
  console.log(
    `✓ versions d'infrastructure : ${trouvailles.length} déclaration(s) conformes au catalogue, `
    + `${noms.length} service(s) dont la ligne « production » est mesurée ou explicitement avouée.`,
  );
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} écart(s) sur les versions d'infrastructure :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\n${CATALOGUE} est la source unique. Une version qui bouge s'y écrit d'abord, et le dépôt suit.\n`
  + `Pour la colonne « production », rien ne se recopie d'un guide d'installation : on lance la\n`
  + `commande sur la machine et on date le relevé — c'est la leçon de l'ardoise D-43, où la CI a\n`
  + `tourné sur le mauvais MOTEUR de base de données parce qu'un commentaire affirmait ce qu'un\n`
  + `« apt install » que personne n'avait exécuté était censé avoir posé.\n`
  + `Mode d'emploi et commandes de mesure : docs/infra/versions.md`,
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
