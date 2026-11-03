---
id: TCK-1207
title: "Les listes du référentiel public sortent en cache public de cinq minutes, avec un `ETag`"
status: done
phase: P2
family: technique
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-103--appels-du-navigateur-à-l-hydratation-des-pages-publiques"
tags: [back, api, cache, performance, public, pistes]
---

## Objectif utilisateur

Un visiteur qui recharge une page de recherche ne retélécharge pas les villes, régions,
équipements et types de bien que son navigateur a reçus il y a moins de cinq minutes.

## Contexte

Réf : **P103.03** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

Mesuré avant correctif (`pre-dev` fbb8fc003, test de garde ci-dessous) : `GET` anonyme de
`public/geo/cities`, `public/geo/regions`, `public/amenities` et `public/property-types` → 200 sans
la directive `public` (Laravel sert `no-cache, private`), sans `ETag`.

## Décision du porteur (déléguée)

> `cache.headers:public;max_age=300;etag` sur les quatre routes (`public/geo/cities`, `public/geo/regions`, `public/amenities`, `public/property-types`), sur le modèle et avec la durée de `routes/api/enums.php:7` ; un test par route sur `Cache-Control` et `ETag`, comme `HomepageDiscoveryTest::test_response_is_publicly_cacheable`

## Hypothèses (mode sans humain)

- Les autres routes de `public/geo` (`cities/{city}`, `neighborhoods`) ne sont pas touchées : la
  décision nomme quatre routes.
- Les corps ne dépendent ni de l'appelant ni de la langue (relu : aucun `locale`, `__()` ni
  `user()` dans `GeoReferentialController` et `PublicPropertyTypeController`) ; les paramètres
  (`q`, `region`) sont dans l'URL, donc dans la clé de cache.

## Delta à produire

- [x] `cache.headers:public;max_age=300;etag` sur les quatre routes (`routes/api/geo.php`,
  `routes/api/public.php`).
- [x] Test `tests/Feature/Public/ReferentielPublicCacheTest.php`, un cas par route.

## Critères d'acceptation

- [x] AC1 — chacune des quatre routes rend `public`, `max-age=300`, ni `private` ni `no-cache`, et
  un `ETag`.

## Hors périmètre

- La barre publique qui demande `property-types` à chaque montage (P103.04, côté front).

## Notes d'implémentation

- Ablation : les deux fichiers de routes rendus à `fbb8fc003` → 4 rouges ; remis → 4 verts.
- Classes voisines vertes : `GeoPublicEndpointsTest`, `PublicAmenitiesTest`,
  `PropertyTypesIndexTest`, `NumeroPublieVerifieTest`.
