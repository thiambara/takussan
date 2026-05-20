---
id: TCK-281
title: "Recherche interne sur Meilisearch (clients, maintenance, agences, utilisateurs)"
status: doing
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

- [ ] Ajouter le trait `Searchable` + `toSearchableArray()` +
      `shouldBeSearchable()` sur `Customer`, `MaintenanceRequest`, `Agency`,
      `User`. `toSearchableArray()` n'indexe que `id` + les champs de
      `$requestSearchFields` — jamais de données sensibles
      (`Customer.id_number`, secrets 2FA, `metadata`).
- [ ] Index-settings `config/scout.php` pour chaque modèle :
      `searchableAttributes` = les champs de recherche ; `filterableAttributes`
      / `sortableAttributes` minimaux — le callback `filter[search]` ne fait
      que `::search()->keys()`, sans filtre ni tri côté moteur.
- [ ] Relever le cap d'ids du callback `filter[search]` de `HasQueryBuilder`
      (`take(1000)` aujourd'hui) pour sécuriser la recall des listes internes.
- [ ] Ré-index des 4 nouveaux modèles au déploiement : la branche
      `chore/deploy-meilisearch-reindex` (TCK-280) fait détecter par
      `deploy.sh` tout modèle définissant `toSearchableArray()` et lance
      `scout:import` automatiquement. Tant qu'elle n'est pas mergée, garder le
      `scout:import` manuel documenté dans `docs/configuration.md §3.6` pour
      chacun des 4 modèles.
- [ ] Tests : recherche + isolation cross-tenant pour chaque modèle, verts sur
      Meilisearch. Réutiliser le concern `Tests\Concerns\InteractsWithMeilisearch`
      (livré par TCK-280) ; étendre son `$meilisearchManagedModels` aux 4
      nouveaux index pour que le reset par test ne laisse pas de documents
      périmés.

## Critères d'acceptation

- [ ] AC1 — `filter[search]` sur clients / maintenance / agences /
      utilisateurs tolère les fautes de frappe et classe par pertinence.
- [ ] AC2 — Un agent de l'agence A n'obtient jamais un client / une demande de
      maintenance / un user de l'agence B. (Pour `Agency`, la liste reste
      bornée aux agences visibles du `$base` du contrôleur.)
- [ ] AC3 — Les enregistrements soft-deleted n'apparaissent pas dans les
      résultats.
- [ ] AC4 — `fields[]`, `include=`, `sort=` et la pagination continuent de
      fonctionner sur les endpoints concernés.
- [ ] AC5 — La suite de tests passe sur Meilisearch (moteur Scout unique, CI
      incluse).

## Hors périmètre

- Recherche de biens (public + dashboard) → TCK-280.
- `Tag`, `Invitation`, `BankStatementLine`, `PaymentSearchService`, les profils
  polymorphes (`OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`) et le
  journal d'audit — restent volontairement sur SQL (identifiants techniques,
  recherche exacte, ou données de conformité).
- Autocomplétion `SuggestService`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
