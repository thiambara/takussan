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
// Le helper partagé : la protection de cinq routes y vit, pas dans leur page.
const HELPER = join(WEB, 'lib', 'access', 'server-guards.ts');

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
const FAIL_OPEN = [
  {
    nom: 'test conditionné à la résolution de l’agence',
    motif: /if\s*\(\s*(\w+)\s*&&\s*\1\.kind\s*!==\s*['"]standard['"]/,
    explique: (r, f) =>
      `\`${r}\` — ${f} porte bien un test sur \`agency.kind\`, mais sous la forme `
      + `\`if (agency && agency.kind !== 'standard')\` : elle ne redirige que si l'agence a pu être `
      + `résolue. \`fetchAgency\` avalant son erreur en \`null\`, une API en panne fait AFFICHER `
      + `l'écran pro à une agence \`individual\`. Écris \`if (!agency || agency.kind !== 'standard')\`.`,
  },
  {
    // TROISIÈME gradation du même défaut, trouvée en quatrième revue. Le helper partagé
    // écrivait bien `if (!agency || …)` — mais deux lignes plus haut, `if (!token) return;`.
    // La décision n'était pas prise à l'envers : elle était SAUTÉE. Le motif ci-dessus, qui
    // ne juge que la forme du test, la déclarait fail-closed — sur les cinq routes /admin/*.
    //
    // *Une garde qui sait juger un test ne sait pas encore juger les chemins qui l'évitent.*
    //
    // On lit donc la fenêtre entre `await getToken()` et LA DÉCISION SUR L'AGENCE : aucune
    // sortie anticipée n'a le droit d'y vivre. Le jeton se descend DANS l'expression
    // (`token ? await fetch… : null`), il ne commande pas un `return`.
    //
    // ⚠ La borne haute est la DÉCISION, pas « la première redirection ». Première version :
    // `suite.search(/\bredirect\s*\(/)`. Sur `/app/owners`, la première redirection qui suit le
    // jeton est la bascule d'authentification écrite à la ligne d'après —
    // `if (!token) redirect('/auth/login?…')` — donc la fenêtre examinée faisait **32
    // caractères** et ne pouvait par construction contenir aucune décision d'agence. Mesuré.
    // Toute page qui redirige pour l'authentification juste après avoir résolu son jeton était
    // exemptée de ce contrôle, en silence, et déclarée fail-closed.
    //
    // *Une borne choisie sur un motif syntaxique commode plutôt que sur le fait à mesurer
    // finit par exclure exactement ce qu'on voulait regarder.* Une redirection dans la fenêtre
    // n'est d'ailleurs pas un problème : c'est un refus, pas un contournement. Seul un
    // `return;` en est un.
    nom: 'sortie anticipée qui saute la décision',
    motif: (s) => {
      const t = s.search(/await\s+getToken\s*\(\)/);
      if (t === -1) return false;
      const suite = s.slice(t);
      // La décision : l'appel au helper, ou le test en ligne sur `kind`. On prend la première
      // qui vient ; si aucune n'est là, la page n'est pas gardée et c'est un autre motif qui
      // le dira — on n'examine alors rien.
      const bornes = [
        suite.search(/ensureStandardAgencyOrRedirect\s*\(/),
        suite.search(/kind\s*!==\s*['"]standard['"]/),
      ].filter((i) => i !== -1);
      if (bornes.length === 0) return false;
      return /\breturn\s*;/.test(suite.slice(0, Math.min(...bornes)));
    },
    explique: (r, f) =>
      `\`${r}\` — ${f} résout un jeton puis SORT (\`return;\`) avant d'avoir décidé. Sans jeton, `
      + `la garde n'est pas mise en défaut : elle est sautée, et l'écran réservé s'affiche. `
      + `Descends le jeton dans l'expression — \`const agency = token ? await fetchAgency(…) : null\` `
      + `— pour qu'un seul \`if\` tranche tous les cas.`,
  },
];

/** Un motif est soit une RegExp, soit un prédicat. */
const declenche = (m, s) => (typeof m === 'function' ? m(s) : m.test(s));

/**
 * Les COMMENTAIRES sont retirés avant toute analyse — et il fallait le faire dans les deux sens.
 *
 * Cette garde lisait le texte brut du fichier, sans distinguer le code de la prose. Deux
 * conséquences opposées, toutes deux mesurées :
 *
 *  · **faux positif** — un fichier ne contenant AUCUNE garde mais une phrase du genre
 *    « réservée aux agences standard : si `kind !== 'standard'` il faut `redirect('/app')` »
 *    satisfait le motif. Une route pro entièrement nue passait au vert. Vérifié.
 *  · **faux négatif** — le motif `FAIL_OPEN` frappait les commentaires EXPLICATIFS. Chaque
 *    commentaire de cette PR qui décrit l'anti-motif a dû l'écrire avec des points de suspension
 *    Unicode pour l'esquiver. Le prochain contributeur qui l'écrit en toutes lettres obtient un
 *    build rouge pointant du code juste.
 *
 * *Une garde qui lit la prose atteste de ce qu'on a écrit sur le code, pas du code.* C'est la
 * même erreur que `check-queues` lisant le commentaire au-dessus de son `queue:work`.
 *
 * Le retrait est volontairement grossier (pas un parseur) : il suffit que les motifs ne voient
 * plus que de l'exécutable. Les chaînes contenant `//` — des URL, essentiellement — n'ont pas
 * cours dans les expressions que l'on cherche.
 */
function sansCommentaires(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * NORMALISE les écritures équivalentes avant de chercher un motif.
 *
 * Quinze passes de revue ont montré que j'ajoutais une orthographe à la fois : `&&` puis
 * `return;` puis le helper puis la fenêtre. Chaque correctif fermait UNE façon d'écrire le même
 * défaut, et la suivante rouvrait la porte. `if (agency !== null && agency.kind !== 'standard')`
 * est exactement aussi fail-open que `if (agency && …)` — `fetchAgency` avale en `null`, donc
 * une API en panne affiche l'écran réservé — et n'était pas reconnu.
 *
 * On réécrit donc les formes équivalentes vers UNE forme canonique, et les motifs ne travaillent
 * plus que sur celle-là. Ajouter une écriture se fait ici, une fois, pour tous les motifs.
 *
 * *Un détecteur qui énumère les orthographes court après son sujet ; il faut ramener le sujet à
 * une forme, puis détecter la forme.*
 */
function canonique(src) {
  return src
    // `x !== null`, `x != null`, `x !== undefined` … sont des tests de véracité déguisés.
    .replace(/(\w+)\s*!==?\s*(?:null|undefined)\s*&&/g, '$1 &&')
    // `return` nu, avec ou sans point-virgule, avec ou sans accolade fermante sur la ligne.
    .replace(/\breturn\s*(?=[};]|$)/gm, 'return;');
}

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
  const brut = readFileSync(p, 'utf8');
  const src = canonique(sansCommentaires(brut));
  const trouvee = GARDES.find((g) => g.motif.test(src));
  // La règle n°3 plus bas relit la page pour décider entre « nue » et « je ne reconnais pas » :
  // elle reçoit le texte BRUT, parce qu'un commentaire est justement l'indice qu'il existe une
  // protection qu'on ne sait pas lire. On coupe la prose pour DÉCIDER, on la garde pour DOUTER.
  if (!trouvee) { nues.push([route, p.slice(ROOT.length + 1), brut]); continue; }

  // La page peut DÉLÉGUER sa protection. Ne regarder que le fichier de la page revient alors
  // à certifier une garde qu'on n'a pas lue — et c'est exactement ce qui est arrivé : les cinq
  // routes /admin/* étaient déclarées « fail-closed » alors que le helper qu'elles appellent
  // était lui-même écrit en `if (agency && …)`. On corrigeait les instances et pas la classe.
  //
  // On suit donc dans le helper, et on juge les DEUX sources.
  const aExaminer = [[p.slice(ROOT.length + 1), src]];
  if (/ensureStandardAgencyOrRedirect\s*\(/.test(src) && existsSync(HELPER)) {
    aExaminer.push([HELPER.slice(ROOT.length + 1), canonique(sansCommentaires(readFileSync(HELPER, 'utf8')))]);
  }

  let coupable = null;
  for (const [chemin, s] of aExaminer) {
    const forme = FAIL_OPEN.find((f) => declenche(f.motif, s));
    if (forme) { coupable = [chemin, forme]; break; }
  }
  if (coupable) { failOpen.push([route, coupable[0], coupable[1]]); continue; }
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

for (const [r, chemin, forme] of failOpen) {
  erreurs.push(forme.explique(r, chemin));
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
