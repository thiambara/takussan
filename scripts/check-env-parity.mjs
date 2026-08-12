#!/usr/bin/env node
/**
 * Garde de PARITÉ des clés d'environnement.
 *
 * `takussan-api/.env.example` est le contrat des clés : ce que l'application sait lire.
 * `takussan-api/.env.docker` est l'environnement de développement réel, servi par le
 * `docker-compose.yml` de la racine. Les deux décrivent le même logiciel — donc le
 * même jeu de clés — avec des VALEURS différentes, et c'est tout l'intérêt.
 *
 * Le défaut que cette garde attrape est le plus banal et le plus coûteux : une clé
 * ajoutée d'un seul côté. Elle ne casse rien tout de suite. Elle casse le jour où
 * quelqu'un reprend le projet, copie le mauvais fichier, et cherche pendant une heure
 * pourquoi une intégration lit `null`. Rien dans l'exécution ne signale l'absence
 * d'une clé : `env('TRUC')` rend `null` et le code continue.
 *
 * Cette garde ne compare QUE les noms de clés, jamais les valeurs — deux fichiers dont
 * les valeurs seraient identiques n'auraient aucune raison d'être deux.
 *
 * Usage :
 *   node scripts/check-env-parity.mjs          # sort en 1 sur le moindre écart
 *   node scripts/check-env-parity.mjs --report # liste les clés des deux côtés
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const FICHIERS = [
  ['.env.example', join(ROOT, 'takussan-api', '.env.example')],
  ['.env.docker', join(ROOT, 'takussan-api', '.env.docker')],
];

/**
 * Les clés DÉCLARÉES d'un fichier .env.
 *
 * Une clé commentée (`# CACHE_PREFIX=`) compte comme déclarée : c'est une clé que
 * l'application connaît, laissée à sa valeur par défaut. La distinguer de l'absence
 * est justement ce qui rend la garde utile — sinon commenter une clé d'un côté
 * suffirait à la faire disparaître du contrat sans que rien ne le dise.
 */
function clefs(contenu) {
  const out = new Map(); // nom → { ligne, commentee }
  contenu.split('\n').forEach((ligne, i) => {
    const m = ligne.match(/^\s*(#\s*)?([A-Z][A-Z0-9_]*)\s*=/);
    if (!m) return;
    // Une ligne commentée n'est une DÉCLARATION que si elle a la forme `# CLE=`.
    // Le texte en prose d'un commentaire ne doit jamais être lu comme une clé —
    // sans cette précaution, une phrase du genre « # NOTE=... » en inventerait une.
    if (m[1] && !/^\s*#\s*[A-Z][A-Z0-9_]*\s*=/.test(ligne)) return;
    if (!out.has(m[2])) out.set(m[2], { ligne: i + 1, commentee: Boolean(m[1]) });
  });
  return out;
}

const lus = [];
for (const [nom, chemin] of FICHIERS) {
  if (!existsSync(chemin)) {
    console.error(`✗ ${nom} : fichier introuvable (${chemin})`);
    process.exit(1);
  }
  lus.push([nom, clefs(readFileSync(chemin, 'utf8'))]);
}

const [[nomA, a], [nomB, b]] = lus;

const manquantesDansB = [...a.keys()].filter((k) => !b.has(k));
const manquantesDansA = [...b.keys()].filter((k) => !a.has(k));

if (REPORT) {
  console.log(`${nomA} : ${a.size} clés · ${nomB} : ${b.size} clés`);
  const commun = [...a.keys()].filter((k) => b.has(k)).length;
  console.log(`communes : ${commun}`);
}

const erreurs = [];
for (const k of manquantesDansB) {
  erreurs.push(`${k} : déclarée dans ${nomA} (ligne ${a.get(k).ligne}), absente de ${nomB}`);
}
for (const k of manquantesDansA) {
  erreurs.push(`${k} : déclarée dans ${nomB} (ligne ${b.get(k).ligne}), absente de ${nomA}`);
}

if (erreurs.length === 0) {
  console.log(`✓ parité des clés d'environnement : ${a.size} clés des deux côtés.`);
  process.exit(0);
}

console.error(`✗ ${erreurs.length} écart(s) entre ${nomA} et ${nomB} :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nUne clé ne vit que d'un côté. Ajoute-la à l'autre fichier avec la valeur qui\n` +
    `convient à SON environnement — ou retire-la des deux si elle est morte.`
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde. Une option qui fait
// sortir un contrôle en 0 quoi qu'il arrive est une garde armée qui ne mord pas — et
// c'est le défaut le plus difficile à voir, puisque le pipeline reste vert.
process.exit(1);
