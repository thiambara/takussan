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

/**
 * Une clé COMMENTÉE ne compte que si l'autre fichier la connaît aussi.
 *
 * L'intention d'origine tient : `# CACHE_PREFIX=` d'un côté et `CACHE_PREFIX=` de l'autre, c'est
 * la même clé laissée à son défaut, et commenter une clé ne doit pas suffire à la faire sortir
 * du contrat en silence. Cette lecture-là est préservée : dès que l'autre fichier connaît le
 * nom, la comparaison a lieu comme avant.
 *
 * Ce qui ne tenait pas : une ligne commentée qui n'existe NULLE PART ailleurs devenait une clé
 * de plein droit. Or les deux fichiers que ce dépôt compare sont abondamment annotés en prose,
 * et une note aussi banale que `# MEILI_MASTER_KEY=masterKey (cf. docker-compose.yml)` — un nom
 * qui n'est pas une clé applicative et qui ne figure dans aucun des deux — faisait rougir Repo
 * CI sur une modification purement documentaire. Le correctif attendu était alors de retirer le
 * commentaire : la garde enseignait à moins documenter.
 *
 * *Un contrat se déduit de ce que les DEUX parties déclarent ; ce qu'une seule mentionne en
 * passant est une note, pas une clause.*
 */
function elaguer(propre, autre) {
  const out = new Map();
  for (const [k, v] of propre) {
    if (v.commentee && !autre.has(k)) continue;
    out.set(k, v);
  }
  return out;
}
const A = elaguer(a, b);
const B = elaguer(b, a);

const manquantesDansB = [...A.keys()].filter((k) => !B.has(k));
const manquantesDansA = [...B.keys()].filter((k) => !A.has(k));

if (REPORT) {
  console.log(`${nomA} : ${A.size} clés · ${nomB} : ${B.size} clés`);
  const commun = [...A.keys()].filter((k) => B.has(k)).length;
  console.log(`communes : ${commun}`);
  const notes = (a.size - A.size) + (b.size - B.size);
  if (notes) console.log(`(${notes} ligne(s) commentée(s) traitée(s) comme note, non comme clé)`);
}

const erreurs = [];
for (const k of manquantesDansB) {
  erreurs.push(`${k} : déclarée dans ${nomA} (ligne ${A.get(k).ligne}), absente de ${nomB}`);
}
for (const k of manquantesDansA) {
  erreurs.push(`${k} : déclarée dans ${nomB} (ligne ${B.get(k).ligne}), absente de ${nomA}`);
}

if (erreurs.length === 0) {
  console.log(`✓ parité des clés d'environnement : ${A.size} clés des deux côtés.`);
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
