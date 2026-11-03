---
id: TCK-2124
title: "Un `include[]=` relu à la main ne rend plus 500 sur les interventions, la fiche d'un document et les biens d'une agence en console"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-216--paramètres-lus-à-la-main-en-chaîne-hors-de-buildquery-reçus-en-liste"
tags: [api, maintenance, documents, admin, validation, pistes]
---

## Contexte

Réf : **P216.03** du fichier de pistes, `retenu · autonome` (A1). `MaintenanceRequestController`
(`index`, `show`), `DocumentResource::toArray` et `AgencyDetailController::properties` (pour
l'opérateur sans `UsersView`) relisent `include` par `explode(',', (string) …)` : `include[]=…`
rend 500 « Array to string conversion ». TCK-1866 a fixé l'attendu : une liste vaut un `include`
absent.

## Objectif utilisateur

Un appel mal formé à ces quatre routes est servi comme si `include` manquait, au lieu d'accuser
le serveur ; le `viewer` ne reçoit toujours aucune personne par la fiche d'agence (TCK-600).

## Contrat de données

Aucun changement pour une valeur en chaîne. `include` en liste : pas de chargement à la main
(adresse et agence du bien, `versions`). Pour le `viewer`, la liste est remplacée par un
`include` vide avant `buildQuery()`.

## Delta à produire

- [x] Les quatre sites : `is_string()` avant le découpage.
- [x] `AgencyDetailController::properties` : une liste devient `include=''`, jamais transmise à
  spatie.
- [x] Test : `tests/Feature/Api/ValeursEnListeIncludeLuALaMainTest.php` (un cas par route ; celui
  du `viewer` vérifie l'absence d'`owner`).

## Critères d'acceptation

- [x] AC1 — `maintenance-requests?include[]=property` et `maintenance-requests/{id}?include[]=property` → 200.
- [x] AC2 — `documents/{id}?include[]=versions` → 200, `data.versions` à `null`.
- [x] AC3 — `viewer` : `admin/agencies/{id}/properties?include[]=owner` → 200, sans `owner` ni
  courriel du bailleur.

## Hors périmètre

- Sur la liste des interventions, spatie lit déjà `include[]=property` comme une liste et charge
  le bien (lu, l'exception tombait après `paginate()`) : seul le complément à la main
  (adresse, agence) est sauté.

## Notes d'implémentation

- Reproduction : les quatre tests neufs rouges avant correctif, « Array to string conversion »
  (`MaintenanceRequestController.php:63`, `:165`, `DocumentResource.php:54`,
  `AgencyDetailController.php:191`).
- Ablation : les trois fichiers remis à l'état de `pre-dev` → 4 rouges ; correctif remis → 4 verts.
- Seconde ablation, pour le `viewer` : une variante qui laisse la liste atteindre spatie (filtrage
  sauté quand `include` n'est pas une chaîne) → rouge « does not have the key 'owner' ». Le test
  garde donc TCK-600, pas seulement le 500.
- Piège : `DocumentResource` rend toujours la clé `versions` (`null` sans `include=versions`).
- Voisins verts : `MaintenanceRequestTest` 11, `MaintenanceHistoryTest` 4,
  `DocumentIndexQueryBudgetTest` 2, `DocumentVersionTest` 11, `PlatformOperatorLevelsTest` 7,
  `AgencySuspensionTest` 8.
