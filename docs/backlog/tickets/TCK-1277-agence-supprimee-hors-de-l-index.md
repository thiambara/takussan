---
id: TCK-1277
title: "Les biens d'une agence supprimée sortent de l'index de recherche, et leurs pages publiques sont revalidées"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-129--suppression-douce-dune-agence"
tags: [api, recherche, agence, index, pistes]
---

## Contexte

Réf : **P129.04** du fichier de pistes, `validé (délégué)`.

`AgencyObserver` ne met `SyncAgencyPropertiesSearchIndex` en file que sur un changement de
`status` (ADR-0048 § 2) : rien sur `deleted`. Et même mis en file, le job relit l'agence par
`Agency::query()->find()`, que la portée `SoftDeletes` masque : il sort sans rien faire. Les biens
d'une agence supprimée restent dans Meilisearch (le compte `totalHits` les garde) et leurs pages
publiques restent en cache.

## Décision du porteur (déléguée)

« validé (délégué) — `AgencyObserver` met en file `SyncAgencyPropertiesSearchIndex` sur `deleted` et sur `restored`, et le job relit l'agence par `withTrashed()` et la juge publique seulement si elle est `active` et non supprimée : à la suppression, ses biens sortent de l'index et leurs pages publiques sont revalidées, comme à une suspension (ADR-0048 § 2) ; test sous le moteur `collection` : agence supprimée → aucun de ses biens dans `totalHits` »

Critère accordé : V6.

## Reste à faire

« le sens de la suppression d'agence (P129.01) »

## Objectif

Supprimer une agence retire ses biens de l'index et revalide leurs pages publiques ; la restaurer
les y remet, comme la levée d'une suspension.

## Delta à produire

- [x] `AgencyObserver::deleted()` et `restored()` mettent `SyncAgencyPropertiesSearchIndex` en
      file (`afterCommit`).
- [x] Le job relit l'agence par `withTrashed()` ; publique = `active` et non supprimée.
- [x] Tests : agence supprimée → ses biens retirés du moteur (espion), aucun dans `totalHits`
      sous le moteur `collection` ; restaurée → ses biens publics réindexés.

## Critères d'acceptation

- [x] AC1 — Après `$agence->delete()`, le moteur reçoit le retrait de tous ses biens, et aucun
      ceux d'une autre agence.
- [x] AC2 — Sous le moteur `collection`, une recherche publique ne compte aucun bien de l'agence
      supprimée dans `totalHits`.
- [x] AC3 — Après `restore()`, les biens publics de l'agence sont réindexés.

## Hors périmètre

- Le sens de la suppression d'agence (P129.01) : reste au porteur.

## Notes d'implémentation

- Test : `tests/Feature/Search/AgencyDeletionSearchIndexTest.php`. Avant correctif, le moteur
  espion ne reçoit aucun retrait à la suppression.
- Ablations, chacune seule : `withTrashed()` retiré du job → rouge ; `deleted()` vidé → rouge ;
  remis → vert. `AgencySuspensionSearchIndexTest`, `AgencySearchTest`, `AgencyTest` verts.
- Le cas sous le moteur `collection` (demandé par la décision) est **vert sans le correctif** : ce
  moteur relit la base et réévalue `shouldBeSearchable()` à chaque recherche, et
  `agencyIsPublic()` écarte déjà l'agence supprimée. Il garde le compte ; c'est le moteur espion
  qui garde le correctif (même raison que `AgencySuspensionSearchIndexTest`).
