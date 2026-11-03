---
id: TCK-2457
title: "La tuile Santé `search` compare l'index au bon prédicat, et les biens `is_test` ou `sold` indexés ne sortent d'aucune recherche publique"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-11-01
updated: 2026-11-01
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

- **Question à trancher par une mesure, pas par une lecture : un bien `is_test` ou `sold` indexé peut-il sortir d'une recherche publique ?** Relu le 2026-11-01, sans l'éprouver : `PropertySearchService::publicFilter()` les exclut, et `buildFilter()` et `SuggestService` l'emploient. Reste à prouver que **chaque** appel public au moteur passe par lui, y compris les emplacements, l'élargissement de `widen()` et la carte.
- Si un chemin public les laisse sortir, c'est un défaut distinct et plus grave que la tuile : il se corrige dans ce ticket, ou se signale au porteur le jour même s'il dépasse ce ticket.
- La sonde et l'index jugent par **un seul** prédicat : deux copies divergeraient de nouveau en silence.
- Le critère reste compatible avec `makeAllSearchableUsing()` : compter ne doit pas charger chaque modèle en mémoire.

## Delta à produire

- [ ] Scope `Property::scopeIndexable()`, traduction en requête de `shouldBeSearchable()`, statut de l'agence compris (`agencyIsPublic()`).
- [ ] `HealthcheckService::search()` : `expected` compte `Property::query()->indexable()`.
- [ ] Test de parité : pour chaque combinaison de statut, visibilité, suppression, `is_test`, `published_at` et statut d'agence, le scope et `shouldBeSearchable()` rendent le même verdict.
- [ ] `HealthcheckProbesTest` : l'index aligné sur `indexable()` rend la tuile sans `degraded`, malgré des biens `is_test` et `sold` ; un écart supérieur à `SEARCH_GAP_TOLERANCE` la rend `degraded`.
- [ ] Test contre Meilisearch réel : un bien `is_test` et un bien `sold` indexés n'apparaissent ni dans `/search`, ni dans les suggestions, ni dans les emplacements, ni dans la carte, ni dans l'élargissement.

## Critères d'acceptation

- [ ] AC1 — Sur la préproduction, après déploiement, la sonde rend un `gap` dont la valeur absolue reste sous `SEARCH_GAP_TOLERANCE`, avec `documents` et `expected` relevés dans le ticket.
- [ ] AC2 — Par ablation : retirer un document de l'index de test au-delà de la tolérance rend la tuile `degraded`.
- [ ] AC3 — Par ablation : ajouter une condition à `shouldBeSearchable()` sans toucher au scope rougit le test de parité.
- [ ] AC4 — Par ablation : retirer `is_test = false` de `publicFilter()` rougit le test contre Meilisearch réel.
- [ ] AC5 — Le ticket écrit la réponse à la question sur `is_test` et `sold`, avec la liste des chemins publics vérifiés.

## Hors périmètre

- Retirer de l'index les biens `is_test` ou `sold`, ce qui changerait ce que la recherche d'administration trouve : une autre décision, seulement si AC5 l'exige.
- La tolérance `SEARCH_GAP_TOLERANCE`.
- Les autres tuiles de la page Santé.

## Notes d'implémentation

_(à remplir par implementing-specs)_
