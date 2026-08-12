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

/**
 * Les DEUX formes de garde serveur, et la seconde a coûté cher.
 *
 * Une première version de ce script ne cherchait que la chaîne
 * `ensureStandardAgencyOrRedirect`. Il a donc déclaré « aucune garde » sur quatre pages qui
 * redirigent bel et bien — elles résolvent déjà l'agence pour leur propre affichage et écrivent
 * le test **en ligne**. Sur la foi de ce faux négatif, les quatre routes ont été retirées de
 * `PRO_ROUTES` : un cadenas supprimé devant des pages qui gardent.
 *
 * *Une garde qui cherche un JETON ne mesure pas la PROPRIÉTÉ.* Elle ne rend pas « je ne sais
 * pas » — elle rend « non », avec l'autorité d'une mesure. C'est la forme de faux négatif la plus
 * coûteuse, parce qu'on agit dessus.
 *
 * Ce qu'on cherche vraiment : « cette page renvoie-t-elle ailleurs une agence non `standard` ? »
 * On l'approche par deux motifs. C'est toujours syntaxique, donc toujours faillible — d'où la
 * troisième règle plus bas, qui refuse une page dont on ne comprend pas la protection plutôt que
 * de la déclarer nue.
 */
const GARDES = [
  // 1. le helper nommé — les routes /admin/*
  { nom: 'ensureStandardAgencyOrRedirect', motif: /ensureStandardAgencyOrRedirect\s*\(/ },
  // 2. la garde écrite en ligne — les routes /app/*
  { nom: 'test en ligne sur agency.kind', motif: /kind\s*!==\s*['"]standard['"][\s\S]{0,80}?redirect\s*\(/ },
];

/**
 * La forme FAIL-OPEN, qu'il faut refuser même quand une garde est présente.
 *
 * `if (agency && agency.kind !== 'standard') redirect(…)` ne redirige QUE si l'agence a pu être
 * résolue. Or `fetchAgency(...).catch(() => null)` avale son erreur : sur une API en panne ou
 * lente, `agency` vaut `null`, le `&&` court-circuite, et **l'écran pro s'affiche pour une agence
 * `individual`**.
 *
 * La deuxième version de cette garde reconnaissait ce motif comme « gardée ». C'était le même
 * défaut que la première, d'un cran plus fin : elle avait appris à voir la garde, pas à juger si
 * elle tient. *Une garde présente n'est pas une garde correcte.*
 *
 * La règle : un écran réservé se refuse quand on ne SAIT PAS, pas seulement quand on sait que non.
 */
const FAIL_OPEN = /if\s*\(\s*(\w+)\s*&&\s*\1\.kind\s*!==\s*['"]standard['"]/;

/**
 * Écarts CONNUS et assumés, chacun avec son ticket.
 *
 * Une allowlist est une dette, pas une exemption : elle rend l'écart visible et datable au lieu
 * de le laisser se fondre dans le vert. Retirer une entrée d'ici doit être le geste qui FERME le
 * ticket, jamais celui qui fait taire la garde.
 */
const ECARTS_ASSUMES = new Map([
  // Vide, et c'est l'état sain : la garde est stricte, sans exception.
  //
  // Elle avait un temps porté quatre entrées — `/app/overview/{kpis,alerts,agency}` et
  // `/app/owners` — sur la foi d'un faux négatif de sa propre première version, qui ne
  // cherchait qu'une chaîne. Ces quatre pages GARDENT, en ligne. Les entrées ont donc été
  // retirées non pas parce que l'écart était assumé, mais parce qu'il n'a jamais existé.
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
const failOpen = [];
const introuvables = [];

for (const route of routes) {
  const p = page(route);
  if (!p) {
    introuvables.push(route);
    continue;
  }
  const src = readFileSync(p, 'utf8');
  const trouvee = GARDES.find((g) => g.motif.test(src));
  if (!trouvee) { nues.push([route, p.slice(ROOT.length + 1), src]); continue; }
  if (FAIL_OPEN.test(src)) { failOpen.push([route, p.slice(ROOT.length + 1)]); continue; }
  gardees.push([route, p.slice(ROOT.length + 1), trouvee.nom]);
}

if (REPORT) {
  console.log(`PRO_ROUTES : ${routes.length} routes\n`);
  for (const [r, p, via] of gardees) console.log(`  ✓ gardée      ${r.padEnd(34)} ${via}`);
  for (const [r, p] of failOpen) console.log(`  ✗ FAIL-OPEN   ${r.padEnd(34)} ${p}`);
  for (const [r] of nues) {
    const t = ECARTS_ASSUMES.get(r);
    console.log(`  ${t ? '~' : '✗'} SANS GARDE  ${r.padEnd(34)} ${t ? `écart assumé (${t})` : ''}`);
  }
  for (const r of introuvables) console.log(`  ? page introuvable  ${r}`);
  console.log();
}

const erreurs = [];

for (const [r, chemin] of failOpen) {
  erreurs.push(
    `\`${r}\` — ${chemin} porte bien un test sur \`agency.kind\`, mais sous la forme `
    + `\`if (agency && agency.kind !== 'standard')\` : elle ne redirige que si l'agence a pu être `
    + `résolue. \`fetchAgency\` avalant son erreur en \`null\`, une API en panne fait AFFICHER `
    + `l'écran pro à une agence \`individual\`. Écris \`if (!agency || agency.kind !== 'standard')\`.`,
  );
}
for (const r of introuvables) {
  erreurs.push(`\`${r}\` est déclarée dans PRO_ROUTES mais aucune page ne la sert — soit la route a été supprimée sans nettoyer la liste, soit elle a été renommée.`);
}
for (const [r, chemin, src] of nues) {
  if (ECARTS_ASSUMES.has(r)) continue;
  // Règle n°3 — le doute ne vaut pas « non ». Si la page mentionne quand même `agency.kind` ou
  // un `redirect(`, c'est probablement une TROISIÈME forme de garde que les deux motifs
  // ci-dessus ne savent pas lire. On le dit comme tel : « je ne reconnais pas », jamais
  // « il n'y en a pas ». C'est ce que la première version de ce script n'a pas su faire, et
  // c'est ce qui a conduit à retirer un cadenas devant une page protégée.
  const indice = /agency[\s\S]{0,40}kind|redirect\s*\(/.test(src);
  erreurs.push(
    indice
      ? `\`${r}\` — ${chemin} contient bien une notion d'agence ou une redirection, mais sous une forme que cette garde ne sait pas lire. RELIS-LA À LA MAIN : ne conclus pas qu'elle est nue, et si c'est une garde valide, ajoute son motif à GARDES.`
      : `\`${r}\` est cadenassée dans la barre latérale mais ${chemin} ne porte aucune garde reconnaissable : le cadenas n'empêche que le clic, une URL tapée à la main passe.`,
  );
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
  console.log(`✓ surfaces pro : ${gardees.length}/${routes.length} routes gardées côté serveur ET fail-closed, ${ECARTS_ASSUMES.size} écart(s) assumé(s).`);
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} incohérence(s) entre PRO_ROUTES et les gardes serveur :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
