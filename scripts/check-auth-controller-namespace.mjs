#!/usr/bin/env node
/**
 * Garde du NAMESPACE DES CONTRÔLEURS D'AUTHENTIFICATION (TCK-309, ex-dette D-40).
 *
 * L'authentification vivait dans DEUX espaces de noms — `App\Http\Controllers\Auth\`
 * (8 fichiers) et `App\Http\Controllers\Api\Auth\` (5) — et **aucune règle n'a jamais
 * été écrite pour ce partage**. Les treize contrôleurs servaient pourtant les mêmes
 * routes `api/auth/*`, câblées depuis le même et unique `routes/api/auth.php`. Le
 * partage ne suivait donc rien : ni la surface exposée, ni le garde
 * d'authentification, ni la date. Le reste du dépôt a tranché tout seul — 139
 * contrôleurs sous `Api/`, 26 hors — et les 8 ont rejoint `Api\Auth\`.
 *
 * ⚠ **Un namespace qui bouge et une route qui bouge se ressemblent dans un diff, et
 * seule la seconde casse les clients.** La preuve exigée par le ticket n'est donc pas
 * une lecture mais une comparaison : `php artisan route:list` avant / après, sur la
 * méthode, l'URI, le nom et les middlewares. 516 routes, diff VIDE ; 24 actions
 * réécrites, toutes du seul préfixe de namespace.
 *
 * ── CE QUE LA GARDE VÉRIFIE ────────────────────────────────────────────────────
 *
 *   A. Aucun contrôleur ne déclare un namespace `…\Auth` ailleurs que
 *      `App\Http\Controllers\Api\Auth`. C'est le retour EXACT du défaut soldé.
 *
 *   B. Tout contrôleur câblé par `routes/api/auth.php` — le fichier qui DÉFINIT la
 *      surface d'authentification — vit sous `App\Http\Controllers\Api\Auth\`. Ce
 *      contrôle-ci attrape ce que A ne peut pas voir : un contrôleur d'auth posé à la
 *      racine des contrôleurs, sans le mot `Auth` dans son namespace. La liste des
 *      contrôleurs est DÉRIVÉE des `use` du fichier, jamais recopiée.
 *
 *      Une seule exception, nommée et motivée dans `HORS_AUTH` : la suppression de
 *      compte est servie par `Api\UserAdminController`, qui n'est pas un contrôleur
 *      d'authentification et n'a aucune raison de déménager pour une route.
 *
 *   C. NON-VACUITÉ, sur les deux bouts. Si `routes/api/auth.php` disparaît, si aucun
 *      `use` n'y est reconnu, ou si `Api/Auth/` compte moins de MINIMUM_CONTROLEURS
 *      fichiers, la garde ROUGIT — elle ne conclut pas « aucun défaut » sur un
 *      tableau vide. C'est le mode de défaillance qui a déjà produit ici un faux
 *      négatif sur quatre pages (cf. `check-pro-routes.mjs`).
 *
 * ── CE QU'ELLE NE VÉRIFIE PAS ──────────────────────────────────────────────────
 *
 * Que les URLs n'ont pas bougé. Aucun script Node ne peut le savoir : cela demande de
 * démarrer l'application. C'est `route:list` qui le prouve, à la main, au moment du
 * déplacement — et c'est pour cela que la comparaison est archivée dans le rapport du
 * ticket plutôt que déduite ici.
 *
 * Usage :
 *   node scripts/check-auth-controller-namespace.mjs
 *   node scripts/check-auth-controller-namespace.mjs --report
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const API = join(ROOT, 'takussan-api');
const CONTROLEURS = join(API, 'app', 'Http', 'Controllers');
const ROUTES_AUTH = join(API, 'routes', 'api', 'auth.php');

const NAMESPACE_RETENU = 'App\\Http\\Controllers\\Api\\Auth';

/**
 * Contrôleurs câblés par `routes/api/auth.php` qui ne SONT PAS des contrôleurs
 * d'authentification. Chacun se justifie, sinon il n'est pas ici.
 */
const HORS_AUTH = new Map([
  [
    'App\\Http\\Controllers\\Api\\UserAdminController',
    'sert DELETE api/auth/account (suppression de son propre compte) — c\'est du cycle de vie ' +
      'utilisateur, pas de l\'authentification. Une route ne déplace pas un contrôleur.',
  ],
]);

/** Mesuré au 2026-08-17 : 13 contrôleurs sous Api/Auth/. Plancher bas exprès. */
const MINIMUM_CONTROLEURS = 8;
/** Mesuré au 2026-08-17 : 13 `use` de contrôleurs dans routes/api/auth.php. */
const MINIMUM_IMPORTS = 8;

const erreurs = [];

for (const [chemin, quoi] of [
  [CONTROLEURS, 'app/Http/Controllers/'],
  [ROUTES_AUTH, 'routes/api/auth.php'],
]) {
  if (!existsSync(chemin)) {
    console.error(
      `✗ namespace des contrôleurs d'auth : « takussan-api/${quoi} » est introuvable.\n` +
        `  La garde n'a PAS conclu « aucun défaut » : elle ne sait plus où chercher.`,
    );
    process.exit(1);
  }
}

function fichiersPhp(repertoire) {
  const out = [];
  for (const entree of readdirSync(repertoire)) {
    const chemin = join(repertoire, entree);
    if (statSync(chemin).isDirectory()) out.push(...fichiersPhp(chemin));
    else if (entree.endsWith('.php')) out.push(chemin);
  }
  return out;
}

// ── A. Aucun namespace `…\Auth` hors du retenu. ───────────────────────────────
let sousNamespaceRetenu = 0;

for (const chemin of fichiersPhp(CONTROLEURS)) {
  const source = readFileSync(chemin, 'utf8');
  const ns = (source.match(/^namespace\s+([^;]+);/m) ?? [])[1]?.trim();
  if (!ns) continue;

  if (ns === NAMESPACE_RETENU) {
    sousNamespaceRetenu += 1;
    continue;
  }

  if (ns.split('\\').includes('Auth')) {
    erreurs.push(
      `${relative(ROOT, chemin)} — namespace « ${ns} », hors du namespace retenu.\n` +
        `      Attendu : ${NAMESPACE_RETENU}\n` +
        `      C'est le retour exact de D-40 : deux espaces de noms pour la même surface ` +
        `« api/auth/* », câblée depuis un unique routes/api/auth.php.`,
    );
  }
}

// ── C(1). Non-vacuité côté fichiers. ──────────────────────────────────────────
if (sousNamespaceRetenu < MINIMUM_CONTROLEURS) {
  console.error(
    `✗ namespace des contrôleurs d'auth : ${sousNamespaceRetenu} fichier(s) sous « ${NAMESPACE_RETENU} », ` +
      `plancher ${MINIMUM_CONTROLEURS}.\n` +
      `  La garde ne conclut PAS « aucun défaut » : elle ne reconnaît plus sa cible.`,
  );
  process.exit(1);
}

// ── B. Tout contrôleur câblé par routes/api/auth.php vit sous le namespace retenu. ──
const sourceRoutes = readFileSync(ROUTES_AUTH, 'utf8');
const importes = [
  ...new Set(
    [...sourceRoutes.matchAll(/^use\s+(App\\Http\\Controllers\\[A-Za-z0-9_\\]+)\s*;/gm)].map((m) => m[1]),
  ),
];

// ── C(2). Non-vacuité côté routes — AVANT de juger. ───────────────────────────
if (importes.length < MINIMUM_IMPORTS) {
  console.error(
    `✗ namespace des contrôleurs d'auth : ${importes.length} contrôleur(s) reconnu(s) dans ` +
      `takussan-api/routes/api/auth.php, plancher ${MINIMUM_IMPORTS}.\n` +
      `  La garde ne conclut PAS « aucun défaut » : elle ne sait plus lire ce fichier.\n` +
      `  Causes probables : imports groupés « use A\\{B, C}; », FQCN en ligne, fichier scindé.`,
  );
  process.exit(1);
}

const horsAuthVus = [];
for (const fqcn of importes) {
  if (fqcn.startsWith(`${NAMESPACE_RETENU}\\`)) continue;

  if (HORS_AUTH.has(fqcn)) {
    horsAuthVus.push(fqcn);
    continue;
  }

  erreurs.push(
    `takussan-api/routes/api/auth.php — « ${fqcn} » câble la surface d'authentification ` +
      `depuis un autre namespace.\n` +
      `      Attendu : ${NAMESPACE_RETENU}\\…\n` +
      `      S'il ne s'agit PAS d'un contrôleur d'authentification, il se déclare dans ` +
      `HORS_AUTH ici, avec son motif — pas en silence.`,
  );
}

// Une exception qui ne sert plus est une exception qui ment sur ce qu'elle protège.
for (const [fqcn, motif] of HORS_AUTH) {
  if (horsAuthVus.includes(fqcn)) continue;
  erreurs.push(
    `« ${fqcn} » est déclaré dans HORS_AUTH mais n'est plus câblé par routes/api/auth.php.\n` +
      `      Il y tenait pour : ${motif}\n` +
      `      Retirer l'entrée : une exception périmée fait passer pour délibéré ce qui ne l'est plus.`,
  );
}

if (REPORT) {
  console.log(`namespace des contrôleurs d'auth — retenu : ${NAMESPACE_RETENU}`);
  console.log(`  ${sousNamespaceRetenu} contrôleurs y vivent`);
  console.log(`  ${importes.length} contrôleurs câblés par routes/api/auth.php, dont ${horsAuthVus.length} hors auth :`);
  for (const fqcn of horsAuthVus) console.log(`      ${fqcn.split('\\').pop()} — ${HORS_AUTH.get(fqcn)}`);
  console.log(`  portée : la garde vérifie OÙ vit le code, jamais que les URLs n'ont pas bougé —`);
  console.log(`           ça, seul « php artisan route:list » avant/après peut le prouver.`);
}

if (erreurs.length > 0) {
  console.error(`✗ namespace des contrôleurs d'auth — ${erreurs.length} défaut(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(
  `✓ namespace des contrôleurs d'auth : ${sousNamespaceRetenu} contrôleurs sous un seul namespace, ` +
    `${importes.length} câblages vérifiés`,
);
