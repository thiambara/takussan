---
id: TCK-1231
title: "L'accueil ne redemande pas `discovery` quand la ville devinée est celle que le serveur a déjà servie"
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
tags: [front, perf, homepage, pistes]
---

## Contexte

Réf : **P103.06** du fichier de pistes, `retenu · autonome` (A1 : le docblock de
`useHomepageDiscovery` écrit déjà la règle, « la relance n'a lieu que lorsqu'il y a quelque chose
de neuf à demander »). Entrée dans le lot par la famille de l'angle 103.

Le rendu serveur demande `discovery` sans ville, et l'API sert sa ville de référence, Dakar. Pour
un visiteur deviné à Dakar, le crochet relance avec `near_city=Dakar` et reçoit les mêmes rangées.

## Objectif

Un visiteur deviné dans la ville que le serveur a déjà servie ne coûte aucun second appel.

## Contrat de données

Aucun.

## Delta à produire

- [ ] `useHomepageDiscovery` : au premier passage avec des rangées semées, pas de relance si la
      ville devinée, repliée par `toLocaleLowerCase()`, vaut `donneesInitiales.near.city` repliée.
- [ ] Test vitest : rangées semées pour `Dakar`, ville devinée `dakar` → aucun `fetch` ; ville
      devinée `Thiès` → une relance.

## Critères d'acceptation

- [ ] AC1 — Ville devinée égale, sans casse, à la ville semée : aucun appel.
- [ ] AC2 — Ville devinée différente : une relance, comme avant.

## Hors périmètre

- Le service `HomepageDiscoveryService` de l'API.

## Notes d'implémentation

_(à remplir par implementing-specs)_
