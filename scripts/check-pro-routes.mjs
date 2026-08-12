#!/usr/bin/env node
/**
 * Garde des SURFACES « pro » : une route cadenassée dans la barre latérale doit être gardée
 * côté serveur.
 *
 * La règle « cette fonctionnalité est réservée aux agences `standard` » est écrite **deux fois**,
 * dans deux langages : `takussan-api/app/Support/AgencyKindGuard.php` (dont le docblock se déclare
 * lui-même « backend twin ») et `takussan-web/src/lib/access/`. Rien ne vérifiait qu'elles restent
 * d'accord.
 *
 * **Ce que la première exécution a trouvé** : `pro-features.ts` affirme, dans un commentaire, que
 * *« the pages themselves redirect to `/app` server-side, which is the ultimate gate »*. Mesuré :
 * c'était vrai pour 5 routes sur 9. Les quatre routes `/app/*` affichaient un cadenas dans la
 * barre latérale **sans aucune garde serveur** — le cadenas n'empêchait donc rien d'autre que le
 * clic, et une URL tapée à la main passait.
 *
 * *Une propriété proclamée dans un commentaire et prouvée par aucun test.*
 *
 * Usage :
 *   node scripts/check-pro-routes.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-pro-routes.mjs --report   # + l'inventaire route par route
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WEB = join(ROOT, 'takussan-web', 'src');

const SOURCE = join(WEB, 'lib', 'access', 'pro-features.ts');
const GARDE = 'ensureStandardAgencyOrRedirect';

/**
 * Écarts CONNUS et assumés, chacun avec son ticket.
 *
 * Une allowlist est une dette, pas une exemption : elle rend l'écart visible et datable au lieu
 * de le laisser se fondre dans le vert. Retirer une entrée d'ici doit être le geste qui FERME le
 * ticket, jamais celui qui fait taire la garde.
 */
const ECARTS_ASSUMES = new Map([
  ['/app/overview/kpis', 'TCK-284'],
  ['/app/overview/alerts', 'TCK-284'],
  ['/app/overview/agency', 'TCK-284'],
  ['/app/owners', 'TCK-284'],
]);

if (!existsSync(SOURCE)) {
  console.error(`✗ ${SOURCE.slice(ROOT.length + 1)} est introuvable.`);
  console.error('  La garde ne peut rien vérifier — elle le dit plutôt que de passer en silence.');
  process.exit(1);
}

const src = readFileSync(SOURCE, 'utf8');
const bloc = src.match(/PRO_ROUTES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
if (!bloc) {
  console.error(`✗ impossible de lire \`PRO_ROUTES\` dans ${SOURCE.slice(ROOT.length + 1)}.`);
  console.error('  Sa forme a changé : adapter cette garde plutôt que la contourner.');
  process.exit(1);
}

const routes = [...bloc[1].matchAll(/['"](\/[\w/[\]-]*)['"]/g)].map((m) => m[1]);
if (routes.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : c'est la forme
  // de vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
  console.error('✗ `PRO_ROUTES` est vide — la garde n\'aurait rien vérifié.');
  process.exit(1);
}

/** La page servant une route de l'App Router, dans le route group `(dashboard)`. */
function page(route) {
  const candidats = [
    join(WEB, 'app', '(dashboard)', ...route.split('/').filter(Boolean), 'page.tsx'),
    join(WEB, 'app', ...route.split('/').filter(Boolean), 'page.tsx'),
  ];
  return candidats.find(existsSync) ?? null;
}

const gardees = [];
const nues = [];
const introuvables = [];

for (const route of routes) {
  const p = page(route);
  if (!p) {
    introuvables.push(route);
    continue;
  }
  (readFileSync(p, 'utf8').includes(GARDE) ? gardees : nues).push([route, p.slice(ROOT.length + 1)]);
}

if (REPORT) {
  console.log(`PRO_ROUTES : ${routes.length} routes\n`);
  for (const [r, p] of gardees) console.log(`  ✓ gardée      ${r.padEnd(34)} ${p}`);
  for (const [r] of nues) {
    const t = ECARTS_ASSUMES.get(r);
    console.log(`  ${t ? '~' : '✗'} SANS GARDE  ${r.padEnd(34)} ${t ? `écart assumé (${t})` : ''}`);
  }
  for (const r of introuvables) console.log(`  ? page introuvable  ${r}`);
  console.log();
}

const erreurs = [];

for (const r of introuvables) {
  erreurs.push(`\`${r}\` est déclarée dans PRO_ROUTES mais aucune page ne la sert — soit la route a été supprimée sans nettoyer la liste, soit elle a été renommée.`);
}
for (const [r] of nues) {
  if (!ECARTS_ASSUMES.has(r)) {
    erreurs.push(`\`${r}\` est cadenassée dans la barre latérale mais sa page n'appelle pas \`${GARDE}\` : le cadenas n'empêche que le clic, une URL tapée à la main passe.`);
  }
}
// L'inverse compte aussi : un écart réparé doit sortir de l'allowlist, sinon la liste devient un
// cimetière et plus personne ne sait ce qu'elle couvre encore.
for (const [r, ticket] of ECARTS_ASSUMES) {
  if (gardees.some(([g]) => g === r)) {
    erreurs.push(`\`${r}\` est désormais gardée : retire-la de ECARTS_ASSUMES (${ticket}) — une allowlist périmée ne garde plus rien.`);
  } else if (!routes.includes(r)) {
    erreurs.push(`\`${r}\` est dans ECARTS_ASSUMES mais n'est plus dans PRO_ROUTES — l'entrée est morte.`);
  }
}

for (const [r] of nues) {
  if (ECARTS_ASSUMES.has(r)) {
    console.warn(`⚠ \`${r}\` : cadenas sans garde serveur — écart assumé, suivi par ${ECARTS_ASSUMES.get(r)}.`);
  }
}

if (erreurs.length === 0) {
  console.log(`✓ surfaces pro : ${gardees.length}/${routes.length} routes gardées côté serveur, ${ECARTS_ASSUMES.size} écart(s) assumé(s) et suivi(s).`);
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} incohérence(s) entre PRO_ROUTES et les gardes serveur :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
