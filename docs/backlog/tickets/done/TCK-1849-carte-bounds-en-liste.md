---
id: TCK-1849
title: "La carte publique refuse par un 422 un `bounds` donné en liste"
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
tags: [back, public, carte, validation, pistes]
---

## Contexte

Réf : **P187.04** du fichier de pistes, `retenu · autonome` (A1). La règle `bounds` de
`MapPublicPropertyRequest` est `required`, `string`, puis une fermeture qui ouvre sur
`explode(',', (string) $value)`. Sans `bail`, Laravel joue la fermeture même quand `string` a
échoué : `GET /api/public/properties/map?bounds[]=1` rendait 500 « Array to string conversion ».

## Objectif utilisateur

Une URL de carte mal formée reçoit un 422 qui nomme `bounds`, et non une erreur serveur.

## Contrat de données

Aucun changement : la règle `string` refusait déjà un tableau ; le 422 qu'elle produit arrive
désormais seul.

## Delta à produire

- [x] `bail` en tête de la règle `bounds`.
- [x] Test à jeu de données dans `PropertyMapTest` : `bounds` en liste d'un, deux et quatre éléments.

## Critères d'acceptation

- [x] AC1 — `bounds[]=1`, `bounds[]=1&bounds[]=2`, `bounds[]=14&…&bounds[]=-17` → 422 sur `bounds`.

## Notes d'implémentation

- Reproduction : les trois cas rouges avant correctif, 500.
- Ablation : `bail` retiré → trois rouges ; remis → 23/23 dans `PropertyMapTest`, 13/13 dans
  `PropertyMapRadiusTest`.
