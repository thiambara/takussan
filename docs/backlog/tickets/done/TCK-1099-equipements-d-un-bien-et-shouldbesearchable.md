---
id: TCK-1099
title: "Synchroniser les équipements d'un bien ne l'indexe que s'il doit l'être"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-90--écritures-explicites-dans-lindex-face-aux-transactions-et-à-scout_queue"
tags: [back, recherche, pistes]
---

## Contexte

Réf : **P90.01** du fichier de pistes, `retenu · autonome` (A1 : `shouldBeSearchable()` et
ADR-0048 écrivent déjà qu'un brouillon, un bien privé ou un bien d'agence non active sort de
l'index ; `BoostLifecycle::writeProperty` en donne la forme).

`PropertyTagController::sync` et `::destroy` appellent `$property->searchable()` sans juger
`shouldBeSearchable()` : un brouillon privé entre dans l'index, et un bien d'agence `inactive` y
revient, compté par la recherche publique (`meta.total = 1`, `data = []`), parce que
`publicFilter()` ne transpose pas `ofPublicAgency()`.

## Objectif

Les deux écritures de `PropertyTagController` indexent le bien s'il doit l'être, et l'en retirent
sinon.

## Delta à produire

- [x] `Property::reindexer()` : `shouldBeSearchable() ? searchable() : unsearchable()`.
- [x] `PropertyTagController::sync` et `::destroy` l'appellent.
- [x] Test : brouillon privé, bien d'agence `inactive` (synchronisation et retrait), et le témoin
      d'un bien public qui reste indexé.

## Critères d'acceptation

- [x] AC1 — `POST /api/properties/{id}/tags` sur un brouillon privé : 200, et aucun document dans l'index.
- [x] AC2 — Sur un bien publié d'agence `inactive` : 200, aucun document, et la recherche publique rend `meta.total = 0`.
- [x] AC3 — `DELETE /api/properties/{id}/tags/{tag}` sur ce même bien : 204, aucun document.
- [x] AC4 — Un bien public reste indexé par ses équipements (témoin).

## Hors périmètre

- Les autres appelants explicites de l'index (`BoostLifecycle::writeProperty`,
  `GeoReindexation::biens`, `SyncAgencyPropertiesSearchIndex`, `RefreshNewBuildSearchLabel`) :
  ils filtrent déjà, chacun à sa façon ; les faire passer par `reindexer()` est le reste de la
  Piste.
- `publicFilter()`, qui ne filtre pas sur le statut de l'agence : le compte reste juste tant que
  l'index ne porte pas ces biens.

## Notes d'implémentation

- Test : `tests/Feature/Tags/TagSyncIndexFilterTest.php`. Avant correctif : 3 rouges (document
  présent ; `meta.total` 1 pour 0 attendu), le témoin vert.
- Ablation : `PropertyTagController.php` rendu à `HEAD` → les 3 mêmes rouges ; correctif remis →
  4 verts.
