---
id: TCK-2889
title: "API des clients : trier par étape et par référent, et la sonde de doublon qui nomme le référent de la fiche trouvée"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2890]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, crm, customers, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Au bureau, l'agent range ses clients par étape ou par référent d'un clic sur l'en-tête de colonne ; en créant un client, s'il existe déjà, il sait à quelle étape il est et qui s'en occupe.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-clients e0 bureau et e3). Le tri « Étape » / « Référent » a été écarté parce que l'API refuse ces tris (`Customer::$requestSortable` : `id`, `created_at`, `updated_at`, `status`, `last_contacted_at`, plus les tris sur mesure) ; la sonde `GET /api/customers/duplicates` sert `id`, `name`, `stage` mais **pas le référent** (`CustomerDuplicateProbeController`, l. 38-42).

## Contrat de données

- `GET /api/customers?sort=pipeline_stage|-pipeline_stage|referent|-referent`.
- `GET /api/customers/duplicates` : + `referent` (`{ id, name }` ou `null`).

## Contraintes strictes (métier)

- Le tri par étape suit l'**ordre du pipeline** (Prospect, Qualifié, Négociation, Gagné, Perdu), pas l'ordre alphabétique des codes ; départage stable par identifiant (`DepartageQueryBuilder`).
- Le tri par référent suit le nom affiché du référent (`CollatedNameSort`, repli `App\Support\CaseInsensitive`), fiches sans référent à la fin ; même lecture du référent que `filter[referent]` (`CustomerCommercialAttributes::asReferent`).
- La sonde ne sert le référent qu'au lecteur qui voit déjà l'étape (même borne que `stage`) ; jamais une coordonnée du référent.

## Delta à produire

- [ ] `App\Sorts\CustomerPipelineStageSort` (CASE sur l'ordre du pipeline) et `App\Sorts\CustomerReferentSort` ; `Customer::queryBuilder` : `AllowedSort::custom('pipeline_stage', …)`, `AllowedSort::custom('referent', …)`.
- [ ] `CustomerDuplicateDetector::probe` : référent dans chaque correspondance ; contrôleur : `referent`.
- [ ] Tests : `CustomerSortByStageTest` (ordre du pipeline, sens inverse, départage), `CustomerSortByReferentTest` (nom, sans référent en dernier, une requête), `CustomerDuplicateProbeReferentTest`.

## Critères d'acceptation

- [ ] AC1 — `sort=pipeline_stage` rend Prospect avant Qualifié avant Négociation ; `-pipeline_stage` l'inverse.
- [ ] AC2 — `sort=referent` rend les fiches d'« Awa » avant celles de « Khady », les fiches sans référent en dernier.
- [ ] AC3 — La sonde, sur un téléphone déjà connu, rend `stage` et `referent.name` de la fiche trouvée.

## Hors périmètre

- L'écran (TCK-2890) ; les quartiers proches (servis par la liste des quartiers existante, TCK-2890).

## Notes d'implémentation

_(à remplir par implementing-specs)_
