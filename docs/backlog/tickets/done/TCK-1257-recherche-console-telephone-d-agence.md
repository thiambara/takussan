---
id: TCK-1257
title: "Recherche globale de la console : une agence se retrouve par son téléphone tel que le formulaire l'enregistre"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-125--téléphones-écrits-sans-normalisation-et-leurs-lecteurs"
tags: [api, console, recherche, telephone, pistes]
---

## Contexte

Réf : **P125.01** du fichier de pistes, `retenu · autonome` (A1).

`AdminGlobalSearchService::byPhone()` ramène la saisie à l'E.164, puis compare par égalité stricte
`agencies.phone`, que les trois voies d'écriture enregistrent tel que saisi (`+221 77 123 45 67`,
`77 123 45 68`). Une agence n'est retrouvée que si son numéro a été saisi en E.164.
`docs/features.md` § 2.9 promet la recherche par téléphone (TCK-600).

## Objectif

Une agence se retrouve par son téléphone, quelle que soit la forme sous laquelle il a été saisi.

## Delta à produire

- [x] `byPhone()` compare `CanonicalPhone::sql('phone') = CanonicalPhone::fold($phone)` pour les
      agences, comme l'entrée par téléphone (`PhoneLoginService`). Les comptes gardent l'égalité
      stricte : `users.phone` est en E.164.

## Critères d'acceptation

- [x] AC1 — Trois agences `+221 77 123 45 67`, `77 123 45 68`, `+221771234569` : chacune est
      retrouvée par sa forme espacée, nationale ou E.164.
- [x] AC2 — `AdminGlobalSearchTest` reste vert.

## Hypothèses

- La seconde option de la Piste (normaliser `agencies.phone` à l'écriture et rattraper les lignes)
  touche les données (V4) : elle n'est pas faite.
- Aucun index ne porte l'expression sur `agencies.phone` : la requête parcourt la table, de petite
  taille (une ligne par agence).

## Notes d'implémentation

- Ablation : `byPhone()` remis à `where('phone', $phone)` → le test neuf rougit dès la forme espacée ;
  remis → vert.
