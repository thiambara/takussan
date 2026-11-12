---
id: TCK-2752
title: "Les dates-heures reçues refusent les formes que la règle `date` relit de travers — une règle `instant` ISO 8601 stricte"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2743]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
tags: [back, validation, dates, contrat-d-entree, suite-de-tck-2743]
---

## Objectif utilisateur

Une date-heure mal formée envoyée à l'API est refusée (422) au lieu d'être relue comme une autre date.

## Constat (TCK-2743, décision Q2 b du 2026-11-12)

La règle `date` de Laravel accepte des formes qu'elle relit de travers : « 99999-01-01 » (relue 2009-01-01),
« 0099-01-01 », une chaîne terminée par un octet nul. TCK-2743 convertit l'instant reçu sans changer le contrat
d'entrée ; ce ticket-ci, lui, le change.

## Delta

Une règle `instant` (ISO 8601 strict, années bornées), posée avec `date` sur chaque champ que liste la garde de
TCK-2743.

## À trancher avant le code

- L'espace à la place du `T` (« 2026-11-12 10:00 ») reste-t-il admis ? Recenser d'abord les clients qui l'envoient
  (front, seeders, tests). Le changement touche ≈ 14 routes.

- `offer_expires_at` (colonne `date`) et `expires_at` (instant) : une validité envoyée comme instant près de minuit
  (« …T00:30+01:00 ») range le 21 dans l'une et le 20 à 23:30 UTC dans l'autre (relevé de TCK-2743, lot 3). Le front
  envoie une date seule ; ce ticket tranche s'il faut refuser un instant sur `offer_expires_at` (`date_format:Y-m-d`).

## Critères d'acceptation

- [ ] AC1 — « 99999-01-01 », « 0099-01-01 » et une valeur terminée par un octet nul rendent 422 sur chaque champ de la garde.
- [ ] AC2 — les formes ISO valides (avec `Z`, avec décalage, sans décalage) restent acceptées et converties comme TCK-2743.
- [ ] AC3 — la garde de TCK-2743 rougit sur un champ date-heure reçu sans la règle `instant`.
