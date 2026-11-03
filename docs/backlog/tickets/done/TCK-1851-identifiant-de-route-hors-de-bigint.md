---
id: TCK-1851
title: "Un identifiant de route publique au-delà de `bigint` rend 404, et non 500"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-187--paramètres-des-routes-publiques-sans-compte-face-à-une-valeur-mal-formée"
tags: [back, public, routes, pistes]
---

## Contexte

Réf : **P187.05** du fichier de pistes, `retenu · autonome` (A1). `whereNumber()` accepte toute
suite de chiffres. `GET /api/public/geo/cities/99999999999999999999` rendait 500 (`22003 … out of
range for type bigint`, à la liaison implicite de `GeoCity`) ; le fichier d'un document public,
action typée `int $property, int $document`, rendait 500 (`must be of type int, string given`).
La route rend déjà 404 sur `/abc`, et le contrôleur des documents promet 404 à tout échec.

## Objectif utilisateur

Un robot ou un visiteur qui suit une URL publique tronquée ou altérée reçoit un 404.

## Contrat de données

Aucun changement pour un identifiant réel : 18 chiffres couvrent tout `bigint` atteignable par
une séquence (borne 9 223 372 036 854 775 807, 19 chiffres).

## Delta à produire

- [x] `routes/api/geo.php` : `cities/{city}` contraint par `[0-9]{1,18}`.
- [x] `routes/api/public.php` : `properties/{property}/documents/{document}/file` contraint de même.
- [x] Tests : `GeoPublicEndpointsTest` (19 et 20 chiffres) et `MediaDiskPublicDocumentTest`
  (`{document}` et `{property}` trop longs).

## Critères d'acceptation

- [x] AC1 — `public/geo/cities/<19 ou 20 chiffres>` → 404.
- [x] AC2 — `public/properties/{id}/documents/<20 chiffres>/file` → 404 ; de même pour `{property}`
  de 19 et 20 chiffres.

## Notes d'implémentation

- Reproduction : les trois tests neufs rouges avant correctif (500).
- Ablation par route : `geo.php` de `pre-dev` → deux rouges ; `public.php` de `pre-dev` → un rouge ;
  remis → 11/11 et 7/7.
- Un identifiant de 19 chiffres sous la borne de `bigint` est désormais refusé par la route : aucune
  séquence du dépôt ne l'atteint.
