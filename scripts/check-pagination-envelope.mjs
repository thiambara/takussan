#!/usr/bin/env node
/**
 * Garde d'UNICITÉ de l'enveloppe de pagination de l'API (TCK-304).
 *
 * **Ce qu'elle interdit.** Reconstruire l'enveloppe `meta` de pagination ailleurs que dans
 * `takussan-api/app/Http/Responses/PaginationMeta.php`, le point qui fait foi.
 *
 * **Pourquoi elle existe.** Mesuré le 2026-08-17 dans `takussan-api/app/` avant convergence :
 * **57 contrôleurs + 1 service** construisaient la forme à la main, et les jeux de clés
 * divergeaient — `total` 88 occurrences, `current_page` 67, `last_page` 51, `->perPage()` 40. Un
 * tiers des endpoints émettait `total` sans `per_page`. Le front ne peut pas s'appuyer sur ce qui
 * n'est pas systématique : il découvre les clés endpoint par endpoint, ou il les suppose et se
 * trompe. `takussan-web/src/types/api.ts` déclarait d'ailleurs `links` **obligatoire** quand
 * 51 endpoints sur 57 ne l'émettaient pas.
 *
 * La dette grossissait à la vitesse à laquelle on écrit des contrôleurs : l'ardoise D-31 en comptait
 * 44 au 2026-08-12, le ticket 58 au 2026-08-16. *Une convention qui n'est écrite que dans un
 * document ne freine rien — elle est lue une fois, par ceux qui la respectaient déjà.*
 *
 * ## Les deux règles, et pourquoi elles ne sont pas symétriques
 *
 * **Règle A — noms de clés réservés.** `'current_page' =>` et `'last_page' =>` n'ont, dans ce
 * dépôt, **aucun autre usage** que la pagination : mesuré, 0 occurrence hors enveloppe. Elles sont
 * donc réservées au point canonique.
 *
 * `'total' =>` et `'per_page' =>` ne le sont **pas**, et c'est délibéré :
 *   · `total` porte des agrégats métier légitimes — `SystemMetricsController`,
 *     `DashboardAgencyService`, `DashboardOwnerService`, `BankStatement`, `CapabilityController`… ;
 *   · `per_page` est aussi un nom de paramètre de requête **validé** — `SearchQueryRequest`,
 *     `AuditLogController`, `ConversationController`, `PublicPropertyController`…
 * Les bannir aurait produit une quinzaine de faux positifs le jour de l'écriture, c'est-à-dire une
 * garde qu'on désactive. *Une garde qu'on doit contourner ne garde plus rien ; elle apprend
 * seulement à la contourner.* Elles ne suffisent de toute façon pas à bâtir une enveloppe.
 *
 * **Règle B — méthodes de paginateur.** `->currentPage()`, `->lastPage()`, `->perPage()`,
 * `->previousPageUrl()`, `->nextPageUrl()` : appelées hors du point canonique, elles ne servent
 * qu'à recopier l'enveloppe. `->total()` est **exclu** de la règle, et l'exclusion est prouvée :
 * `Admin/PropertyModerationController` en tire `pending_count`, un compteur métier que le front lit
 * réellement (`ModerationWorkspace.tsx`, `PropertyModerationWorkspace.tsx`, `AdminSidebar.tsx`) et
 * qu'un test backend assère. Ce n'est pas une enveloppe, et la Règle A l'attrape de toute façon dès
 * qu'il s'agit d'une.
 *
 * ## Le mode de défaillance qu'elle refuse : passer au vert en ne voyant rien
 *
 * Une garde qui ne trouve plus sa cible et rend un tableau vide **passe au vert en ne gardant plus
 * rien**, et sa sortie ressemble à un succès. C'est le défaut le plus cher du dépôt (D-15, D-18,
 * D-44). Trois vérifications actives ici, chacune sortant en 1 :
 *   1. le fichier canonique existe ;
 *   2. il contient **effectivement** les jetons qu'il est seul à pouvoir contenir — s'il a été
 *      renommé, vidé ou réécrit, la garde ne peut plus rien affirmer et le dit ;
 *   3. le balayage a vu un nombre plausible de fichiers PHP (un renommage de `app/`, un `cd` raté,
 *      un glob cassé rendent 0 fichier et donc 0 violation).
 *
 * Usage :
 *   node scripts/check-pagination-envelope.mjs            # garde, sort en 1 à la moindre violation
 *   node scripts/check-pagination-envelope.mjs --report   # + l'inventaire de ce qui a été balayé
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const APP_DIR = join(ROOT, 'takussan-api', 'app');
const CANONIQUE = join(APP_DIR, 'Http', 'Responses', 'PaginationMeta.php');

/**
 * Planchers de plausibilité du balayage, PAR SOUS-ARBRE — et le pluriel est le fruit d'une
 * épreuve par mutation, pas d'un scrupule.
 *
 * La première version ne posait qu'un plancher global de 300 sur `app/` (~797 fichiers PHP). On a
 * alors retiré `app/Http/Controllers/` **en entier** — les 165 fichiers où vivent toutes les
 * enveloppes — et la garde a rendu « ✓ 632 fichiers balayés, 0 reconstruction », **sortie 0**.
 * Elle venait de certifier verte une arborescence amputée de tout ce qu'elle existe pour
 * surveiller. *Un plancher global ne voit pas disparaître un sous-arbre : il voit un total qui
 * baisse, et un total qui baisse ressemble à un dépôt qui maigrit.*
 *
 * Chaque entrée est donc un sous-arbre dont l'absence rendrait le vert mensonger, avec un seuil
 * posé bien sous le compte réel : il ne mesure pas la taille du dépôt — sinon il faudrait le
 * maintenir — il attrape « ce répertoire a disparu ou ne se lit plus ».
 */
const PLANCHERS = [
  // 797 fichiers au 2026-08-17.
  { chemin: ['.'], min: 300, quoi: 'app/' },
  // 165 fichiers au 2026-08-17. C'est ICI que vivent les enveloppes : ce plancher est le seul
  // qui garde contre le vert de la mutation 4.
  { chemin: ['Http', 'Controllers'], min: 80, quoi: 'app/Http/Controllers/' },
];

/** Règle A — noms de clés réservés au point canonique. */
const CLES_RESERVEES = ['current_page', 'last_page'];
const RE_CLE = new RegExp(`'(${CLES_RESERVEES.join('|')})'\\s*=>`);

/** Règle B — méthodes de paginateur réservées au point canonique. */
const METHODES_RESERVEES = [
  'currentPage',
  'lastPage',
  'perPage',
  'previousPageUrl',
  'nextPageUrl',
  'linkCollection',
];
const RE_METHODE = new RegExp(`->(${METHODES_RESERVEES.join('|')})\\s*\\(`);

const rel = (p) => relative(ROOT, p).split(sep).join('/');

if (!existsSync(APP_DIR)) {
  console.error(`✗ ${rel(APP_DIR)} est introuvable — la garde n'aurait rien balayé.`);
  process.exit(1);
}

if (!existsSync(CANONIQUE)) {
  console.error(`✗ le point canonique ${rel(CANONIQUE)} est introuvable.`);
  console.error("  La garde ne sait plus ce qu'elle autorise : elle refuse de passer au vert.");
  console.error('  Si le fichier a été déplacé, corrige CANONIQUE dans ce script — jamais en supprimant la vérification.');
  process.exit(1);
}

// (2) le fichier canonique porte-t-il encore ce qu'il est seul à pouvoir porter ?
const srcCanonique = readFileSync(CANONIQUE, 'utf8');
const jetonsManquants = [
  ...CLES_RESERVEES.filter((k) => !new RegExp(`'${k}'\\s*=>`).test(srcCanonique)),
  ...['currentPage', 'perPage'].filter((m) => !new RegExp(`->${m}\\s*\\(`).test(srcCanonique)),
];
if (jetonsManquants.length > 0) {
  console.error(`✗ ${rel(CANONIQUE)} ne contient plus : ${jetonsManquants.join(', ')}.`);
  console.error("  Le point canonique ne construit donc plus l'enveloppe — une garde qui ne trouve");
  console.error('  plus sa cible passerait au vert en ne gardant plus rien. Elle sort en erreur à la place.');
  process.exit(1);
}

/** @returns {string[]} chemins absolus de tous les .php sous `dir` */
function phpSous(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...phpSous(p));
    else if (e.isFile() && e.name.endsWith('.php')) out.push(p);
  }
  return out;
}

const fichiers = phpSous(APP_DIR).sort();

// (3) le balayage a-t-il vu chacun des sous-arbres qui comptent ?
for (const { chemin, min, quoi } of PLANCHERS) {
  const dir = join(APP_DIR, ...chemin);
  const n = existsSync(dir) ? phpSous(dir).length : 0;
  if (n >= min) continue;
  console.error(`✗ seulement ${n} fichier(s) PHP balayé(s) sous ${quoi} (plancher : ${min}).`);
  console.error("  Un sous-arbre absent ou illisible ne produit aucune violation : ce vert-là ne vaudrait rien.");
  console.error('  Si le répertoire a légitimement été déplacé, corrige PLANCHERS — jamais en abaissant le seuil à 0.');
  process.exit(1);
}

const violations = [];

for (const f of fichiers) {
  if (f === CANONIQUE) continue;
  const lignes = readFileSync(f, 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    const nu = ligne.trim();
    // On ne juge pas les commentaires : ce script est lui-même documenté par l'exemple.
    if (nu.startsWith('*') || nu.startsWith('//') || nu.startsWith('/*')) return;

    const cle = RE_CLE.exec(ligne);
    if (cle) violations.push({ f, n: i + 1, regle: 'A', quoi: `clé réservée '${cle[1]}'`, ligne: nu });

    const meth = RE_METHODE.exec(ligne);
    if (meth) violations.push({ f, n: i + 1, regle: 'B', quoi: `méthode réservée ->${meth[1]}()`, ligne: nu });
  });
}

if (REPORT) {
  console.log(`Balayage : ${fichiers.length} fichiers PHP sous ${rel(APP_DIR)}`);
  console.log(`Point canonique : ${rel(CANONIQUE)}`);
  console.log(`Règle A — clés réservées   : ${CLES_RESERVEES.map((k) => `'${k}'`).join(', ')}`);
  console.log(`Règle B — méthodes réservées : ${METHODES_RESERVEES.map((m) => `->${m}()`).join(', ')}`);
  console.log(`Violations : ${violations.length}\n`);
}

if (violations.length === 0) {
  console.log(`✓ enveloppe de pagination : ${fichiers.length} fichiers balayés, 0 reconstruction hors de ${rel(CANONIQUE)}.`);
  console.log("  ⚠ PORTÉE : cette garde interdit de RECONSTRUIRE l'enveloppe, elle ne vérifie pas que");
  console.log("    chaque liste paginée l'émet. Un endpoint qui ne pagine pas du tout la satisfait.");
  process.exit(0);
}

console.error(`\n✗ ${violations.length} reconstruction(s) de l'enveloppe de pagination hors du point canonique :\n`);
for (const v of violations) {
  console.error(`  · ${rel(v.f)}:${v.n}  [règle ${v.regle}] ${v.quoi}`);
  console.error(`      ${v.ligne}`);
}
console.error(`
  L'enveloppe de pagination se construit en UN seul endroit : ${rel(CANONIQUE)}.

    // dans un contrôleur (il étend App\\Http\\Controllers\\Base\\Controller)
    return $this->paginated($paginator, XResource::collection($paginator)->toArray($request));

    // avec un compteur métier propre à l'endpoint
    return $this->paginated($paginator, $data, ['pending_count' => $paginator->total()]);

    // hors contrôleur, ou sans paginateur Eloquent (résultat Meilisearch, agrégat…)
    use App\\Http\\Responses\\PaginationMeta;
    'meta' => PaginationMeta::of(total: $n, perPage: $perPage, currentPage: $page),

  Les quatre clés — total, per_page, current_page, last_page — et elles seules. Les recopier à la
  main, c'est ce qui a produit 57 contrôleurs aux contrats divergents (TCK-304, ardoise D-31).
`);
process.exit(1);
