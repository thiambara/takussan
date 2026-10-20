---
id: TCK-1049
title: "Les collaborations du prestataire et l'`include=agency` du bailleur ne rendent plus la ligne `agencies` entière"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: [TCK-1048]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#39-serviceprovideragencycollaboration-"
    - "docs/models-spec.md#34-ownerprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-61--modèles-rendus-bruts-par-un-contrôleur-au-delà-de-user"
tags: [api, ressource, rgpd, prestataire, agence, pistes]
---

## Contexte

Réf : **P61.02** du fichier de pistes, `validé` par le porteur (V3). Deux listes rendaient des
modèles bruts, et leur `include=agency` la ligne `agencies` entière (36 clés, dont
`payout_approval_threshold`, `bank_csv_mapping`, `settings`, `metadata`) :
`GET /api/me/service-provider/collaborations` au prestataire, et
`GET /api/me/owner-profiles/{id}/properties` au bailleur. Re-mesuré le 2026-10-20 sur `pre-dev`
96392a9cb par les tests ci-dessous : rouges avant correctif sur `payout_approval_threshold`.

## Décision du porteur

> validé — rendre les deux listes par une ressource, l'agence incluse passant par `AgencyResource`, qui juge ce que l'appelant voit ; test : le prestataire avec `include=agency` ne reçoit ni `payout_approval_threshold` ni `bank_csv_mapping` (porteur, 2026-10-20)

## Objectif

Aucune des deux listes ne rend une agence incluse hors d'une ressource.

## Delta à produire

- [x] `App\Http\Resources\ServiceProviderAgencyCollaborationResource` : colonnes par `whenHas`
      (la route accepte `fields[…]`), dates calendaires par `calendarDate()`, `agency` par
      `AgencyResource`.
- [x] `ServiceProviderAgenciesController::index` passe par elle.
- [x] `ServiceProviderAgencyCollaboration::$requestLoadable` réduit à `agency`.
- [x] La liste du bailleur passe par `PropertyResource` (TCK-1048).
- [x] Tests : `tests/Feature/ServiceProvider/ServiceProviderCollaborationsListTest.php`, et
      `OwnerOnboardingTest::test_l_agence_incluse_ne_rend_au_bailleur_ni_le_seuil_ni_le_mapping_bancaire`.

## Critères d'acceptation

- [x] AC1 — Le prestataire, `?include=agency` : `data.0.agency` ne porte ni
      `payout_approval_threshold`, ni `pending_payout_threshold`, ni `bank_csv_mapping`.
- [x] AC2 — La collaboration ne porte plus `metadata` ni `deleted_at` ; `started_at` sort en
      `2026-09-19`, comme `/me/service-provider/agencies`.
- [x] AC3 — Le bailleur, `?include=agency` : l'agence ne porte ni le seuil, ni le mapping, ni
      `settings`, ni `metadata`.

## Hypothèses (mode sans humain)

- La liste du bailleur passe par `PropertyResource` (décision de P61.03), dont l'agence incluse
  est la projection publique `buildAgency()` (`id`, `name`, `slug`, `logo_url`, `verified`,
  `rating`, `kind`) et non `AgencyResource` : elle est plus étroite que `AgencyResource`, et la
  faire passer par `AgencyResource` changerait l'agence de toutes les listes de biens.
- `serviceProviderProfile` et `agencyRole` sortent de `$requestLoadable` : la ressource ne les
  émet pas (garde de TCK-807), et la route n'a aucun appelant du front (mesuré par `grep`). La
  piste prévoit ce retrait « quand rien ne le demande ».
- `metadata` de la collaboration (`paused_by`) n'est plus rendue : la route n'a pas de lecteur.

## Hors périmètre

- `IncludedUserResource::inParent()` de `OwnerProfileResource` laisse sortir brutes les autres
  relations incluses de `/api/owners` (`agency`, `invitations`, `agencyRole`) : la décision ne
  porte que sur les deux listes. Laissé en reste de l'entrée.
- Le retrait de la route `/me/service-provider/collaborations` (P61.04).

## Notes d'implémentation

- Ablations : `$paginator->items()` remis dans `ServiceProviderAgenciesController` → 2 rouges ;
  l'agence remise en `toArray()` brut dans la ressource → 1 rouge (seuil) ; la liste du bailleur
  remise en `$paginator->items()` → 1 rouge. Remis → 51 verts sur les classes touchées.
- Le premier rouge après correctif est venu de la garde `RequestLoadableEmittedTest` :
  la ressource neuve rend la paire modèle/ressource visible, et `serviceProviderProfile`,
  `agencyRole` y apparaissaient acceptés sans être émis.
