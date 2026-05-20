---
id: TCK-281
title: "Recherche interne sur Meilisearch (clients, maintenance, agences, utilisateurs)"
status: todo
phase: P3
family: back
estimate: L
created: 2026-05-20
updated: 2026-05-20
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
- Scoping multi-tenant : `agency_id` doit être un attribut filtrable côté
  Meilisearch.
- Le callback `filter[search]` est déjà rendu Scout-aware par TCK-280 ; ce
  ticket ne fait qu'activer les 4 modèles supplémentaires.

## Direction UX / Artistique

N/A — ticket backend. Les contrats des endpoints de liste ne changent pas ;
aucun fichier frontend n'est modifié.

## Contraintes strictes (métier)

- Aucune fuite cross-tenant — la recherche d'un agent ne renvoie jamais un
  client, une demande ou une agence hors de son périmètre. Le filtre
  `agency_id` doit être poussé **dans la requête Scout**, pas seulement en
  post-filtrage Eloquent (sinon le `take($limit)` de `withSearch()` peut
  tronquer avant d'atteindre les résultats du tenant).
- `shouldBeSearchable()` exclut les enregistrements soft-deleted.
- Les contrats des endpoints de liste (`fields[]`, `filter[]`, `include=`,
  `sort=`, pagination) restent inchangés.
- CI sur `CollectionEngine`, prod sur Meilisearch — tests verts sur les deux.

## Delta à produire

- [ ] Ajouter le trait `Searchable` + `toSearchableArray()` +
      `shouldBeSearchable()` sur `Customer`, `MaintenanceRequest`, `Agency`,
      `User`.
- [ ] Index-settings `config/scout.php` pour chaque modèle
      (`searchableAttributes`, `filterableAttributes` incluant `agency_id`,
      `sortableAttributes`).
- [ ] Garantir le scope tenant : pousser le filtre `agency_id` dans l'appel
      Scout au sein du scope `withSearch()` lorsqu'un contexte d'agence est
      présent.
- [ ] Documenter `php artisan scout:import` pour chacun des 4 modèles
      (premier déploiement).
- [ ] Tests : recherche + isolation cross-tenant pour chaque modèle, verts sur
      `collection` et `meilisearch`.

## Critères d'acceptation

- [ ] AC1 — `filter[search]` sur clients / maintenance / agences /
      utilisateurs tolère les fautes de frappe et classe par pertinence.
- [ ] AC2 — Un agent de l'agence A n'obtient jamais un résultat de l'agence B.
- [ ] AC3 — Les enregistrements soft-deleted n'apparaissent pas dans les
      résultats.
- [ ] AC4 — `fields[]`, `include=`, `sort=` et la pagination continuent de
      fonctionner sur les endpoints concernés.
- [ ] AC5 — La suite de tests passe sur `CollectionEngine` (CI) et
      `MeilisearchEngine`.

## Hors périmètre

- Recherche de biens (public + dashboard) → TCK-280.
- `Tag`, `Invitation`, `BankStatementLine`, `PaymentSearchService`, les profils
  polymorphes (`OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`) et le
  journal d'audit — restent volontairement sur SQL (identifiants techniques,
  recherche exacte, ou données de conformité).
- Autocomplétion `SuggestService`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
