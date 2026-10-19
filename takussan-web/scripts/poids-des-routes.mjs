#!/usr/bin/env node
/**
 * LE POIDS DU JS INITIAL DE CHAQUE ROUTE PUBLIQUE, LU SUR LA SORTIE DE `next build` — TCK-947
 * (P33.05).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Next 16 n'imprime plus la colonne « First Load JS » à la fin de `next build` : la sortie ne liste
 * que les routes et leur mode. Aucune garde ne voyait donc le poids d'une page, et deux défauts de
 * poids (P33.01, les polices ; P33.02, zod dans le layout racine) n'avaient cassé rien ni laissé de
 * trace dans aucun journal. L'ADR-0015 chiffrait le JS par page en 2026-08 ; rien ne l'avait
 * remesuré depuis.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT — UN RAPPORT, ET UN SEUL REFUS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il imprime, pour chaque route de `src/app/[locale]/(public)/`, le JS initial gzip et les polices
 * préchargées. **Aucun seuil** : le seuil est à décider à part, sur des chiffres que ce rapport
 * aura accumulés (décision du porteur, 2026-10-18).
 *
 * Il ne refuse qu'une chose : **zod dans le JS du layout racine** — sortie 1. Ce layout est chargé
 * par TOUTES les pages, console comprise ; zod n'y sert à rien (les formulaires sont des pages), et
 * il pesait 64 Kio gzip quand P33.02 (TCK-743) l'en a retiré. zod dans le JS d'une PAGE reste un
 * chiffre du rapport, pas un refus.
 *
 * ⚠ **Le refus ne porte que sur l'entrée `[project]/src/app/layout`**, comme la décision le dit.
 * `src/app/error`, `src/app/not-found` et `global-error` sont pourtant aussi dans les
 * `entryJSFiles` de CHAQUE route (et ce rapport les compte dans le JS initial) : zod importé par
 * `src/app/error.tsx` pèserait sur toutes les pages sans rien faire échouer. Trou connu, laissé
 * hors périmètre de TCK-947 ; l'étendre est une décision à part.
 *
 * Sortie 2 quand la sortie du build est absente ou illisible, ou qu'aucune route publique n'y est
 * trouvée : *un rapport qui n'a rien mesuré n'est pas un vert* — même règle que
 * `bin/coverage-gate.php` côté API.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE « JS INITIAL » VEUT DIRE ICI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'union de `rootMainFiles` (`build-manifest.json`, le cadre de Next) et de TOUS les
 * `entryJSFiles` du manifeste client de la route (`server/app/<route>_client-reference-manifest.js`) :
 * layouts, page, `error`, `loading`, `not-found` — ce que le HTML de la route annonce avant toute
 * interaction. Un morceau partagé n'est compté qu'une fois. Le gzip est celui de `zlib` à son
 * niveau par défaut (6), celui d'un serveur ordinaire ; un chiffre se compare donc à un autre
 * chiffre de ce script, pas à un relevé du navigateur (brotli, cache). Les polices sont celles que
 * `server/next-font-manifest.json` attache à la page — en octets bruts : un woff2 est déjà
 * compressé.
 *
 * Usage : `node scripts/poids-des-routes.mjs [dossier .next]` (défaut : `.next`), après
 * `npm run build`. Sans dépendance : il ne lit que des fichiers que `next build` produit déjà.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const PREFIXE_PUBLIC = '/[locale]/(public)/';
const ENTREE_LAYOUT_RACINE = '[project]/src/app/layout';

/**
 * zod 4 nomme chacune de ses classes par une chaîne passée à `$constructor` (`"$ZodError"`,
 * `"$ZodType"`…), et ces chaînes survivent à la minification. Un module qui se contente d'utiliser
 * zod (`@hookform/resolvers`) n'écrit que `x.$ZodError`, sans guillemets : il n'est pas compté.
 */
const MARQUE_ZOD = /["']\$Zod(?:Type|Error|Object|String)["']/;

const dossier = path.resolve(process.argv[2] ?? '.next');

function echec(message) {
  console.error(`✗ poids-des-routes : ${message}`);
  process.exit(2);
}

/**
 * Une lecture qui lève (JSON tronqué, manifeste client tronqué, police nommée mais absente) sort en
 * 2 par {@link echec}, jamais en 1 avec une pile : 1 est réservé au refus de zod.
 */
function lire(fichier, lecture) {
  try {
    return lecture();
  } catch (erreur) {
    return echec(`${fichier} illisible — ${String(erreur?.message ?? erreur).split('\n')[0]}`);
  }
}

function lireJson(relatif) {
  const fichier = path.join(dossier, relatif);
  if (!existsSync(fichier)) echec(`${fichier} absent — lancer \`npm run build\` d'abord.`);
  return lire(fichier, () => JSON.parse(readFileSync(fichier, 'utf8')));
}

/** Le manifeste client d'une route : un script qui écrit dans `globalThis.__RSC_MANIFEST`. */
function manifesteClient(cle) {
  const fichier = path.join(dossier, 'server/app', `${cle}_client-reference-manifest.js`);
  if (!existsSync(fichier)) echec(`${fichier} absent.`);
  const contexte = {};
  lire(fichier, () => vm.runInNewContext(readFileSync(fichier, 'utf8'), contexte));
  const manifeste = contexte.__RSC_MANIFEST?.[cle];
  if (!manifeste?.entryJSFiles) echec(`${fichier} ne déclare pas d'entryJSFiles pour « ${cle} ».`);
  return manifeste;
}

const octetsGzip = new Map();
function gzip(relatif) {
  if (!octetsGzip.has(relatif)) {
    const fichier = path.join(dossier, relatif);
    if (!existsSync(fichier)) echec(`${fichier} absent : le manifeste nomme un morceau que le build n'a pas écrit.`);
    octetsGzip.set(relatif, gzipSync(readFileSync(fichier)).length);
  }
  return octetsGzip.get(relatif);
}

const kio = (octets) => `${(octets / 1024).toFixed(1).replace('.', ',')} Kio`;

const { rootMainFiles = [] } = lireJson('build-manifest.json');
const routes = Object.entries(lireJson('app-path-routes-manifest.json'))
  .filter(([cle]) => cle.startsWith(PREFIXE_PUBLIC) && cle.endsWith('/page'))
  .sort(([, a], [, b]) => a.localeCompare(b));
if (routes.length === 0) echec(`aucune route sous ${PREFIXE_PUBLIC} dans app-path-routes-manifest.json.`);

const polices = lireJson('server/next-font-manifest.json').app ?? {};

// L'entrée du layout racine se relit dans CHAQUE manifeste, pas dans le premier : elle est la même
// partout sur un build ordinaire, mais l'union ne coûte rien et ne suppose pas qu'elle le reste.
const layoutRacine = new Set();
const lignes = routes.map(([cle, route]) => {
  const { entryJSFiles } = manifesteClient(cle);
  for (const m of entryJSFiles[ENTREE_LAYOUT_RACINE] ?? []) layoutRacine.add(m);
  const morceaux = new Set([...rootMainFiles, ...Object.values(entryJSFiles).flat()]);
  const js = [...morceaux].reduce((somme, m) => somme + gzip(m), 0);
  const fontes = polices[`[project]/src/app${cle}`] ?? [];
  const octetsFontes = fontes.reduce((somme, f) => {
    const fichier = path.join(dossier, f);
    return somme + lire(fichier, () => statSync(fichier).size);
  }, 0);
  return { route, js, morceaux: morceaux.size, fontes: fontes.length, octetsFontes };
});

const largeur = Math.max(...lignes.map((l) => l.route.length));
console.log(`JS initial (gzip) et polices préchargées des ${lignes.length} routes publiques — ${dossier}\n`);
for (const l of lignes) {
  console.log(
    `  ${l.route.padEnd(largeur)}  ${kio(l.js).padStart(10)} en ${String(l.morceaux).padStart(2)} morceaux`
      + `  ·  ${l.fontes} police${l.fontes > 1 ? 's' : ''} (${kio(l.octetsFontes)})`,
  );
}

if (layoutRacine.size === 0) echec(`aucun manifeste ne déclare l'entrée « ${ENTREE_LAYOUT_RACINE} ».`);
const zod = [...layoutRacine].filter((m) => MARQUE_ZOD.test(readFileSync(path.join(dossier, m), 'utf8')));
if (zod.length > 0) {
  console.error(
    `\n✗ zod est dans le JS du layout racine, que chaque page charge (P33.02) : ${zod.join(', ')}.\n`
      + '  Un composant monté par `src/app/layout.tsx` importe un schéma : sortir les valeurs dont il a\n'
      + '  besoin dans un module sans dépendance (cf. `lib/enums/property.ts`, TCK-744).',
  );
  process.exit(1);
}
console.log('\n✓ zod absent du JS du layout racine.');
