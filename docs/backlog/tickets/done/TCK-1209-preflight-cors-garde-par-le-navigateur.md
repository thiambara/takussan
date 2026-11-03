---
id: TCK-1209
title: "Le préflight CORS de l'API se garde deux heures côté navigateur (`max_age` à 7 200 s)"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-103--appels-du-navigateur-à-l-hydratation-des-pages-publiques"
tags: [back, api, cors, performance, pistes]
---

## Objectif utilisateur

Un appel non simple du navigateur vers l'API (tout appel connecté, qui porte `Authorization`) ne
paie plus un `OPTIONS` à chaque fois : le navigateur garde la réponse du préflight.

## Contexte

Réf : **P103.01** du fichier de pistes, `retenu · autonome` (A2 : performance sans changement de
résultat).

Mesuré avant correctif (`pre-dev` fbb8fc003, test de garde ci-dessous) : `OPTIONS
/api/public/geo/cities` avec `Origin` autorisée, `Access-Control-Request-Method: GET` et
`Access-Control-Request-Headers: accept-language,authorization,content-type` → 204,
`Access-Control-Max-Age: 0` (`config/cors.php:31`, `'max_age' => 0`).

## Hypothèses (mode sans humain)

- **La valeur : 7 200 s**, le plafond de Chrome (Firefox va jusqu'à 86 400 s) : au-delà, le
  principal navigateur n'en garde pas plus. La contrepartie est écrite dans `config/cors.php` : un
  changement de la configuration CORS (origine, en-têtes) met jusqu'à deux heures à atteindre un
  navigateur qui a déjà son préflight. La piste ne fixe pas de valeur ; aucun ADR ni document ne
  fixait le 0 (mesureur, 2026-10-21).
- P103.02 (le `Content-Type` posé sur tout GET par `apiRequest`, côté front) n'est pas traité ici.

## Delta à produire

- [x] `config/cors.php` : `max_age` à 7 200.
- [x] Test `tests/Feature/Http/PreflightCorsCacheTest.php`.

## Critères d'acceptation

- [x] AC1 — le préflight d'une route publique rend 204, l'origine autorisée, et un
  `Access-Control-Max-Age` strictement positif, au plus 7 200.

## Hors périmètre

- P103.02 (front).

## Notes d'implémentation

- Ablation : `config/cors.php` rendu à `fbb8fc003` → 1 rouge (`0 is greater than 0`) ; remis →
  vert. `CataloguePublicCacheTest` vert.
