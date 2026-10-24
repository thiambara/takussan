---
id: TCK-1431
title: "Archiver un bien par le PATCH, et en sortir, passe par `PropertyPublication`"
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
tags: [back, biens, publication, pistes]
---

## Contexte

Réf : **P147.02** du fichier de pistes, `validé` par le porteur (critère V7 accordé).

`PUT …/status` `archived` écrit `PropertyPublication::archivedAttributes()` (privé, `published_at`
nul, `archived_at` posé), et la sortie d'archive remet `archived_at` à nul. Le `PATCH` du bien
n'écrivait que le statut : le bien archivé gardait `visibility=public` et `published_at`, et un
retour à `available` le remettait au catalogue sans republication.

## Décision du porteur

validé — porteur (2026-10-22) : `status=archived` et la sortie d'archive du `PATCH` passent par `PropertyPublication`, avec un test qui compare les colonnes écrites par les deux chemins

## Contrat de données

- `PropertyPublication::statusAttributes(Property, PropertyStatus)` : ce qu'écrit un statut posé à
  la main. Appelé par `PUT …/status` (qui le faisait en ligne) et par le `PATCH`.
- `PATCH {status: archived}` écrit `status`, `visibility=private`, `published_at=null`,
  `archived_at` ; sortir d'archive par le `PATCH` remet `archived_at` à nul.
- Hypothèse : `PATCH {status: archived, visibility: public}` archive (le bien archivé est privé) ;
  le passage à `public` de TCK-1429 ne s'applique pas.

## Delta à produire

- [x] `PropertyPublication::statusAttributes()`.
- [x] `PropertyController::updateStatus` et `::update` l'appellent.
- [x] `tests/Feature/Api/Property/PropertyArchivageParPatchTest.php` : colonnes comparées entre
  les deux chemins, à l'entrée et à la sortie d'archive.

## Critères d'acceptation

- [x] AC1 — archiver un bien en ligne par `PATCH` et par `PUT …/status` écrit les mêmes colonnes.
- [x] AC2 — en sortir (`unavailable`) par les deux chemins écrit les mêmes colonnes, `archived_at` nul.
- [x] AC3 — archivé puis `available` par le `PATCH` : hors de `Property::public()`.

## Hors périmètre

- Les lots (`bulk-archive`) écrivent déjà `archivedAttributes()`.

## Notes d'implémentation

- Ablation : l'appel de `statusAttributes()` retiré du `PATCH` → 3 rouges, remis → 3/3.
