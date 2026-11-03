---
id: TCK-1262
title: "Index des biens : réindexer le bien après l'écriture de son adresse, à la création comme à la modification"
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
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-122--écritures-qui-changent-un-document-indexé-sans-passer-par-lobservateur-scout"
tags: [api, recherche, meilisearch, adresses, pistes]
---

## Contexte

Réfs : **P122.01** et **P122.02** du fichier de pistes, `retenu · autonome` (A1). Même cause, même
correctif : un ticket.

`PropertyController::store` et `update` sauvent le bien, puis écrivent son adresse. L'observateur
de Scout indexe au `saved` du bien : sous `SCOUT_AFTER_COMMIT=false` (défaut de
`config/scout.php`, réglage de la suite), le document est écrit avant l'adresse, et rien ne le
réindexe ensuite. Un bien en ligne auquel on ajoute une adresse n'a ni ville ni `_geo` dans
l'index ; une adresse changée laisse l'ancienne ; un bien créé public est indexé sans adresse.

## Objectif

Le document d'un bien porte l'adresse écrite, quel que soit le réglage `after_commit`.

## Delta à produire

- [x] `store()` et `update()` : après la transaction, si le corps porte une adresse,
      `$property->load('address')->reindexer()`.
- [x] Test `AdresseDuBienDansLIndexTest` sous `InteractsWithMeilisearch`.

## Critères d'acceptation

- [x] AC1 — Bien public en ligne sans adresse, `PATCH` avec adresse → document `city` et `_geo`.
- [x] AC2 — Bien public à Dakar, `PATCH` vers Thiès → document `Thies`, `Randoulene`.
- [x] AC3 — `POST` d'un bien public avec adresse → document `Thies` et `_geo`.

## Hors périmètre

- Relever `SCOUT_AFTER_COMMIT` et `SCOUT_QUEUE` en préproduction (P122.02) : hors du poste.
- `crm:normalize-customer-phones` et l'index des clients (P122.03, à valider).

## Notes d'implémentation

- La réindexation se fait **après** la transaction, pas dedans : une écriture explicite dans
  l'index survit à l'annulation de sa transaction (P90.02).
- `reindexer()` suit déjà la coupure de la synchronisation (TCK-1101) et retire le document d'un
  bien qui n'est plus indexable.
- Ablation : `PropertyController.php` remis à `HEAD` → 3 rouges ; correctif remis → 3/3 verts.
  `AdresseSansVilleTest` et `PropertyCrudTest` verts.
