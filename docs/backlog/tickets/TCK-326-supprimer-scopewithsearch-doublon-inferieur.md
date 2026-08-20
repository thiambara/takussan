---
id: TCK-326
title: "Supprimer `scopeWithSearch` — le jumeau de `scopeFilter`, et un doublon INFÉRIEUR"
status: done
phase: P2
family: technique
estimate: S
wave: 39
created: 2026-08-17
updated: 2026-08-20
depends_on: [TCK-307]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models: []
tags: [back, code-mort, recherche, scout, convention, refactor, dette]
---

## Objectif utilisateur

Qu'un développeur qui cherche comment brancher une recherche sur une liste ne trouve pas deux
chemins également disponibles dont l'un rend un classement dégradé sans le dire à l'appel.

## Contrat de données

Aucun modèle nouveau. **Mesuré le 2026-08-17**, en soldant [TCK-307](TCK-307-supprimer-dsl-scopefilter-mort.md) :

- `BaseModelTrait::scopeWithSearch(Builder, ?string, int $limit = 1000)` vit dans
  `app/Models/Bases/Traits/BaseModelTrait.php`, monté sur les **68 modèles** qui étendent
  `AbstractModel`.
- **5 appelants, tous dans `tests/Feature/Search/ScoutSearchTest.php`** — c'est-à-dire dans le seul
  test qui le teste. **Zéro appelant** en `app/`, `routes/`, `database/`, `bin/`, `config/`.
- `isSearchable()`, déclaré dans le même trait, n'est appelé que par `scopeWithSearch` lui-même.
  `HasQueryBuilder` ne l'emprunte pas : il refait le `in_array(Searchable::class, …)` en ligne
  (`HasQueryBuilder.php`, commentaire TCK-280), **délibérément**, parce qu'il sert aussi des
  modèles sans le trait (`User`). Ce point est à vérifier avant de supprimer `isSearchable` :
  sa portée n'est pas la même que celle de `scopeWithSearch`.

**Ce n'est pas un doublon inerte, c'est un doublon INFÉRIEUR** — et c'est ce qui distingue ce
ticket de TCK-307. Les deux chemins ne se valent pas, `takussan-api/CLAUDE.md` § *Recherche* le
tranche déjà :

| Chemin | Ordre de pertinence Meilisearch |
|---|---|
| `scopeWithSearch()` | **perdu** — `whereIn` sans restitution, son propre docblock l'avertit |
| `HasQueryBuilder` `filter[search]` | **restitué** depuis TCK-281 (`$searchRelevanceIds` → `SearchRelevanceSort`) |

`scopeFilter` était du code mort équivalent au vivant. Celui-ci est du code mort **moins bon** que
le vivant, et il ne le signale que dans un docblock que l'appelant ne lit pas. Un développeur qui le
choisit obtient une recherche tolérante aux fautes mais classée par date — exactement le défaut que
TCK-281 a corrigé ailleurs, et qui cochait un AC sans le tenir.

**Pourquoi ce n'est pas fait dans TCK-307.** Son *Delta à produire* ne nomme que `scopeFilter`, et
son **AC3 bornait explicitement la baisse du compte de tests** au seul DSL nommé — retirer
`scopeWithSearch` aurait supprimé 5 cas de plus que ce que le ticket autorisait à supprimer.
Consigné en **ardoise D-34bis** plutôt que fait en passant.

## Contraintes strictes (métier)

- **Refaire l'inventaire, ne pas le croire.** Le chiffre ci-dessus date du 2026-08-17 ; un scope
  Eloquent s'invoque par méthode magique, donc `grep '->withSearch('` ne prouve rien seul. Couvrir
  le dépôt entier et les invocations dynamiques, comme l'a fait TCK-307.
- **Les 5 tests de `ScoutSearchTest` ne se suppriment pas tous à l'aveugle.** Ce fichier teste
  `scopeWithSearch` ET, potentiellement, des propriétés du harnais Scout qui survivent à la
  suppression. Ne retirer que les cas qui portent sur le scope supprimé, et **dire le compte
  exactement** — même exigence qu'AC3 de TCK-307.
- **Ne pas supprimer `isSearchable()` sans l'avoir inventorié séparément** : sa portée n'est pas
  celle de `scopeWithSearch` (cf. *Contrat de données*).
- Si un appelant réel apparaît, il se **migre vers `filter[search]` / `buildQuery()` d'abord** —
  et la migration doit **restituer la pertinence** via `defaultSortsWithRelevance()`, sinon elle
  reproduit le défaut de TCK-281.

## Delta à produire

- [x] Ré-inventorier `scopeWithSearch` et `isSearchable` sur le dépôt entier, invocations
      dynamiques comprises
- [x] Migrer les appelants réels s'il en existe — vers `filter[search]`, pertinence restituée
- [x] Supprimer `scopeWithSearch` de `BaseModelTrait`, et `isSearchable` si son inventaire propre
      le permet
- [x] Retirer les seuls cas de `tests/Feature/Search/ScoutSearchTest.php` qui portaient sur le
      scope supprimé — compte donné explicitement
- [x] Étendre `scripts/check-filtering-single-mechanism.mjs` : elle ne voit **pas** ce scope
      aujourd'hui (il ne prend pas de tableau et ne boucle pas de `where()`), donc son contrôle C
      ne l'attrape pas. Ajouter un contrôle qui refuse un scope de RECHERCHE hors `HasQueryBuilder`
- [x] **Prouver l'extension de la garde par mutation**, y compris le cas « la garde ne trouve plus
      sa cible » — le contrôle de non-vacuité existant doit couvrir le nouveau contrôle
- [x] Mettre à jour `takussan-api/CLAUDE.md` § *Recherche* (la ligne du tableau qui décrit le
      chemin supprimé) et solder **D-34bis** dans `docs/ardoise.md`

## Critères d'acceptation

- [x] AC1 — `scopeWithSearch` n'existe plus dans le dépôt, et `BaseModelTrait` ne porte plus qu'un
      mécanisme (ou disparaît, si son inventaire montre qu'il ne reste rien)
- [x] AC2 — l'inventaire est consigné et couvre les invocations dynamiques ; le sort de
      `isSearchable` est tranché **par sa propre mesure**, pas par association
- [x] AC3 — le nombre de tests n'a baissé que du compte des cas portant sur le scope supprimé,
      compte donné explicitement ; aucune assertion assouplie
- [x] AC4 — la garde CI refuse la réintroduction d'un chemin de recherche hors `HasQueryBuilder`,
      **et la preuve par mutation est écrite avec sa sortie exacte**
- [x] AC5 — aucun comportement de recherche exposé par l'API n'a changé : la pertinence reste
      restituée sur le chemin `filter[search]` (non-régression de TCK-281)

## Hors périmètre

- Le cap `HasQueryBuilder::SEARCH_ID_CAP` (5000) qui échoue en silence — défaut réel, documenté
  dans `takussan-api/CLAUDE.md` § *Recherche*, mais sans rapport avec ce ticket.
- Les consoles super-admin, qui écrivent leur propre `LIKE` par choix assumé (TCK-281,
  « Hors périmètre »).
- Le filtrage ad hoc en contrôleur, hors de portée de la garde par décision (cf. TCK-307).

## Notes d'implémentation

**Implémenté le 2026-08-20.** Machine : 8 cœurs (`sysctl -n hw.ncpu` → `8`), `load average` 4,79 au
départ, 10-12 pendant les exécutions. Services natifs sur les ports canoniques (Meilisearch 7700).

### 1. Le ré-inventaire — refait, pas cru

La prémisse du ticket **TIENT**, à un chiffre près qu'il vaut la peine de nommer : le ticket parle
de « 5 appelants », et il y a bien **5 sites d'appel**, mais répartis sur **4 méthodes de test** —
`test_with_search_scope_is_noop_when_term_is_empty` en contient deux. C'est cette distinction qui
gouverne AC3.

```
$ grep -rn "withSearch\|isSearchable" --exclude-dir={node_modules,vendor,.git,.next} .
takussan-api/app/Models/Bases/Traits/BaseModelTrait.php:32:     *   Property::query()->withSearch($request->input('q'))->public()->paginate();   ← docblock
takussan-api/app/Models/Bases/Traits/BaseModelTrait.php:51:        if ($term === '' || ! static::isSearchable()) {                              ← l'appel à isSearchable
takussan-api/app/Models/Bases/Traits/BaseModelTrait.php:70:    public static function isSearchable(): bool                                       ← sa déclaration
takussan-api/app/Models/Concerns/HasQueryBuilder.php:188:                // delegating to BaseModelTrait::withSearch() because             ← commentaire
takussan-api/tests/Feature/Search/ScoutSearchTest.php:108,120,123,134,149                             ← LES 5 SITES D'APPEL
docs/… (plans, ADR, tickets) — documentaire uniquement
```

**Invocations dynamiques — le point que le ticket exigeait de couvrir**, un scope Eloquent
s'invoquant par méthode magique :

```
$ grep -rn "scopes(\|call_user_func\|->{\$\|\$scope\|withSearch" takussan-api/{app,routes,database,bin,config}
… app/Notifications/ResetPasswordNotification.php:36  → call_user_func(static::$createUrlCallback, …)   sans rapport
… app/Console/Commands/SmsPullMtargetDlr.php:51,91    → $this->scopes() — helper de commande, PAS un scope Eloquent
(aucune autre occurrence)

$ grep -rn "withSearch\|with_search\|isSearchable\|is_searchable" takussan-web/src takussan-web/*.ts takussan-web/*.mjs
(aucune) ← le nom ne fuite pas non plus dans une query string côté front
```

**Bilan : 0 appelant** en `app/`, `routes/`, `database/`, `bin/`, `config/`, **0** côté
`takussan-web/`, **0** invocation dynamique, **0** occurrence en chaîne de caractères. Les 5 seuls
appels vivaient dans le test qui le testait. Aucun appelant réel à migrer.

### 2. `isSearchable` — tranché par SA PROPRE mesure

Le ticket interdisait de le supprimer « par association ». Sa mesure propre : **un seul appelant, et
c'est `scopeWithSearch` lui-même** (`BaseModelTrait.php:51`). Le point de vigilance du *Contrat de
données* a été vérifié dans le code, pas déduit : `HasQueryBuilder` ne l'emprunte effectivement pas —
il refait le test en ligne, `in_array(Searchable::class, class_uses_recursive($model), true)`
(`HasQueryBuilder.php:191`), délibérément, parce qu'il sert aussi `User`, qui étend `Authenticatable`
et n'a donc jamais porté `BaseModelTrait`. Supprimer `isSearchable` ne retire donc rien à
`HasQueryBuilder`. **Sort : supprimé.**

### 3. Le trait a suivi — `AbstractModel` = `Model` + `HasQueryBuilder`

Les deux membres retirés, `BaseModelTrait` devenait un trait VIDE composé sur 68 modèles. AC1
l'autorisait explicitement (« ou disparaît, si son inventaire montre qu'il ne reste rien »), et un
trait vide monté sur toute la base de modèles n'est pas neutre : il se lit comme l'emplacement
prévu pour les helpers de modèle, donc il se remplit. **Le fichier est supprimé.** Le tombeau —
motif des deux suppressions, TCK-307 et TCK-326 — est déplacé en docblock sur `AbstractModel`, au
point de composition, c'est-à-dire là où quelqu'un ira le chercher.

Aucun test PHP ne référençait `AbstractModel` ni `BaseModelTrait` (`grep -rn "AbstractModel"
tests/ --include='*.php'` → rien).

### 4. AC3 — le compte de tests, à l'unité

| | avant | après | delta |
|---|---|---|---|
| `ScoutSearchTest` — tests | **9 passés** | **5 passés** | **−4** |
| `ScoutSearchTest` — assertions | **26** | **20** | **−6** |

```
$ php artisan test tests/Feature/Search/ScoutSearchTest.php      # AVANT
  ✓ uses collection driver in tests / full text search returns matching properties /
    search results are paginable / searchable array exposes filterable and searchable fields /
    with search scope composes with filters / with search scope is noop when term is empty /
    with search scope returns empty when no index match /
    with search scope caps result set at configured limit / draft properties are not indexed
  Tests: 9 passed (26 assertions)   Duration: 1.91s

$ php artisan test tests/Feature/Search/ScoutSearchTest.php      # APRÈS
  ✓ uses collection driver in tests / full text search returns matching properties /
    search results are paginable / searchable array exposes filterable and searchable fields /
    draft properties are not indexed
  Tests: 5 passed (20 assertions)   Duration: 1.52s
```

Les 4 retirées sont **exactement** les `test_with_search_scope_*`, et elles seules. Les 5
survivantes ne touchent pas au scope : elles épinglent des propriétés du harnais Scout qui vivent
sans lui — le driver actif, `Property::search()` direct, la pagination Scout, la forme de
`toSearchableArray()`, la non-indexation des brouillons. **Aucune assertion assouplie** : le −6
d'assertions est la somme exacte des 4 méthodes retirées (2 + 2 + 1 + 1).

### 5. AC4 — le contrôle D de la garde, et sa preuve par MUTATION

Le contrôle C existant ne pouvait pas voir ce scope, et ce n'est pas un oubli : C cherche un scope à
paramètre `array` qui déroule des `where()` en boucle ; `scopeWithSearch` prend une `?string` et ne
boucle rien. **Contrôle D ajouté**, par NOM *et* par FORME — le nom attrape le copier-coller, la
forme survit au renommage :

- **nom** : `/^(With)?(Search(By|Term|Text)?|Scout|FullText(Search)?|TextSearch)$/` ;
- **forme** : corps du scope contenant une entrée Scout `(::|->)search\(` **ET** une recomposition
  Eloquent `->(whereIn|whereRaw|whereKey)\(` ou `->keys\(` ;
- **exemption** : un scope déclaré *dans* `HasQueryBuilder.php` — c'est le mécanisme survivant.

**Quatre mutations, sorties exactes.**

*M1 — le correctif retiré (le scope réintroduit à l'identique). ROUGE :*

```
$ node scripts/check-filtering-single-mechanism.mjs
✗ 1 écart(s) — le filtrage doit passer par HasQueryBuilder::buildQuery() :

  D — takussan-api/app/Models/Bases/Traits/BaseModelTrait.php::scopeWithSearch porte un nom de la famille du chemin de recherche supprimé par TCK-326.
    La recherche plein-texte passe par HasQueryBuilder : `filter[search]=…`, qui route
    les modèles Searchable vers Scout ET RESTITUE la pertinence Meilisearch (TCK-281).
    Un scope maison rend un whereIn sans ordre : tolérant aux fautes, classé par date.

SORTIE=1
```

*M2 — le MÊME scope sous un nom innocent (`scopeMatching`), pour prouver que D ne garde pas qu'un
jeton. ROUGE, par la FORME :*

```
$ sed -i '' 's/function scopeWithSearch(/function scopeMatching(/' …/BaseModelTrait.php
$ node scripts/check-filtering-single-mechanism.mjs
✗ 1 écart(s) — le filtrage doit passer par HasQueryBuilder::buildQuery() :

  D — takussan-api/app/Models/Bases/Traits/BaseModelTrait.php::scopeMatching a la FORME d'un chemin de recherche : il entre par Scout (`::search(`) et
    recompose le résultat dans la requête Eloquent (whereIn/whereRaw/keys). Le nom a
    changé, le mécanisme est celui que TCK-326 a supprimé — et il PERD l'ordre de
    pertinence que HasQueryBuilder restitue depuis TCK-281.

SORTIE=1
```

*M3 et M4 — « la garde ne trouve plus sa cible », le cas que le ticket exigeait de couvrir.* Le
contrôle A gardait déjà `buildQuery()` et la composition d'`AbstractModel` ; il ne gardait pas ce
sur quoi D s'appuie. **Deux ancrages ajoutés à A** : sans eux, on pourrait retirer le chemin de
recherche survivant et la garde passerait au vert en n'interdisant plus qu'un mécanisme qui
n'existe nulle part — ce ne serait plus « un seul mécanisme », ce serait aucun.

```
$ sed -i '' "s/AllowedFilter::callback('search'/AllowedFilter::callback('recherche'/" …/HasQueryBuilder.php
$ node scripts/check-filtering-single-mechanism.mjs
✗ 1 écart(s) …
  A — takussan-api/app/Models/Concerns/HasQueryBuilder.php ne déclare plus le filtre `AllowedFilter::callback('search', …)`.
    C'est le chemin de recherche SURVIVANT (TCK-280/281), celui au nom duquel le contrôle D
    refuse tous les autres. Sans lui, D ne garde plus rien.
SORTIE=1

$ sed -i '' "s/in_array(Searchable::class/in_array(\\Laravel\\Scout\\Searchable::class/" …/HasQueryBuilder.php
$ node scripts/check-filtering-single-mechanism.mjs
✗ 1 écart(s) …
  A — takussan-api/app/Models/Concerns/HasQueryBuilder.php ne route plus les modèles `Searchable` vers Scout.
    Le contrôle D interdit de rebrancher la recherche ailleurs : ce routage est la
    contrepartie de cette interdiction.
SORTIE=1
```

*Restauration exacte, puis VERT :*

```
$ git diff --stat takussan-api/app/Models/Concerns/HasQueryBuilder.php   # après restauration
(vide — restauré à l'identique)
$ node scripts/check-filtering-single-mechanism.mjs
✓ un seul mécanisme de filtrage : HasQueryBuilder::buildQuery().
  59 scopes Eloquent lus dans 931 fichiers PHP, aucun ne réintroduit de DSL.
SORTIE=0
```

Les scopes lus passent de **60 à 59** : la différence est `scopeWithSearch`, et c'est la seule.

⚠️ **Honnêteté sur M4** : la mutation employée (nom pleinement qualifié `\Laravel\Scout\Searchable`)
rougirait aussi sur une réécriture parfaitement légitime. C'est assumé et c'est le parti pris déjà
inscrit dans l'en-tête de cette garde : au pire un **faux positif bruyant**, jamais un faux vert.

### 6. AC5 — non-régression du chemin `filter[search]`

Deux preuves, l'une par le diff, l'autre par exécution.

**Par le diff** — `git diff --stat takussan-api/app/` sur mes fichiers : `AbstractModel.php`
(docblock + retrait d'un trait DEVENU VIDE), `BaseModelTrait.php` (supprimé), et
`HasQueryBuilder.php` **dont le diff ne contient QUE des lignes de commentaire** (vérifié ligne à
ligne). **Aucune ligne exécutable du chemin de recherche n'a été touchée.**

**Par exécution** — toutes les surfaces qui traversent `filter[search]` et `SearchRelevanceSort` :

```
$ php artisan test tests/Feature/Search tests/Unit/Sorts/SearchRelevanceSortTest.php \
    tests/Feature/Api/HasQueryBuilderTest.php tests/Unit/ModelsTest.php \
    tests/Feature/Api/PropertyDashboardSearchTest.php tests/Feature/Api/ReviewReportAndDocSearchTest.php \
    tests/Feature/Public/PropertySearchTest.php tests/Feature/PublicPropertySearchFiltersTest.php
  Tests: 95 passed (298 assertions)   Duration: 61.07s     ← load average 10,06
```

**Les 22 gardes du dépôt, toutes vertes** (`for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`
→ aucune sortie) — y compris `check-impact-map.mjs` et `check-doc-links.mjs`, que la suppression
d'un fichier source et la réécriture de deux ADR auraient pu casser.

**La suite entière n'a PAS été lancée ici** : règle du dépôt, c'est la session déléguante qui la
joue une fois, à la fin.

### 7. Documentation rendue fausse par la suppression, et corrigée

- `takussan-api/CLAUDE.md` § *Recherche* — le tableau « deux chemins qui ne se valent pas » devient
  un seul chemin, avec l'inventaire du 2026-08-20 et le renvoi au contrôle D.
- `takussan-api/CLAUDE.md` § *Modèles* — disait `AbstractModel` = `Model` + `BaseModelTrait` +
  `HasQueryBuilder` ; dit désormais `Model` + `HasQueryBuilder`.
- `takussan-api/CLAUDE.md` § *filtrage* — le paragraphe TCK-307 annonçait « `scopeWithSearch()`
  subsiste […] C'est le même motif, non traité » : périmé, corrigé.
- `docs/adr/0008-meilisearch-sur-tous-les-environnements.md` — le « caveat de conception » sur la
  pertinence perdue est soldé par les deux bouts (TCK-281 restitue, TCK-326 supprime), et la
  référence de fichier `BaseModelTrait.php:52-60` pointait vers un fichier qui n'existe plus.
- `docs/adr/0006-lecture-api-par-query-builder.md` — **il était déjà faux avant ce ticket** : il
  arbitrait « `scopeFilter` pour les usages internes (jobs, commandes, services) », un usage que
  TCK-307 avait mesuré à **zéro** dès le 2026-08-17. Le texte d'origine est cité puis amendé, à la
  date, plutôt que réécrit en silence.
- `docs/ardoise.md` — **D-34bis soldé**, et le renvoi « ⚠ `scopeWithSearch()` subsiste » de D-34
  corrigé.

### 8. Ce qui n'a PAS été fait, et pourquoi

- **`tests/impact-map.json` n'est pas à jour** — elle est ENGENDRÉE d'un rapport de couverture,
  jamais éditée à la main, et elle date du commit `eafab606` (106 commits en arrière). Elle cite
  encore `app/Models/Bases/Traits/BaseModelTrait.php`, qui n'existe plus. Sans conséquence
  immédiate : `php bin/impacted-tests.php` réclamait déjà **la suite entière** avant ce ticket, à
  cause de fichiers absents de la carte. Régénération à faire en fin de branche.
- Le cap `SEARCH_ID_CAP` et les consoles super-admin : *Hors périmètre* du ticket, inchangés.
