---
id: TCK-1223
title: "`apiRequest` ne pose `Content-Type` que lorsqu'un corps part"
status: todo
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-103--appels-du-navigateur-à-lhydratation-des-pages-publiques"
tags: [front, perf, cors, pistes]
---

## Contexte

Réf : **P103.02** du fichier de pistes, `retenu · autonome` (A2 : supprime le préflight des
lectures anonymes sans changer aucune réponse). Entrée dans le lot de l'angle 79 par la famille :
elle cite le même fichier, `src/lib/api.ts`.

`apiRequest` pose `Content-Type: application/json` sur toute requête sans `formData`, `GET` sans
corps compris. Ce type n'est pas admis pour une requête CORS simple : chaque lecture du navigateur
par `useApiQuery` (référentiel public, autocomplétion) part précédée d'un `OPTIONS`.

## Objectif

Une lecture sans corps part sans `Content-Type`, donc sans préflight pour un visiteur anonyme.

## Contrat de données

Aucun : l'API ne lit pas le `Content-Type` d'une requête (mesuré par le mesureur, `grep` sur
`takussan-api/app` et `bootstrap`).

## Delta à produire

- [ ] `apiRequest` pose `Content-Type: application/json` seulement si `body !== undefined` et sans
      `formData`.
- [ ] Test vitest : un `GET` sans corps part sans `Content-Type` ; un `POST` à corps JSON le garde.

## Critères d'acceptation

- [ ] AC1 — Les en-têtes passés à `fetch` pour un `GET` sans corps n'ont pas de `Content-Type`.
- [ ] AC2 — Un `POST` à corps JSON garde `Content-Type: application/json`.

## Hors périmètre

- Le cache du préflight côté API (P103.01).

## Notes d'implémentation

_(à remplir par implementing-specs)_
