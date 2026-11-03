---
id: TCK-2171
title: "« Plaintes ouvertes » de la santé d'agence ne compte plus les signalements d'un bien supprimé"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-223--agrégats-en-sql-brut-sur-des-tables-à-softdeletes-sans-deleted_at-is-null"
tags: [back, admin, moderation, pistes]
---

## Objectif utilisateur

Le super-admin ne lit pas sous « Plaintes ouvertes » d'une agence un signalement que la file de
modération ne lui montre pas et qu'il ne peut donc pas clore.

## Contexte

Réf : **P223.01** du fichier de pistes, `validé (délégué)`.

Décision du porteur (déléguée) : poser `p.deleted_at IS NULL` dans `open_complaints` de `AgencyDetailController::health`, la règle de la file de modération (`UnifiedModerationService`, `whereNull('p.deleted_at')`) ; test : un bien signalé puis supprimé ne compte plus dans `open_complaints` ; reste : clore les signalements ouverts d'un bien à sa suppression par l'agence (`PropertyObserver::deleted`, décision tracée comme `remove`)

Avant (lu) : `AgencyDetailController::health` comptait les `property_reports` non résolus joints
à `properties as p` sans `p.deleted_at IS NULL`.

## Delta à produire

- [x] `whereNull('p.deleted_at')` dans le compte `open_complaints`.
- [x] Test : `AgencyDetailTest::test_open_complaints_skip_reports_of_a_deleted_property`.

## Critères d'acceptation

- [x] AC1 — Deux biens signalés, dont un supprimé : `open_complaints` vaut 1, comme la file de
  modération de l'agence (`meta.counts.property` = 1).

## Reste à faire

- clore les signalements ouverts d'un bien à sa suppression par l'agence (`PropertyObserver::deleted`, décision tracée comme `remove`)

## Hors périmètre

- Les avis d'un bien supprimé dans la file (P223.03, TCK-2173).

## Notes d'implémentation

- **Ablation** : la condition retirée → 1 rouge sur 7 (`open_complaints` = 2) ; remise → 7 verts.
