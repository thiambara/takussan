---
id: TCK-1268
title: "Les filtres de statut des biens proposent les onze cas de l'API, les gestes restent à huit"
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
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-146--unions-de-statut-et-options-de-filtre-du-front-face-aux-enums-de-lapi"
tags: [front, properties, super-admin, pistes]
---

## Contexte

Réf : **P146.03** du fichier de pistes, `retenu · autonome` (A1, A6). Entrée dans le lot par
l'angle 146.

`PropertyStatus` a onze cas ; `propertyStatusValues` n'en porte que huit, sans `published`,
`pending_review` ni `rejected`, que l'API écrit. Les filtres de `/app/properties` et de la console
super-admin en dérivent : on ne peut pas lister les biens en revue ou refusés, et la puce d'un
`?status=pending_review` rend la valeur brute. La même liste sert aux gestes de changement de
statut, qui ne doivent pas offrir ces trois états. Le docblock de `PropertyStatusBadge` les dit, à
tort, hors de l'enum.

## Objectif utilisateur

Un agent, comme l'opérateur de la console, filtre ses biens sur tout statut que l'API pose.

## Contrat de données

Aucun changement d'API : `filter[status]` accepte déjà les onze valeurs.

## Delta à produire

- [x] Une liste de filtre distincte (`propertyStatusFilterValues`, onze cas) et ses options ; la
  liste des gestes (`propertyStatusValues`) inchangée.
- [x] Les deux filtres et la puce de filtre actif lisent la liste de filtre.
- [x] Docblock de `PropertyStatusBadge` corrigé ; son Set de statuts nommés lit la liste de filtre.
- [x] Test `lib/enums/__tests__/property-status-filtre.tck-1268.test.tsx`, qui lit l'enum PHP.

## Critères d'acceptation

- [x] AC1 — Les options du filtre sont exactement les cas de `PropertyStatus.php`.
- [x] AC2 — Chaque cas a son libellé `property.status` en `fr`, `en`, `wo` (déjà présents).
- [x] AC3 — La puce d'un `?status=pending_review` rend « En revue », jamais `pending_review`.
- [x] AC4 — Les gestes de changement de statut n'offrent ni `published`, ni `pending_review`, ni
  `rejected`.

## Hors périmètre

- Une garde de dépôt sur toutes les unions de statut (P146.04, au porteur).

## Notes d'implémentation

- `propertyStatusOptions` n'avait que les deux filtres pour appelants : renommé
  `propertyStatusFilterOptions`, sans alias.
- Ablation : les cinq fichiers sources rendus à `HEAD` → 3 rouges (options et liste absentes, puce
  brute) ; correctif remis → 4/4 verts, et `SuperAdminPropertiesFilters.test.tsx`,
  `PropertyListFilters.mobile.tck-644.test.tsx` verts.
