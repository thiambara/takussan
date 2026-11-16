---
id: TCK-2457
title: "La tuile Santé `search` compare l'index au bon prédicat, et les biens `is_test` ou `sold` indexés ne sortent d'aucune recherche publique"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-11-01
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#3-property"
tags: [back, recherche, sante, meilisearch, surveillance]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai.** Aucun commit ne cite ce ticket ; rien n'a été fermé entre-temps.

- `HealthcheckService.php:335` compte toujours `Property::query()->public()` (`SEARCH_GAP_TOLERANCE = 10`, l.73) ;
  `shouldBeSearchable()` (`Property.php:644-654`) et `conditionsEnLigne()` (l.727-736) divergent toujours.
- Pas de `scopeIndexable` ; `HealthcheckProbesTest` ne teste aucun `gap`.
- Relecture (non éprouvée) des chemins publics vers le moteur : tous passent par `publicFilter()`
  (`is_test = false` et `NOT status IN [NON_PUBLIC_STATUSES]`, l.479-487) — `/search`, `widen()`,
  emplacements, `alertMatches()`, `nominalQuery()`/`facettes()`, `RepartitionDesPrix`, aperçus de
  `SearchSuggestions`. **La carte ne passe pas par Meilisearch** (`PublicPropertyController::map()` lit la base par `->public()`).

**Reste à faire** : le scope et son test de parité, la sonde sur `indexable()` avec ses tests de `gap`,
le test contre Meilisearch réel (liste des chemins corrigée ci-dessous), AC1 en préproduction.
Si TCK-578 choisit « tout indexer », faire ce ticket d'abord : le test de parité protégera TCK-578.

## Objectif utilisateur

L'administrateur plateforme qui lit la page Santé voit la tuile `search` dégradée le jour où l'index a réellement décroché, et seulement ce jour-là.

## Contrat de données

Aucune migration ni route. `HealthcheckService::search()` (`takussan-api/app/Services/Admin/HealthcheckService.php`, ligne 335) compte `Property::query()->public()`, alors que l'index suit `Property::shouldBeSearchable()`.

Mesuré sur la préproduction le 2026-11-01 (audit du serveur, M4) :

- la sonde rend `documents=1101, expected=625, gap=-476`, et 0 tâche Meilisearch n'est échouée ni en attente ;
- les biens non supprimés, publics, hors `draft`, `pending_review` et `rejected` sont 1101, soit exactement l'index ;
- l'index contient 240 biens `is_test`, et des biens `sold`.

`scopePublic()` exige en plus `is_test=false`, `published_at` non nul et l'exclusion de `sold`, `rented`, `archived`, `under_maintenance` et `unavailable`. `SEARCH_GAP_TOLERANCE` vaut 10 : l'écart est donc permanent, et la tuile ne dira rien d'une vraie panne.

## Contraintes strictes (métier)

- **Question à trancher par une mesure, pas par une lecture : un bien `is_test` ou `sold` indexé peut-il sortir d'une recherche publique ?** Relu le 2026-11-01, sans l'éprouver : `PropertySearchService::publicFilter()` les exclut, et `buildFilter()` et `SearchSuggestions` (`app/Services/Search/Suggestions/SearchSuggestions.php`, via `nominalQuery()`) l'emploient — `SuggestService` ne sert plus que les types de biens, en SQL (relevé 2026-11-16). Reste à prouver que **chaque** appel public au moteur passe par lui, y compris les emplacements, l'élargissement de `widen()`, les alertes de recherche (`alertMatches()`) et la répartition des prix (`RepartitionDesPrix`, `/price-distribution`). ~~et la carte~~ — la carte lit la base par `->public()`, pas Meilisearch (`PublicPropertyController::map()`, relevé 2026-11-16).
- Si un chemin public les laisse sortir, c'est un défaut distinct et plus grave que la tuile : il se corrige dans ce ticket, ou se signale au porteur le jour même s'il dépasse ce ticket.
- La sonde et l'index jugent par **un seul** prédicat : deux copies divergeraient de nouveau en silence.
- Le critère reste compatible avec `makeAllSearchableUsing()` : compter ne doit pas charger chaque modèle en mémoire.

## Delta à produire

- [x] Scope `Property::scopeIndexable()`, traduction en requête de `shouldBeSearchable()`, statut de l'agence compris (`agencyIsPublic()`).
- [x] `HealthcheckService::search()` : `expected` compte `Property::query()->indexable()`.
- [x] Test de parité : pour chaque combinaison de statut, visibilité, suppression, `is_test`, `published_at` et statut d'agence, le scope et `shouldBeSearchable()` rendent le même verdict.
- [x] `HealthcheckProbesTest` : l'index aligné sur `indexable()` rend la tuile sans `degraded`, malgré des biens `is_test` et `sold` ; un écart supérieur à `SEARCH_GAP_TOLERANCE` la rend `degraded`.
- [x] Test contre Meilisearch réel : un bien `is_test` et un bien `sold` indexés n'apparaissent ni dans `/search`, ni dans les suggestions, ni dans les emplacements, ni dans l'élargissement, ni dans les alertes de recherche, ni dans la répartition des prix (la carte, qui lit la base, est hors du test — relevé 2026-11-16).

## Critères d'acceptation

- [ ] AC1 — Sur la préproduction, après déploiement, la sonde rend un `gap` dont la valeur absolue reste sous `SEARCH_GAP_TOLERANCE`, avec `documents` et `expected` relevés dans le ticket.
- [x] AC2 — Par ablation : retirer un document de l'index de test au-delà de la tolérance rend la tuile `degraded`.
- [x] AC3 — Par ablation : ajouter une condition à `shouldBeSearchable()` sans toucher au scope rougit le test de parité.
- [x] AC4 — Par ablation : retirer `is_test = false` de `publicFilter()` rougit le test contre Meilisearch réel.
- [x] AC5 — Le ticket écrit la réponse à la question sur `is_test` et `sold`, avec la liste des chemins publics vérifiés.

## Hors périmètre

- Retirer de l'index les biens `is_test` ou `sold`, ce qui changerait ce que la recherche d'administration trouve : une autre décision, seulement si AC5 l'exige.
- La tolérance `SEARCH_GAP_TOLERANCE`.
- Les autres tuiles de la page Santé.

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Un seul prédicat** : `Property::NON_INDEXABLE_STATUSES` est lu par `shouldBeSearchable()` et par le nouveau
  `scopeIndexable()` (`deleted_at` nul, `visibility=public`, statut hors brouillon/en revue/refusé, `ofPublicAgency()`).
  La sonde compte `Property::query()->indexable()` — une requête, aucun modèle chargé.
- **Réponse à la question (AC5) : non.** Un bien `is_test` ou `sold` est bien indexé (prouvé par `getDocument()` et
  une requête moteur sans filtre qui le trouve), et ne sort d'aucune recherche publique. Chemins publics vers le
  moteur, relus puis éprouvés contre Meilisearch réel : `/public/properties/search` (`meta.total`, facettes de
  `facettes()`), emplacements et places réservées (`featuredPool()`, `organicExcluding()`), élargissement `widen()`
  (`search.widened_total`), suggestion (`nominalQuery()` : `interpretation.count`, aperçus, comptes des lieux),
  alertes (`alertMatches()['total']`), répartition des prix (`RepartitionDesPrix` : tranches, `min`, `max`). Tous
  passent par `buildFilter()` → `publicFilter()`. Hors moteur : la carte, `similar`/`status` et l'index public
  lisent la base par `->public()` ; `filter[search]` de `HasQueryBuilder` n'est servi sur `Property` par aucune
  route publique. ⚠ Les lignes rendues sont rechargées par `->public()` en SQL : seul le moteur protège les
  **comptes** — d'où des assertions sur les totaux, jamais sur les seules lignes.
- Tests : `tests/Feature/Search/IndexablePropertyParityTest.php` (1 408 combinaisons insérées en masse),
  `tests/Feature/Admin/Platform/HealthcheckSearchGapTest.php` (classe à part : `InteractsWithMeilisearch` purgerait
  les index pour les 25 tests de `HealthcheckProbesTest` ; elle purge l'index à son `tearDown`, sinon ses 23
  documents dégradent la tuile du `HealthcheckProbesTest` suivant — rouge reproduit sans le `tearDown` :
  `test_un_planificateur_qui_a_tourne_il_y_a_une_minute_est_ok`, statut global non `ok`), et
  `tests/Feature/Search/BiensHorsPublicIndexesTest.php` (7 tests).
- AC2 : `test_un_index_qui_a_decroche_au_dela_de_la_tolerance_degrade_la_tuile` retire 11 documents → `degraded` ;
  10 retirés → `ok`. Ablation de la sonde (retour à `public()`) : les 3 tests rougissent (corpus de 10 `is_test` +
  10 `sold` + 3 publics, au-delà de la tolérance).
- AC3 : ablation `&& ! $this->is_test` ajoutée à `shouldBeSearchable()` seul → le test de parité rougit.
- AC4 : ablation de `'is_test = false'` dans `publicFilter()` → 6 tests sur 7 rougissent (seul le témoin de présence
  dans l'index reste vert), chacun sur son compte moteur : `meta.total`, `widened_total`, `interpretation.count`,
  `alertMatches()['total']`, somme des tranches. Même résultat en retirant la clause `NOT status IN`. Les
  emplacements ne rougissent que par `meta.total` : la vedette de test entre dans le vivier, mais `hydrateIds()` la
  retire de la place réservée (témoin positif : le bien public y est servi). Les comptes des lieux de la suggestion
  sont assertés (≤ 1, liste non vide) mais l'ablation rougit d'abord sur `interpretation.count`.
- AC1 (préproduction, après déploiement) reste à relever : `documents`, `expected` et `gap` de la sonde.

