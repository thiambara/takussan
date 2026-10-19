---
id: TCK-969
title: "Le résumé du locataire ne rend plus `customer_id`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-27"
tags: [back, front, dashboard, tenant, pistes]
---

## Contexte

Réf : **P48.05** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`GET /api/dashboard/tenant` réunit toutes les fiches client du compte, mais rend `customer_id` =
la première. Aucun lecteur au front : seul le type `TenantDashboard` le nomme, et un appelant
futur n'y verrait qu'une agence.

## Décision du porteur (déléguée)

> retirer `customer_id` du résumé du locataire (`DashboardTenantService::summary`), du type `TenantDashboard` (`lib/queries/dashboard.ts`) et des tests qui l'assertent ou le simulent, sans le remplacer par une liste

## Reste à faire

> la vue client sur `/app/payments` pour un compte professionnel qui a aussi un bail de locataire

## Objectif

Le résumé du locataire ne prétend plus désigner une fiche client unique.

## Hypothèses (mode sans humain)

- `DashboardTenantController::show` ajoute `customer_id` aux clés toujours gardées d'un
  `fields[summary]=…` : la clé y est retirée aussi, sans quoi la liste nommerait une clé qui
  n'existe plus. Cela fait partie du « résumé ».

## Delta à produire

- [x] `DashboardTenantService::summary` : plus de clé `customer_id`.
- [x] `DashboardTenantController::show` : `customer_id` retiré des clés gardées.
- [x] Front : `customer_id` retiré du type `TenantDashboard` et du faux de
  `overview/__tests__/locataire.tck-595.test.tsx`.
- [x] Test : `DashboardTenantTest` asserte l'absence de la clé, avec et sans fiche, avec et sans
  `fields[summary]`.

## Critères d'acceptation

- [x] AC1 — `GET /api/dashboard/tenant` ne rend aucune clé `customer_id`, que le compte ait une
  fiche ou non, et avec `fields[summary]`.
- [x] AC2 — `has_customer_profile` reste rendu.

## Hors périmètre

- La vue client sur `/app/payments` (reste du porteur).
- Toute liste des fiches en remplacement.

## Notes d'implémentation

- **Ablation** : la ligne `customer_id` remise dans `DashboardTenantService::summary` →
  `DashboardTenantTest` 2 rouges sur 5 ; retirée → 5 verts.
- La ligne retirée de `DashboardTenantController` (`$keep[] = 'customer_id'`) n'est observable
  par aucun test une fois le service corrigé : `array_intersect_key` ignore une clé absente. Elle
  part pour que la liste ne nomme plus une clé qui n'existe pas.
