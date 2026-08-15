---
id: TCK-281
title: "Recherche interne sur Meilisearch (clients, maintenance, agences, utilisateurs)"
status: review
phase: P3
family: back
estimate: L
wave: 35
created: 2026-05-20
updated: 2026-08-15
depends_on: [TCK-280]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#16-crm--relation-client
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#21-maintenancerequest-
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
tags: [back, search, scout, meilisearch, crm]
---

## Objectif utilisateur

Un agent ou un administrateur qui filtre une liste interne (clients, demandes
de maintenance, agences, utilisateurs) bénéficie d'une recherche tolérante aux
fautes et classée par pertinence, strictement limitée à son périmètre.

## Contrat de données

- Modèles concernés : `Customer`, `MaintenanceRequest`, `Agency`, `User` —
  à rendre `Searchable`.
- Le `filter[search]` de ces modèles (callback générique de `HasQueryBuilder`,
  alimenté par `$requestSearchFields`) reste inchangé côté contrat — seul le
  moteur derrière change.
- `config/scout.php` — index-settings à ajouter pour chaque modèle.
- Isolation multi-tenant — **garantie sans aucun filtre Scout**. Le callback
  `filter[search]` de `HasQueryBuilder` applique `whereIn(idsScout)` sur la
  requête `$base` déjà scopée par le contrôleur d'index ; l'intersection
  `$base ∩ whereIn` rend toute fuite impossible. Constaté à l'audit : les
  scopes `$base` des contrôleurs (`CustomerController`,
  `MaintenanceRequestController`, `UserAdminController`, `AgencyController`)
  sont des **disjonctions** (`agency_id = X` OU `added_by_id = moi`, etc.) — il
  n'existe pas de clé tenant unique « plate » à pousser dans Scout. On ne
  pousse donc rien côté moteur.
- Seul risque résiduel : la **recall** — le callback plafonne les ids ramenés
  de Meilisearch à `take(1000)`. Pour ces listes internes, relever ce cap
  (cf. Delta) suffit ; la troncature ne mord qu'au-delà d'un volume global
  irréaliste à l'échelle actuelle.
- **Le classement par pertinence n'est PAS acquis par le seul trait
  `Searchable`.** Le callback compose Scout et Eloquent par `whereIn(ids)`, qui
  ne dit rien de l'ordre, et les contrôleurs posent ensuite
  `defaultSort('-created_at')`. Sans travail supplémentaire, AC1 n'aurait été
  tenu qu'à moitié — la tolérance aux fautes oui, le classement non. Cf.
  « Notes d'implémentation ».
- TCK-280 a rendu le callback `filter[search]` Scout-aware : ajouter le trait
  `Searchable` à un modèle suffit pour que son `filter[search]` passe
  automatiquement par Meilisearch — aucune modification du callback n'est
  requise hormis le relèvement du cap.

## Direction UX / Artistique

N/A — ticket backend. Les contrats des endpoints de liste ne changent pas ;
aucun fichier frontend n'est modifié.

## Contraintes strictes (métier)

- Aucune fuite cross-tenant — la recherche d'un agent ne renvoie jamais un
  client, une demande de maintenance ou un user hors de son périmètre.
  Garantie par l'intersection `$base ∩ whereIn(idsScout)` du callback
  `filter[search]` (cf. Contrat de données) — les tests d'isolation per-modèle
  doivent le prouver explicitement.
- `shouldBeSearchable()` exclut les enregistrements soft-deleted.
- Les contrats des endpoints de liste (`fields[]`, `filter[]`, `include=`,
  `sort=`, pagination) restent inchangés.
- Meilisearch est le moteur Scout **unique** sur tous les environnements, CI
  incluse (décision TCK-280 : `phpunit.xml` épingle `SCOUT_DRIVER=meilisearch`,
  `api-ci.yml` provisionne un service Meilisearch — aucun fallback
  `collection`). Les tests de ce ticket tournent sur Meilisearch.

## Delta à produire

- [x] Ajouter le trait `Searchable` + `toSearchableArray()` +
      `shouldBeSearchable()` sur `Customer`, `MaintenanceRequest`, `Agency`,
      `User`. `toSearchableArray()` n'indexe que `id` + les champs de
      `$requestSearchFields` — jamais de données sensibles
      (`Customer.id_number`, secrets 2FA, `metadata`).
- [x] Index-settings `config/scout.php` pour chaque modèle :
      `searchableAttributes` = les champs de recherche ; `filterableAttributes`
      / `sortableAttributes` minimaux — le callback `filter[search]` ne fait
      que `::search()->keys()`, sans filtre ni tri côté moteur.
- [x] Relever le cap d'ids du callback `filter[search]` de `HasQueryBuilder`
      (`take(1000)` aujourd'hui) pour sécuriser la recall des listes internes.
      → constante nommée `HasQueryBuilder::SEARCH_ID_CAP = 5000`, documentée
      comme un plafond **qui échoue en silence**.
- [x] **Restituer l'ordre de pertinence** — ajout au Delta d'origine, sans quoi
      AC1 n'est pas tenable : `App\Sorts\SearchRelevanceSort` +
      `Model::defaultSortsWithRelevance(...)`, câblés sur les 6 endpoints qui
      posaient un `defaultSort` en dur.
- [x] Ré-index des 4 nouveaux modèles au déploiement : la branche
      `chore/deploy-meilisearch-reindex` (TCK-280) fait détecter par
      `deploy.sh` tout modèle définissant `toSearchableArray()` et lance
      `scout:import` automatiquement. Tant qu'elle n'est pas mergée, garder le
      `scout:import` manuel documenté dans `docs/configuration.md §3.6` pour
      chacun des 4 modèles.
- [x] Tests : recherche + isolation cross-tenant pour chaque modèle, verts sur
      Meilisearch. Réutiliser le concern `Tests\Concerns\InteractsWithMeilisearch`
      (livré par TCK-280). ~~Étendre son `$meilisearchManagedModels` aux 4
      nouveaux index~~ — **sans objet depuis le 2026-08-15** : cette liste est
      désormais DÉRIVÉE (`Tests\Support\SearchableModels`) et les 4 nouveaux
      index y entrent seuls. Ne surtout pas y réintroduire de liste manuelle.
- [x] Test d'ORDRE de pertinence par modèle — ajout au Delta d'origine :
      3 enregistrements (exact / 1 faute / 2 fautes) créés dans l'ordre inverse
      de leur pertinence, assertion sur l'ordre des `data.*.id`. Sans lui, AC1
      serait coché sans preuve.
- [x] Couvrir les 2 surfaces qui basculent de moteur sans aucun test :
      `GET /api/agencies/{agency}/members` et la team de la console super-admin,
      toutes deux via `User::buildQuery`.

## Critères d'acceptation

- [x] AC1 — `filter[search]` sur clients / maintenance / agences /
      utilisateurs tolère les fautes de frappe et classe par pertinence.
      **Les deux moitiés sont prouvées**, une par modèle :
      `test_*_search_is_typo_tolerant*` et
      `test_*_search_ranks_by_relevance_not_by_date`. Ce second test seede trois
      enregistrements — exact, 1 faute, 2 fautes — créés dans l'ordre INVERSE
      de leur pertinence, et assert l'ordre des `data.*.id`. Son jumeau
      `test_explicit_sort_wins_over_relevance` assert l'ordre OPPOSÉ sous
      `sort=-created_at` : la paire prouve que l'ordre observé vient du moteur
      et non du hasard des dates.
- [x] AC2 — Un agent de l'agence A n'obtient jamais un client / une demande de
      maintenance / un user de l'agence B. (Pour `Agency`, la liste reste
      bornée aux agences visibles du `$base` du contrôleur.)
      `test_*_never_leaks_across_agencies` / `..._bounded_to_visible_agencies`.
- [x] AC3 — Les enregistrements soft-deleted n'apparaissent pas dans les
      résultats. `test_soft_deleted_*_is_not_searchable`, un par modèle.
- [x] AC4 — `fields[]`, `include=`, `sort=` et la pagination continuent de
      fonctionner sur les endpoints concernés. Les tests de recherche passent
      tous `fields[…]=` ; `test_explicit_sort_wins_over_relevance` prouve qu'un
      `sort=` explicite reste souverain devant la pertinence ; `AgencyTest`,
      `UserAdminTest` et `HasQueryBuilderTest` (44 tests) couvrent le reste du
      contrat et restent verts.
- [x] AC5 — La suite de tests passe sur Meilisearch (moteur Scout unique, CI
      incluse) — **sur le périmètre de vérification du ticket** :
      `--filter='Search|Customer|Maintenance|Agency|User'` → **736 verts**. La
      suite ENTIÈRE n'a pas été rejouée ici (d'autres chantiers tournaient en
      parallèle sur le même arbre de travail) : c'est une vérification en série,
      à faire avant merge.

## Hors périmètre

- Recherche de biens (public + dashboard) → TCK-280.
- `Tag`, `Invitation`, `BankStatementLine`, `PaymentSearchService`, les profils
  polymorphes (`OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`) et le
  journal d'audit — restent volontairement sur SQL (identifiants techniques,
  recherche exacte, ou données de conformité).
- Autocomplétion `SuggestService`.
- **Les consoles super-admin `/api/admin/agencies` et `/api/admin/users` restent
  en recherche stricte (SQL `LIKE`), par CHOIX et non par oubli.** Elles
  n'empruntent pas le callback de `HasQueryBuilder` : elles écrivent leur propre
  `LIKE` (`Admin\AgencyModerationController:41-45`,
  `Admin\UserDetailController:24-34`) avec des filtres qui leur sont propres
  (`created_from`/`created_to`, tri `-properties_count`, recherche par id
  numérique). Le motif : une console de modération sert à retrouver un
  enregistrement PRÉCIS dont on connaît le nom, l'e-mail ou l'id — pas à
  explorer. **Conséquence assumée** : une faute de frappe n'y donne aucun
  résultat, alors qu'elle en donne dans l'écran voisin côté agence. Un lecteur
  qui découvre cet écart doit le lire ici comme une décision, pas comme un bug.

## Notes d'implémentation

### La branche de mai a servi de RÉFÉRENCE, pas de merge

`feat/tck-281-internal-search-meilisearch` (6 commits, tip du 2026-05-21) implémentait déjà les
modèles, `config/scout.php`, le cap et une première série de tests. `git merge-tree` ne montrait
**aucun conflit de code**. Elle n'a pourtant pas été mergée : son diff a été relu changement par
changement, puis ré-appliqué sur l'arbre d'aujourd'hui. *L'absence de conflit textuel n'est pas une
preuve de compatibilité sémantique* — `dev` avait avancé de 67 commits, dont la réparation du
harnais de tests le jour même. Trois écarts l'auraient prouvé :

1. Son `$meilisearchManagedModels` recopiait à la main la liste des index à purger. Cette liste est
   depuis **dérivée** (`Tests\Support\SearchableModels`) : re-merger la version manuelle aurait
   ré-introduit exactement le défaut que la dérivation venait de fermer.
2. Elle ajoutait `docs/plans/task.md`, un tracker de travail personnel, hors convention.
3. Elle **cochait AC1** alors que le classement par pertinence n'était pas implémenté (cf.
   ci-dessous) — et aucun de ses tests ne l'aurait détecté : ils n'assertaient que `meta.total`.

### AC1 — pourquoi le classement par pertinence a coûté du code

Le trait `Searchable` donne la tolérance aux fautes ; il ne donne **pas** le classement. Le callback
`filter[search]` compose Scout et Eloquent par `whereIn($ids)`, et `whereIn` ne dit rien de l'ordre —
`BaseModelTrait` le documentait déjà noir sur blanc (« Scout relevance ordering is *not*
preserved »). Les contrôleurs posaient ensuite `defaultSort('-created_at')`. Livré tel quel, un
agent qui tape « Amadu » retrouve bien « Amadou Diop », mais trié par date : le client dont le nom
colle exactement peut se retrouver en page 3, **et la suite serait verte**. C'est un AC coché sans
preuve — le défaut précis que ce dépôt traque.

Mécanique retenue :

- le callback mémorise l'ordre des ids rendus par Meilisearch dans
  `HasQueryBuilder::$searchRelevanceIds`, indexé par classe de modèle ;
- `Model::defaultSortsWithRelevance('-created_at')` en fait un
  `AllowedSort::custom('search_relevance', new SearchRelevanceSort($ids))` placé **en tête** des
  tris par défaut ;
- `App\Sorts\SearchRelevanceSort` projette le RANG de chaque id dans un
  `CASE <col> WHEN … THEN … ELSE <n> END`.

Trois décisions valent d'être écrites :

**`defaultSorts()`, jamais `allowedSorts()`.** spatie n'applique les tris par défaut que si aucun
`sort=` n'est demandé. La pertinence hérite donc gratuitement de la bonne préséance : elle ordonne
quand le client ne dit rien, et s'efface dès qu'il demande un tri (AC4). Un `orderByRaw` posé
directement dans le callback de filtre aurait au contraire écrasé le `sort=` du client, puisque
spatie applique les filtres **avant** les tris.

**`CASE`, pas `FIELD()`.** `FIELD(id, …)` existe en MySQL 8 et **pas** en SQLite, où tourne la
suite. C'est la 5ᵉ famille du piège « une migration se pense pour MySQL, jamais pour SQLite »,
transposée au requêtage. Le `CASE` est le seul dénominateur commun — et il a été **exécuté** sur un
MySQL 8.0.46 jetable (la version exacte du serveur de production, cf. `scripts/check-db-engine.mjs`),
pas seulement supposé portable.

**Littéraux entiers, pas de placeholders.** À 5 000 ids, des placeholders en coûteraient 10 000 de
plus, en sus des 5 000 du `whereIn` : on approcherait la limite de variables liées de SQLite
(32 766) au lieu de s'en tenir loin. Les ids sont castés en `int`, et le constructeur **refuse** une
clé non entière plutôt que de l'ignorer — un modèle à clé non entière doit être traité
explicitement, pas silencieusement reclassé par date. `tests/Unit/Sorts/SearchRelevanceSortTest.php`
épingle les trois points, dont l'absence de `FIELD(` dans le SQL généré.

### Deux surfaces basculaient de moteur sans aucun test

`GET /api/agencies/{agency}/members` et la team de la console super-admin
(`Admin\AgencyDetailController::team`) passent toutes deux par `User::buildQuery` : rendre `User`
indexable les fait changer de moteur. Aucun test ne les couvrait, et le front envoie **déjà**
`filter[search]` sur la première (`takussan-web/src/lib/queries/agency-members.ts:47`) — une
régression y aurait été invisible jusqu'en production. Deux tests ajoutés dans `UserSearchTest`.
`::team` impose son propre `orderBy(first_name)` sur la requête de base : il gagne la tolérance aux
fautes, pas le classement, et c'est écrit dans le test.

### Le risque de temps de suite était déjà éteint — mesuré, pas déduit

Rendre `User` et `Agency` indexables touche 1336 `User::factory(`, 459 `Agency::factory(` et 221
`actingAsRole()`. Avec `scout.queue=false`, chacun aurait poussé un document synchrone vers
Meilisearch. **Le correctif de harnais du 2026-08-15 l'a fermé avant** : la synchronisation Scout est
coupée par défaut dans `Tests\TestCase::setUp()` et rallumée par le seul concern. Mesuré sur
`--filter=Lease` (131 tests, aucun rapport avec la recherche) : **13,08 s avant**, **12,54 s puis
12,32 s après**. Pas de régression. *(Une première mesure à 17,95 s a été écartée après
reproduction : bruit de machine, d'autres agents travaillant sur le même arbre. Une mesure qu'on ne
reproduit pas n'est pas une mesure.)*

### Index vides en production — le point qui ne se voit pas depuis le code

`scripts/deploy.sh` (Step 6b) ne lance que `scout:sync-index-settings`. Après un déploiement, les
quatre nouveaux index sont créés, correctement paramétrés, et **vides** : la recherche rend zéro
résultat **sans lever la moindre exception**. Rien dans les journaux, rien dans le monitoring, un
écran de liste qui répond « aucun résultat » à tout. La procédure `scout:import` est donc portée à
deux endroits, et le second est celui qui compte : `docs/configuration.md §3.6` **et** le runbook de
`TCK-288` (première mise en production), avec un AC5 qui exige de vérifier `numberOfDocuments > 0`
plutôt que l'absence d'erreur au déploiement. L'automatisation dort toujours sur
`chore/deploy-meilisearch-reindex`, non mergée.

### Données personnelles dans un second magasin

`User::toSearchableArray()` pousse nom, prénom, e-mail, username et téléphone vers Meilisearch ;
`Customer` y pousse nom, e-mail et téléphone. Les mots de passe, secrets 2FA, `metadata` et
`Customer.id_number` en sont exclus explicitement. Le fait demeure : **des données personnelles
vivent désormais hors de MySQL**. À vérifier avant la mise en production (hors périmètre de ce
ticket) : que l'instance Meilisearch de production n'est pas exposée publiquement, et que la
suppression de compte purge bien le document d'index correspondant.

### Vérification

```
php artisan test --filter='Search|Customer|Maintenance|Agency|User'   → 736 passed
php artisan test --filter=SearchRelevanceSortTest                     → 4 passed
./vendor/bin/pint                                                     → passed
```

La suite **entière** n'a pas été rejouée ici : d'autres chantiers tournaient en parallèle sur le
même arbre de travail, et un chiffre global y aurait été ininterprétable. À faire en série avant
merge.
