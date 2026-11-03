---
id: TCK-1341
title: "Les statuts de modération ne se posent plus par les requêtes d'édition d'un bien"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [back, biens, moderation, pistes]
---

## Contexte

Réf : **P147.05** du fichier de pistes, `validé` par le porteur (critère V2 accordé : retirer ces
valeurs ferme un geste aux deux requêtes). Entrée dans le lot de l'angle 123 par la famille : elle
cite `PropertyModerationService.php`, que cite P123.03 du lot.

`UpdatePropertyRequest` (`PATCH /api/properties/{id}`) et `UpdateStatusPropertyRequest`
(`PUT /api/properties/{id}/status`) acceptaient tout `PropertyStatus` : un bailleur posait
`rejected` sans `rejected_at` ni motif, ou `pending_review` sans `submitted_at` (le bien entrait
dans la file de modération sans date de soumission).

## Décision du porteur

validé — porteur (2026-10-22) : retirer `pending_review`, `rejected` et `published` des valeurs qu'acceptent les deux requêtes

## Contrat de données

- `PATCH /api/properties/{id}` et `PUT /api/properties/{id}/status` : `status` ∈ {`pending_review`,
  `rejected`, `published`} → 422 sur `status`. Les autres valeurs inchangées.
- `PUT …/status` sans `properties.publish` pour `published` : 403 inchangé (l'autorisation précède
  la validation).

## Delta à produire

- [x] `PropertyStatus::NOT_SETTABLE_BY_HAND`, lu par les deux requêtes (`Rule::enum(...)->except()`).
- [x] `tests/Feature/Api/PropertyStatutsDeModerationTest.php`.
- [x] Deux tests existants qui posaient `published` par `PUT …/status` (`PropertyAuthorizationTest`,
  cas « statut → published » ; `PublishReadinessTest`, cas `published`) : cas retirés, le
  comportement qu'ils épinglaient est celui que la décision ferme.

## Critères d'acceptation

- [x] AC1 — les six couples (deux requêtes × trois valeurs) rendent 422 et laissent le statut.
- [x] AC2 — `archived` par `PUT …/status` et `unavailable` par `PATCH` restent acceptés.

## Hors périmètre

- Le front ne propose déjà aucune de ces trois valeurs comme geste (`propertyStatusValues`).
- Les autres écritures de statut par `PATCH` (P147.01 à P147.04) ne sont pas de ce ticket.

## Notes d'implémentation

- Ablation : les deux requêtes remises à l'origine → 6 rouges (200), remises → 7/7.
