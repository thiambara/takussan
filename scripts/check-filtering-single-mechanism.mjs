#!/usr/bin/env node
/**
 * Garde d'UNICITÉ DU MÉCANISME DE FILTRAGE : `HasQueryBuilder::buildQuery()` est le seul point
 * d'entrée déclaratif de filtrage du backend. Aucun scope Eloquent de `takussan-api/app/` ne
 * réintroduit un DSL de filtrage générique piloté par un tableau.
 *
 * **Pourquoi elle existe.** `BaseModelTrait::scopeFilter(Builder, array $filters)` a coexisté avec
 * `spatie/laravel-query-builder` sur les **mêmes** modèles — `AbstractModel` compose les deux
 * traits, donc les 68 modèles qui en héritent portaient les deux mécanismes. Mesuré le
 * 2026-08-17, avant sa suppression par TCK-307 : **zéro appelant** dans tout le dépôt (`app/`,
 * `routes/`, `database/`, `bin/`, `config/`), contre **46 `buildQuery()`** dans les seuls
 * contrôleurs. Son unique usage était le test qui le testait.
 *
 * Le coût n'était pas la duplication de code — dix-neuf lignes — c'était l'AMBIGUÏTÉ. Deux
 * mécanismes également disponibles sur le même modèle ne se lisent pas « un vivant et un mort »,
 * ils se lisent « deux conventions, choisis ». Un développeur qui prenait le mauvais écrivait du
 * code qui marchait, et qui sortait du contrat de lecture du dépôt : pas de sparse fieldsets, pas
 * de `include=`, pas de routage Scout, pas de tri déclaré. *Un mécanisme mort mais branché ne se
 * signale jamais comme mort : il se présente comme une alternative.*
 *
 * **Ce que la garde vérifie — trois contrôles, et ils ne se valent pas :**
 *
 *   · **A — NON-VACUITÉ (le contrôle qui garde la garde).** Le mode de défaillance central d'une
 *     garde de ce type est de ne plus trouver sa cible et de passer au vert en ne gardant plus
 *     rien. Elle exige donc que l'arbre existe, qu'il rende un plancher de fichiers PHP, que
 *     `HasQueryBuilder` déclare toujours `buildQuery()`, que `AbstractModel` le compose, et — le
 *     point décisif — que le motif de détection des scopes trouve encore des scopes réels. Si le
 *     dépôt bouge sous elle (dossier renommé, `.php` déplacés, motif cassé), elle ROUGIT.
 *
 *   · **B — NOM.** Aucun `function scope<Nom>(` dont le nom appartient à la famille du DSL
 *     supprimé (`Filter`, `Filters`, `ApplyFilters`, `WithFilters`, `FilterBy`, `Filtered`,
 *     `RequestFilters`). C'est un contrôle de JETON : il attrape le copier-coller, il ne prouve
 *     rien (dette D-23). D'où le contrôle C.
 *
 *   · **C — FORME.** Aucun scope, quel que soit son nom, dont la signature accepte un paramètre
 *     `array` ET dont le corps compose `foreach` avec `->where(`. C'est la forme exacte du DSL
 *     supprimé, et elle survit à un renommage — c'est le contrôle qui a du sens. Mesuré le
 *     2026-08-17 : **0 des 33 fichiers portant un scope** ne déclare un scope à paramètre
 *     `array`, donc ce contrôle n'a aucun faux positif à absoudre aujourd'hui.
 *
 *   · **D — RECHERCHE (TCK-326).** Aucun scope Eloquent de `app/` ne rebranche la RECHERCHE
 *     plein-texte hors de `HasQueryBuilder`. Deux formes, pour la même raison que B et C :
 *     un contrôle de NOM (`scopeWithSearch`, `scopeSearch`, `scopeScout`, `scopeFullText`…) qui
 *     attrape le copier-coller, et un contrôle de FORME qui survit au renommage — un scope dont
 *     le corps appelle Scout (`::search(`) *et* recompose le résultat dans la requête Eloquent
 *     (`whereIn` / `whereRaw` / `->keys()`).
 *
 *     **Pourquoi D ne se déduit pas de C.** `BaseModelTrait::scopeWithSearch(Builder, ?string,
 *     int)` a survécu à TCK-307 précisément parce que C ne pouvait pas le voir : il ne prend pas
 *     de tableau et ne déroule pas de `where()` en boucle. Il était pourtant le même motif un
 *     cran plus loin — et **pire** : `whereIn` sans restitution d'ordre, là où le chemin
 *     `filter[search]` restitue la pertinence Meilisearch depuis TCK-281
 *     (`$searchRelevanceIds` → `SearchRelevanceSort`). Son propre docblock l'avouait ; l'appelant
 *     ne lit pas le docblock, il lit la liste des méthodes disponibles. *Un doublon inférieur
 *     coûte plus cher qu'un doublon inerte : celui qui le choisit obtient un résultat plausible
 *     et faux.* Mesuré le 2026-08-17 puis le 2026-08-20 : **zéro appelant** hors du test qui le
 *     testait. Supprimé par TCK-326.
 *
 * **Ce que la garde NE couvre PAS, et le dit dans sa sortie.** Elle ne regarde que les *scopes
 * Eloquent* de `app/`. Un contrôleur qui lit `$request->input('filter')` et empile des `where()`
 * à la main lui échappe — il y en a plusieurs dans ce dépôt (`PaymentController`,
 * `ModerationQueueController`, les consoles super-admin), certains par choix assumé (TCK-281,
 * « Hors périmètre »). Élargir la garde à ce cas la rendrait rouge sur du code délibéré, et *une
 * garde qu'on ne peut pas rendre verte n'est pas une garde, c'est un bandeau d'avertissement de
 * plus.* Le sujet est la réintroduction d'un DSL RÉUTILISABLE monté sur tous les modèles, pas
 * l'existence de filtrage ad hoc.
 *
 * Usage :
 *   node scripts/check-filtering-single-mechanism.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-filtering-single-mechanism.mjs --report   # + l'inventaire des scopes vus
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const APP = join(ROOT, 'takussan-api', 'app');
const HAS_QUERY_BUILDER = join(APP, 'Models', 'Concerns', 'HasQueryBuilder.php');
const ABSTRACT_MODEL = join(APP, 'Models', 'Bases', 'AbstractModel.php');

/**
 * Plancher de non-vacuité. `app/` portait ~770 fichiers PHP au 2026-08-17 ; 100 est délibérément
 * bas — il ne mesure pas la taille du dépôt, il distingue « l'arbre a été lu » de « l'arbre est
 * vide parce que le chemin est faux ».
 */
const PLANCHER_FICHIERS = 100;

/**
 * Même logique, sur le motif lui-même : 33 fichiers de `app/` déclaraient au moins un scope au
 * 2026-08-17. Un motif cassé rendrait 0, et les contrôles B et C passeraient au vert sans avoir
 * rien lu. C'est le mode de défaillance que ce plancher ferme.
 */
const PLANCHER_SCOPES = 10;

/**
 * Noms de scope interdits — la famille du DSL supprimé. `scopes()` (sans majuscule derrière) n'en
 * est pas : c'est un helper de commande, pas un scope Eloquent.
 */
const NOMS_INTERDITS = /^(Filter|Filters|ApplyFilters|WithFilters|FilterBy|Filtered|RequestFilters)$/;

/**
 * Noms de scope de RECHERCHE interdits (contrôle D, TCK-326) — la famille de `scopeWithSearch`.
 * `scopeSearchable` n'en est pas : ce serait un scope de sélection, pas un chemin de recherche ;
 * le motif exige donc que `Search` soit terminal ou suivi de `By`/`Term`/`Text`.
 */
const NOMS_RECHERCHE_INTERDITS = /^(With)?(Search(By|Term|Text)?|Scout|FullText(Search)?|TextSearch)$/;

/**
 * Contrôle D — forme : le corps entre par Scout, puis recompose le résultat dans la requête
 * Eloquent. C'est ce second membre qui distingue un scope de recherche d'un simple passe-plat.
 *
 * ⚠ **`whereIntegerInRaw` et `pluck` ont été ajoutés à la vérification par mutation du
 * 2026-08-20.** La première version du motif ne listait que `whereIn|whereRaw|whereKey|keys` :
 * un scope nommé innocemment qui récoltait les ids par `->get()->pluck('id')` puis les
 * recomposait par `->whereIntegerInRaw(…)` — deux méthodes Laravel parfaitement ordinaires —
 * traversait le contrôle D au VERT, alors que c'est exactement le mécanisme supprimé. Le membre
 * `ENTREE_SCOUT` reste le discriminant : un scope qui n'appelle pas Scout n'est jamais jugé
 * ici, donc élargir la recomposition n'ouvre pas de faux positif.
 */
const ENTREE_SCOUT = /(::|->)search\s*\(/;
const RECOMPOSITION_ELOQUENT =
  /->(whereIn|whereIntegerInRaw|whereRaw|whereKey)\s*\(|->(keys|pluck)\s*\(/;

/**
 * Exclusions JUSTIFIÉES, et chacune doit l'être par écrit — même convention que
 * `check-models-spec.mjs`. Vide, et c'est l'état sain.
 */
const EXCLUS_JUSTIFIES = new Map([
  // Vide : aucun scope de `app/` n'a de raison écrite de réintroduire un DSL de filtrage.
]);

const erreurs = [];

// ── Contrôle A — non-vacuité ────────────────────────────────────────────────────────────────────

if (!existsSync(APP) || !statSync(APP).isDirectory()) {
  console.error(`✗ ${relative(ROOT, APP)} est introuvable.`);
  console.error("  La garde ne peut rien vérifier — elle le dit plutôt que de passer en silence.");
  process.exit(1);
}

function fichiersPhp(dir) {
  const out = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) out.push(...fichiersPhp(chemin));
    else if (entree.isFile() && entree.name.endsWith('.php')) out.push(chemin);
  }
  return out;
}

const fichiers = fichiersPhp(APP);

if (fichiers.length < PLANCHER_FICHIERS) {
  erreurs.push(
    `A — ${fichiers.length} fichier(s) PHP lus sous ${relative(ROOT, APP)}, plancher ${PLANCHER_FICHIERS}.\n` +
      `    La garde ne lit plus l'arbre qu'elle prétend garder. Un vert ici ne vaudrait rien.`,
  );
}

if (!existsSync(HAS_QUERY_BUILDER)) {
  erreurs.push(
    `A — ${relative(ROOT, HAS_QUERY_BUILDER)} est introuvable.\n` +
      `    C'est le mécanisme SURVIVANT. S'il a disparu, ce n'est plus « un seul mécanisme », c'est aucun.`,
  );
} else {
  const sourceHqb = readFileSync(HAS_QUERY_BUILDER, 'utf8');

  if (!/public static function buildQuery\s*\(/.test(sourceHqb)) {
    erreurs.push(
      `A — ${relative(ROOT, HAS_QUERY_BUILDER)} ne déclare plus \`public static function buildQuery(\`.\n` +
        `    Le point d'entrée unique du filtrage a été renommé ou retiré : la garde ne sait plus ce qu'elle garde.`,
    );
  }

  // Non-vacuité DU CONTRÔLE D (TCK-326). D interdit tout chemin de recherche hors d'ici ; si le
  // chemin survivant disparaît ou est renommé, D passerait au vert en n'interdisant plus qu'un
  // mécanisme qui n'existe nulle part. Ce n'est pas « un seul mécanisme », c'est aucun.
  if (!/AllowedFilter::callback\(\s*'search'/.test(sourceHqb)) {
    erreurs.push(
      `A — ${relative(ROOT, HAS_QUERY_BUILDER)} ne déclare plus le filtre \`AllowedFilter::callback('search', …)\`.\n` +
        `    C'est le chemin de recherche SURVIVANT (TCK-280/281), celui au nom duquel le contrôle D\n` +
        `    refuse tous les autres. Sans lui, D ne garde plus rien.`,
    );
  }

  if (!/in_array\(\s*Searchable::class/.test(sourceHqb)) {
    erreurs.push(
      `A — ${relative(ROOT, HAS_QUERY_BUILDER)} ne route plus les modèles \`Searchable\` vers Scout.\n` +
        `    Le contrôle D interdit de rebrancher la recherche ailleurs : ce routage est la\n` +
        `    contrepartie de cette interdiction.`,
    );
  }
}

if (!existsSync(ABSTRACT_MODEL)) {
  erreurs.push(`A — ${relative(ROOT, ABSTRACT_MODEL)} est introuvable.`);
} else if (!/use\s+[^;]*\bHasQueryBuilder\b/.test(readFileSync(ABSTRACT_MODEL, 'utf8'))) {
  erreurs.push(
    `A — ${relative(ROOT, ABSTRACT_MODEL)} ne compose plus \`HasQueryBuilder\`.\n` +
      `    Les modèles ne portent donc plus buildQuery() : la convention que cette garde protège n'a plus de support.`,
  );
}

// ── Contrôles B et C — les scopes déclarés dans `app/` ──────────────────────────────────────────

/**
 * Extrait le corps d'une méthode à partir de l'accolade ouvrante qui suit `$depuis`, par comptage
 * d'accolades. Assez pour une signature PHP ordinaire ; les accolades dans les chaînes littérales
 * fausseraient le compte, mais un scope de filtrage n'en contient pas — et une erreur ici rend un
 * corps trop long, donc au pire un FAUX POSITIF bruyant, jamais un faux vert.
 */
function corpsDeMethode(source, depuis) {
  const ouvrante = source.indexOf('{', depuis);
  if (ouvrante === -1) return '';
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}') {
      profondeur--;
      if (profondeur === 0) return source.slice(ouvrante, i + 1);
    }
  }
  return source.slice(ouvrante);
}

// `scope` + une MAJUSCULE : `scopes()` du SmsPullMtargetDlr n'est pas un scope Eloquent.
const MOTIF_SCOPE = /function\s+scope([A-Z][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;

const scopesVus = [];

for (const fichier of fichiers) {
  const source = readFileSync(fichier, 'utf8');
  const rel = relative(ROOT, fichier);

  MOTIF_SCOPE.lastIndex = 0;
  let m;
  while ((m = MOTIF_SCOPE.exec(source)) !== null) {
    const [, nom, signature] = m;
    const cle = `${rel}::scope${nom}`;
    scopesVus.push(cle);

    if (EXCLUS_JUSTIFIES.has(cle)) continue;

    if (NOMS_INTERDITS.test(nom)) {
      erreurs.push(
        `B — ${cle} porte un nom de la famille du DSL supprimé par TCK-307.\n` +
          `    Le filtrage d'API passe par HasQueryBuilder::buildQuery() et les 7 propriétés\n` +
          `    déclaratives du modèle. Voir docs/spatie-query-builder.md.`,
      );
      continue;
    }

    const corps = corpsDeMethode(source, m.index + m[0].length);

    // ── D — RECHERCHE (TCK-326) ─────────────────────────────────────────────────────────────
    // `HasQueryBuilder` est le mécanisme survivant : un chemin de recherche déclaré DANS ce
    // fichier est le chemin autorisé, pas une réintroduction.
    if (fichier !== HAS_QUERY_BUILDER) {
      if (NOMS_RECHERCHE_INTERDITS.test(nom)) {
        erreurs.push(
          `D — ${cle} porte un nom de la famille du chemin de recherche supprimé par TCK-326.\n` +
            `    La recherche plein-texte passe par HasQueryBuilder : \`filter[search]=…\`, qui route\n` +
            `    les modèles Searchable vers Scout ET RESTITUE la pertinence Meilisearch (TCK-281).\n` +
            `    Un scope maison rend un whereIn sans ordre : tolérant aux fautes, classé par date.`,
        );
        continue;
      }

      if (ENTREE_SCOUT.test(corps) && RECOMPOSITION_ELOQUENT.test(corps)) {
        erreurs.push(
          `D — ${cle} a la FORME d'un chemin de recherche : il entre par Scout (\`::search(\`) et\n` +
            `    recompose le résultat dans la requête Eloquent (whereIn/whereIntegerInRaw/\n` +
            `    whereRaw/whereKey/keys/pluck). Le nom a\n` +
            `    changé, le mécanisme est celui que TCK-326 a supprimé — et il PERD l'ordre de\n` +
            `    pertinence que HasQueryBuilder restitue depuis TCK-281.`,
        );
        continue;
      }
    }

    const prendTableau = /\barray\b[^,)]*\$/.test(signature);
    if (!prendTableau) continue;

    if (/\bforeach\b/.test(corps) && /->where\s*\(/.test(corps)) {
      erreurs.push(
        `C — ${cle} a la FORME du DSL supprimé : un scope qui reçoit un tableau et en\n` +
          `    déroule des where() en boucle. Le nom a changé, le mécanisme est le même.\n` +
          `    Le filtrage d'API passe par HasQueryBuilder::buildQuery(). Voir docs/spatie-query-builder.md.`,
      );
    }
  }
}

if (scopesVus.length < PLANCHER_SCOPES) {
  erreurs.push(
    `A — ${scopesVus.length} scope(s) Eloquent détecté(s), plancher ${PLANCHER_SCOPES}.\n` +
      `    Le motif de détection ne reconnaît plus le code du dépôt : les contrôles B et C\n` +
      `    n'ont rien lu, et leur vert ne prouverait rien.`,
  );
}

// ── Sortie ──────────────────────────────────────────────────────────────────────────────────────

if (REPORT) {
  console.log(`Fichiers PHP lus sous ${relative(ROOT, APP)} : ${fichiers.length}`);
  console.log(`Scopes Eloquent détectés : ${scopesVus.length}`);
  for (const s of scopesVus.sort()) console.log(`  · ${s}`);
  console.log('');
  console.log('Portée : les SCOPES ELOQUENT de app/, et eux seuls. Un contrôleur qui lit');
  console.log("  `filter[…]` et empile des where() à la main n'est pas vu par cette garde —");
  console.log('  plusieurs le font délibérément (TCK-281, « Hors périmètre »).');
  console.log('');
}

if (erreurs.length > 0) {
  console.error(`✗ ${erreurs.length} écart(s) — le filtrage doit passer par HasQueryBuilder::buildQuery() :\n`);
  for (const e of erreurs) console.error(`  ${e}\n`);
  process.exit(1);
}

console.log('✓ un seul mécanisme de filtrage : HasQueryBuilder::buildQuery().');
console.log(`  ${scopesVus.length} scopes Eloquent lus dans ${fichiers.length} fichiers PHP, aucun ne réintroduit de DSL.`);
