#!/usr/bin/env node
/**
 * Garde du CONFINEMENT de la configuration du front (ADR-0069 § 3 ; TCK-431, TCK-831, TCK-842).
 *
 * L'image du front ne porte aucun environnement : l'origine de l'API, celle du site et celle des
 * médias se lisent à l'exécution (`API_URL`, `SITE_URL`, `MEDIA_URL`), par un module unique,
 * `src/lib/config-publique.ts`, qui les transmet au navigateur. La garde refuse :
 *
 * · toute lecture de `process.env.NEXT_PUBLIC_*` dans `takussan-web/src` ou `next.config.ts`. Next
 *   la substitue À LA COMPILATION : une clé absente du build ne casse rien, elle devient `undefined`
 *   dans le JavaScript livré, et l'image redeviendrait propre à un environnement. Depuis TCK-842,
 *   le front n'en lit plus aucune ;
 * · une lecture de l'une des trois clés d'exécution HORS de ce module ;
 * · toute `NEXT_PUBLIC_*` dans le Dockerfile, ou passée par un workflow qui le construit ;
 * · une clé de plus dans la configuration transmise au navigateur (`ConfigPublique`), ou une
 *   variable d'environnement de plus lue par le module. Tout ce qu'il transmet est écrit en clair
 *   dans chaque page : la liste est fermée ICI, pour qu'un secret ne puisse pas y entrer sans
 *   qu'on modifie une garde en le sachant ;
 * · une clé d'exécution absente de `takussan-web/.env.example`, le contrat des clés du front.
 *
 * Non-vacuité : le module doit LIRE les trois clés. Une garde qui ne trouve plus sa cible passe au
 * vert en ne gardant plus rien, et sa sortie ressemble à un succès (D-15, D-18, D-44).
 *
 * Elle ne prouve pas que la valeur posée dans Dokploy soit juste : `docker/demarrer.mjs` refuse de
 * démarrer sans les trois origines bien formées, et `images.yml` prouve ce qui est servi.
 *
 * Usage :
 *   node scripts/check-front-env-keys.mjs            # sort en 1 au moindre écart
 *   node scripts/check-front-env-keys.mjs --report   # + les lectures relevées
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'takussan-web');
const REPORT = process.argv.includes('--report');

const SOURCES = [join(WEB, 'src'), join(WEB, 'next.config.ts')];
const ENV_EXEMPLE = join(WEB, '.env.example');
/**
 * ADR-0069 § 3 — ce qui CONSTRUIT l'image : le Dockerfile, et TOUT workflow qui le construit
 * (`context: takussan-web`, ou en matrice — images.yml, le build de contrôle de web-ci.yml). La
 * liste des workflows se dérive : un build de plus est gardé sans qu'on y pense.
 */
const DOCKERFILE = join(WEB, 'Dockerfile');
const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');
const WORKFLOW = join(WORKFLOWS_DIR, 'images.yml');
const WORKFLOWS_DU_FRONT = existsSync(WORKFLOWS_DIR)
  ? readdirSync(WORKFLOWS_DIR)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => join(WORKFLOWS_DIR, f))
      // `context: takussan-web`, ou la même valeur dans une matrice (`contexte: takussan-web`).
      .filter((f) => /^\s*context:\s*takussan-web\s*$|\bcontexte:\s*takussan-web\b/m.test(readFileSync(f, 'utf8')))
  : [];

/** Le seul module qui lit la configuration publique. */
const LECTEUR = join(WEB, 'src', 'lib', 'config-publique.ts');

/** Les clés d'exécution de l'image (ADR-0069 § 3) — et tout ce que le module a le droit de lire. */
const CLES_EXECUTION = ['API_URL', 'SITE_URL', 'MEDIA_URL'];

/** Les clés de `ConfigPublique`, écrites en clair dans chaque page servie. */
const CONFIG_DU_NAVIGATEUR = ['apiUrl', 'mediaUrl'];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

/**
 * Plancher de plausibilité, bien sous le compte réel (~880 fichiers balayés le 2026-08-27) : il
 * attrape « le dossier a été renommé », « un glob rend zéro fichier ».
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

for (const chemin of [ENV_EXEMPLE, DOCKERFILE, WORKFLOW, LECTEUR]) {
  if (!existsSync(chemin)) {
    console.error(`✗ ${relative(ROOT, chemin)} : introuvable. Le périmètre de la garde est périmé.`);
    process.exit(1);
  }
}

// Les sites de LECTURE, dans leur forme littérale — la seule que Next substitue.
const nextPublic = []; // toute lecture de process.env.NEXT_PUBLIC_*
const horsDuModule = []; // lectures d'une clé d'exécution hors du lecteur unique
const lecturesDuModule = new Set(); // clés d'exécution lues par le module
const lectureExecution = new RegExp(`process\\.env\\.(${CLES_EXECUTION.join('|')})\\b`, 'g');
for (const fichier of fichiers) {
  readFileSync(fichier, 'utf8').split('\n').forEach((ligne, i) => {
    const site = `${relative(ROOT, fichier)}:${i + 1}`;
    for (const m of ligne.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Za-z0-9_]+)/g)) nextPublic.push(`${m[1]} : lue par ${site}`);
    for (const m of ligne.matchAll(lectureExecution)) {
      if (fichier === LECTEUR) lecturesDuModule.add(m[1]);
      else horsDuModule.push(`${m[1]} : lue par ${site}`);
    }
  });
}

const manquantes = CLES_EXECUTION.filter((c) => !lecturesDuModule.has(c));
if (manquantes.length > 0) {
  console.error(
    `✗ ${relative(ROOT, LECTEUR)} ne lit plus ${manquantes.join(', ')}.\n` +
      `  Le module a changé de forme ou le motif est cassé : la garde ne mesure plus rien.`,
  );
  process.exit(1);
}

const declarees = new Set(
  readFileSync(ENV_EXEMPLE, 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/))
    .filter(Boolean)
    .map((m) => m[1]),
);

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
if (!WORKFLOWS_DU_FRONT.includes(WORKFLOW)) {
  console.error(
    `✗ ${relative(ROOT, WORKFLOW)} ne construit plus le front (\`context: takussan-web\`) : la ` +
      `dérivation des workflows de construction ne trouve plus sa cible.`,
  );
  process.exit(1);
}
const dansLaConstruction = [DOCKERFILE, ...WORKFLOWS_DU_FRONT].flatMap(mentionsDansLaConstruction);

const sourceDuModule = readFileSync(LECTEUR, 'utf8');
const lectureshorsListe = [...new Set([...sourceDuModule.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].filter(
  (cle) => !CLES_EXECUTION.includes(cle),
);
const typeConfig = sourceDuModule.match(/export type ConfigPublique = \{([\s\S]*?)\n\};/);
const clesConfig = typeConfig ? [...typeConfig[1].matchAll(/^\s*readonly (\w+)\??:/gm)].map((m) => m[1]) : [];

const erreurs = [];
for (const s of nextPublic) {
  erreurs.push(`${s} — Next l'inlinerait au build : lire la configuration par ${relative(ROOT, LECTEUR)} (ADR-0069 § 3)`);
}
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
for (const cle of CLES_EXECUTION.filter((c) => !declarees.has(c))) {
  erreurs.push(`${cle} : lue par ${relative(ROOT, LECTEUR)}, absente de ${relative(ROOT, ENV_EXEMPLE)}`);
}

if (REPORT) {
  console.log(
    `${fichiers.length} fichiers balayés ; ${relative(ROOT, LECTEUR)} lit [${[...lecturesDuModule].join(', ')}] ; ` +
      `${WORKFLOWS_DU_FRONT.length} workflow(s) construisent le front : ` +
      WORKFLOWS_DU_FRONT.map((f) => relative(ROOT, f)).join(', ') + '\n',
  );
}

if (erreurs.length === 0) {
  console.log(
    `✓ configuration du front : aucune NEXT_PUBLIC_* lue ; ${CLES_EXECUTION.join(', ')} lues par le seul ` +
      `config-publique.ts et déclarées dans .env.example ; aucune NEXT_PUBLIC_* dans le Dockerfile ni dans ` +
      `les ${WORKFLOWS_DU_FRONT.length} workflow(s) qui le construisent ; configuration du navigateur fermée ` +
      `sur [${CONFIG_DU_NAVIGATEUR.join(', ')}].`,
  );
  process.exit(0);
}

console.error(`✗ ${erreurs.length} écart(s) sur la configuration du front :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
