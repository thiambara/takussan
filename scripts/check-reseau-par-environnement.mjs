#!/usr/bin/env node
/**
 * Garde « UN RÉSEAU, UN REDIS ET UN NOM D'API PAR ENVIRONNEMENT » (ADR-0069 § 4, TCK-880).
 *
 * Le défaut qu'elle ferme : toutes les piles du serveur partagent `dokploy-network`, et Compose y
 * donne à chaque service le nom de son service. Avec deux environnements, `api` désigne DEUX API :
 * un front qui joint `http://api:8080` tombe sur l'une ou l'autre, au gré de Docker, sans erreur.
 * De même, un Redis posé sur ce réseau est joignable par toutes les piles — c'était
 * `redis-takussan`, qui mêlait le cache et les sessions de la préproduction et de la production.
 *
 * Ce qu'elle vérifie :
 *   1. Aucune URL vers l'hôte `api` dans la configuration et la documentation de déploiement
 *      (`deploy/**`, `docs/infra/**`, les deux `.env.example`) : le front joint l'API par
 *      l'alias de SON environnement (`takussan-api-preview`, `takussan-api-production`).
 *   2. Dans `deploy/takussan/compose.api.yml` :
 *      - le service `api` porte l'alias `${API_ALIAS…}` sur `dokploy-network` ;
 *      - le service `redis` existe, n'est PAS sur `dokploy-network` et ne publie aucun port ;
 *      - `REDIS_HOST: redis` est écrit dans le fichier (et non laissé à l'onglet Environment, où
 *        une valeur oubliée viserait encore `redis-takussan`).
 *
 * Ce qu'elle ne voit pas : ce que Dokploy déploie réellement. `smoke-api.sh pile` le prouve sur
 * la pile locale (alias joignable, Redis injoignable depuis `dokploy-network`, cache écrit dans le
 * Redis de la pile), et le relevé de `docs/infra/hebergement.md` sur le serveur.
 *
 * Usage :  node scripts/check-reseau-par-environnement.mjs [--report]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.CHECK_RESEAU_RACINE ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const COMPOSE = 'deploy/takussan/compose.api.yml';
const DOSSIERS = ['deploy', 'docs/infra'];
const FICHIERS = ['takussan-web/.env.example', 'takussan-api/.env.example'];
const URL_API = /\bhttps?:\/\/api(?=[:/\s`'")]|$)/;

function sous(dir) {
  const out = [];
  for (const nom of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, nom);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sous(rel));
    else out.push(rel);
  }
  return out;
}

const erreurs = [];

// 1. Aucune URL vers l'hôte `api`.
const lus = [...DOSSIERS.flatMap(sous), ...FICHIERS].filter((rel) => existsSync(join(ROOT, rel))).sort();
if (lus.length < DOSSIERS.length + FICHIERS.length) {
  console.error(`✗ seulement ${lus.length} fichier(s) lu(s) sous ${[...DOSSIERS, ...FICHIERS].join(', ')} : la garde ne trouve plus ce qu'elle garde.`);
  process.exit(2);
}
for (const rel of lus) {
  readFileSync(join(ROOT, rel), 'utf8').split('\n').forEach((ligne, i) => {
    if (URL_API.test(ligne)) {
      erreurs.push(`${rel}:${i + 1} — URL vers l'hôte \`api\` : sur dokploy-network, ce nom désigne l'API de CHAQUE environnement. Joindre l'API par l'alias de son environnement (\`takussan-api-preview\`, \`takussan-api-production\`, ADR-0069 § 4).`);
    }
  });
}

// 2. Le fichier Compose de la pile d'API.
if (!existsSync(join(ROOT, COMPOSE))) {
  console.error(`✗ ${COMPOSE} introuvable : la garde ne trouve plus ce qu'elle garde.`);
  process.exit(2);
}
const lignes = readFileSync(join(ROOT, COMPOSE), 'utf8')
  .split('\n')
  .map((l) => l.replace(/^\s*#.*$/, '').replace(/\s#.*$/, ''));

/** Les lignes d'un bloc de premier niveau (`services:`) ou d'un service (indentation 2). */
function bloc(debut, indent) {
  const i = lignes.findIndex((l) => l === `${' '.repeat(indent)}${debut}:` || l.startsWith(`${' '.repeat(indent)}${debut}: `));
  if (i < 0) return null;
  const out = [];
  for (const l of lignes.slice(i + 1)) {
    if (l.trim() === '') continue;
    if (l.length - l.trimStart().length <= indent) break;
    out.push(l);
  }
  return out;
}

const services = bloc('services', 0);
const service = (nom) => {
  if (!services) return null;
  const i = services.findIndex((l) => l === `  ${nom}:`);
  if (i < 0) return null;
  const out = [];
  for (const l of services.slice(i + 1)) {
    if (l.length - l.trimStart().length <= 2) break;
    out.push(l);
  }
  return out;
};
/** Les réseaux d'un service : la liste sous `networks:` (forme liste ou forme table). */
function reseaux(lignesService) {
  const i = lignesService.findIndex((l) => /^ {4}networks:\s*$/.test(l));
  if (i < 0) return null;
  const out = [];
  for (const l of lignesService.slice(i + 1)) {
    const ind = l.length - l.trimStart().length;
    if (ind <= 4) break;
    const m = ind === 6 && l.trim().match(/^(?:-\s*)?([\w.-]+):?/);
    if (m) out.push(m[1]);
  }
  return out;
}

const api = service('api');
const redis = service('redis');
if (!services || !api) {
  erreurs.push(`${COMPOSE} — services \`api\` introuvable : la garde ne lit plus le fichier.`);
} else {
  const texte = api.join('\n');
  if (!/^ {6}dokploy-network:\s*\n {8}aliases:\s*\n {10}- \$\{API_ALIAS[:?}]/m.test(texte)) {
    erreurs.push(`${COMPOSE} — le service \`api\` ne porte pas l'alias \`\${API_ALIAS}\` sur dokploy-network : le front n'a plus de nom propre à son environnement pour le joindre (ADR-0069 § 4).`);
  }
}
if (!redis) {
  erreurs.push(`${COMPOSE} — aucun service \`redis\` : chaque environnement porte son Redis dans sa pile (ADR-0069 § 4).`);
} else {
  const r = reseaux(redis);
  if (!r || r.length === 0) {
    erreurs.push(`${COMPOSE} — le service \`redis\` ne déclare pas ses réseaux : sans eux, Compose le pose sur le réseau par défaut de la pile, que rien ne nomme ici.`);
  } else if (r.includes('dokploy-network')) {
    erreurs.push(`${COMPOSE} — le service \`redis\` est sur dokploy-network : toutes les piles du serveur le joindraient (ADR-0069 § 4).`);
  }
  if (redis.some((l) => /^ {4}ports:/.test(l))) {
    erreurs.push(`${COMPOSE} — le service \`redis\` publie un port : il ne doit être joignable que de sa pile.`);
  }
}
if (!lignes.some((l) => /^\s+REDIS_HOST:\s*["']?redis["']?\s*$/.test(l))) {
  erreurs.push(`${COMPOSE} — \`REDIS_HOST: redis\` n'est pas écrit dans le fichier : laissé à l'onglet Environment de Dokploy, il peut viser un autre Redis (ADR-0069 § 4).`);
}

if (REPORT) console.log(`${lus.length} fichier(s) lus sous ${[...DOSSIERS, ...FICHIERS].join(', ')} ; réseaux de \`redis\` : ${redis ? (reseaux(redis) ?? []).join(', ') || '—' : 'service absent'}`);
if (erreurs.length) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ aucune URL vers l'hôte \`api\` dans ${lus.length} fichier(s) de déploiement ; \`api\` joint par \`\${API_ALIAS}\`, Redis propre à la pile, hors de dokploy-network.`);
