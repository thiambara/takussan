---
id: TCK-1760
title: "Le test du téléversement de média garde le contrat réel : la réponse ne promet que la vignette"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-156--variables-denvironnement-que-la-suite-le-développement-et-la-préproduction-posent-différemment"
tags: [api, medias, tests, file, pistes]
---

## Contexte

Réf : **P156.02** du fichier de pistes, `retenu · autonome` (A6).

`MediaConversionTest` gardait une réponse de `POST /api/media` où `preview` et `full` sont
produites : seule la file `sync` de la suite la rend. En développement et en préproduction
(`database`), seule `thumbnail` (`nonQueued`) est faite pendant la requête ; les deux autres
partent en file `media`. Le commentaire de `MediaController::store()` décrivait le même régime.

## Objectif

Le test et le commentaire disent ce que fait la route hors de la suite. Aucun comportement ne
change.

## Delta à produire

- [x] `MediaConversionTest::test_sous_une_file_reelle_la_reponse_ne_promet_que_la_vignette` :
  file `database`, la réponse porte `thumbnail` et `null` pour `preview` et `full`, un job en
  file `media`, puis le worker les produit.
- [x] Le test `sync` existant dit ce qu'il garde (la production des trois conversions), et non
  la réponse d'un serveur.
- [x] Le commentaire de `MediaController::store()` corrigé.

## Critères d'acceptation

- [x] AC1 — Sous `database`, la réponse ne promet que la vignette ; après le worker, `preview` et
  `full` existent.

## Notes d'implémentation

- Correctif documentaire (A6) : pas d'ablation de code. Le test neuf, joué sans ses deux lignes
  de configuration (donc sous `sync`), rougit sur `preview` non nul : il distingue bien les deux
  régimes.
- Si P156.01 passe la file `sync` à `after_commit`, le test `sync` existant est à revoir du même
  pas.
