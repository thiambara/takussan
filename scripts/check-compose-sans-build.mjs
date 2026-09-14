#!/usr/bin/env node
/**
 * Garde « AUCUNE IMAGE NE SE CONSTRUIT SUR LE SERVEUR » (ADR-0028 §2, TCK-527).
 *
 * Le défaut qu'elle ferme : Dokploy déploie chaque pile par `docker compose … up -d --build`
 * (commande relevée, hebergement.md). `--build` ne fait rien tant qu'aucun service du fichier ne
 * porte `build:` — et le jour où l'un en porte un, le serveur CONSTRUIT, avec 8 Go partagés par
 * quatre environnements, ce que l'ADR interdit (« Construire une image sur le serveur »). Rien ne
 * l'empêchait : ni Dokploy, ni Compose, ni une relecture. Une interdiction que rien ne garde est
 * une intention.
 *
 * Ce qu'elle vérifie : aucune clé `build:` (à n'importe quelle profondeur, hors commentaires) dans
 * les fichiers Compose de `deploy/**` — ceux que Dokploy joue. Chaque service y déclare `image:`.
 *
 * Ce qu'elle ne touche PAS : `docker-compose.yml` à la racine, qui sert le poste de développement
 * (ADR-0020 : PostgreSQL, Meilisearch, Redis, Mailpit) — construire en local est libre.
 *
 * Usage :  node scripts/check-compose-sans-build.mjs [--report]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const RACINE = 'deploy';

function composeSous(dir) {
  const out = [];
  for (const nom of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, nom);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...composeSous(rel));
    else if (/\.ya?ml$/.test(nom)) out.push(rel);
  }
  return out.sort();
}

const fichiers = composeSous(RACINE);
if (fichiers.length === 0) {
  console.error(`✗ aucun fichier YAML sous ${RACINE}/ : la garde ne trouve plus ce qu'elle garde.`);
  process.exit(2);
}

const erreurs = [];
let services = 0;
for (const rel of fichiers) {
  const lignes = readFileSync(join(ROOT, rel), 'utf8').split('\n');
  lignes.forEach((brute, i) => {
    const ligne = brute.replace(/\s#.*$/, '').replace(/^\s*#.*$/, ''); // commentaires retirés
    if (/^\s*image:\s*\S/.test(ligne)) services += 1;
    if (/^\s*(-\s*)?build:(\s|$)/.test(ligne)) {
      erreurs.push(`${rel}:${i + 1} — \`build:\` : ce fichier est joué par Dokploy avec \`--build\`, le serveur construirait l'image (ADR-0028 §2). Les images se construisent en CI (images.yml) et se tirent par \`image:\`.`);
    }
  });
}

if (REPORT) console.log(`fichiers Compose de ${RACINE}/ (${fichiers.length}) : ${fichiers.join(', ')} ; ${services} déclaration(s) \`image:\``);
if (services === 0) {
  console.error(`✗ aucune déclaration \`image:\` trouvée sous ${RACINE}/ : les motifs ne lisent plus ces fichiers.`);
  process.exit(2);
}
if (erreurs.length) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ aucun \`build:\` dans les ${fichiers.length} fichier(s) Compose de ${RACINE}/ : rien ne se construit sur le serveur.`);
