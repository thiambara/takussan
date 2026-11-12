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

## Critères d'acceptation

- [ ] AC1 — « 99999-01-01 », « 0099-01-01 » et une valeur terminée par un octet nul rendent 422 sur chaque champ de la garde.
- [ ] AC2 — les formes ISO valides (avec `Z`, avec décalage, sans décalage) restent acceptées et converties comme TCK-2743.
- [ ] AC3 — la garde de TCK-2743 rougit sur un champ date-heure reçu sans la règle `instant`.
