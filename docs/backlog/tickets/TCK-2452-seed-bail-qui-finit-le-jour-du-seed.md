---
id: TCK-2452
title: "Seed : un bail qui finit le jour du seed est encore actif"
status: done
phase: P3
family: full
estimate: XS
wave: 80
created: 2026-10-31
updated: 2026-10-31
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [api, seed, tests, ci]
---

## Objectif utilisateur

La suite de l'API et `migrate:fresh --seed` passent quel que soit le jour où on les lance, dernier jour du mois compris.

## Contexte

Les baux semés par `LeaseSeeder` commencent le 1er et finissent le dernier jour d'un mois. Pour choisir le statut d'un
bail, le seeder comparait sa fin, à 00:00, à `Timeline::seedEnd()`, à 23:59:59. Le dernier jour d'un mois, un bail qui
finissait ce jour-là était donc tiré `expired` ou `renewed`.

`ReferentialIntegrityChecker` refuse un bail `expired` dont la fin n'est pas passée
(`bail_expire_dont_la_fin_est_a_venir`) : le seed s'arrête. Relevé le 2026-10-31 sur la PR #1620, sans rapport avec son
contenu : quatre tests de seed rouges, reproduits en local.

## Critères d'acceptation

- [x] Un bail dont la fin est le jour du seed n'est ni `expired` ni `renewed`.
- [x] Un test fige l'horloge au 2026-10-31 et sème : rouge sans le correctif (`bail_expire_dont_la_fin_est_a_venir : 1`).
