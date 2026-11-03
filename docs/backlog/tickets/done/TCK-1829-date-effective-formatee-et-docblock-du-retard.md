---
id: TCK-1829
title: "Date effective de résiliation formatée, et docblock du retard affiché réécrit"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-183--statuts-recalculés-par-le-navigateur-à-partir-des-dates"
tags: [front, leases, i18n, docs, pistes]
---

## Contexte

Réf : **P183.05** du fichier de pistes, `retenu · autonome` (A4 pour la date, A6 pour le
docblock).

- `EarlyTerminationBanner` passait la date effective brute à `banner_effective` : le lecteur lisait
  « Date effective : 2026-11-01 », alors que `useFormatteurs` était déjà chargé.
- Le docblock de `displayStatus` (`LeaseSchedule.tsx`) présentait le retard calculé au navigateur
  comme le rattrapage d'un marquage serveur à venir. Lu : le seul écrivain de `late` est
  `LateFeeCalculator` (l. 158), et seulement pour un bail à `late_fee_percent` positif, délai de
  grâce écoulé.

## Delta à produire

- [x] `EarlyTerminationBanner` : `fmt.date(...)` sur la date effective. Aucun texte neuf.
- [x] `LeaseSchedule.displayStatus` : docblock réécrit pour dire d'où vient le retard affiché.
      Aucun changement de comportement : la règle du jour d'échéance est P183.01, au porteur.
- [x] Test ajouté à `EarlyTerminationBanner.fuseau.test.tsx` : « Date effective : 1 nov. 2026 ».

## Critères d'acceptation

- [x] AC1 — Le bandeau affiche la date effective dans le format de la locale.

## Notes d'implémentation

- Ablation : date remise brute → le test neuf rougit (« Date effective : 2026-11-01 ») ; remise →
  5/5. Le docblock ne se garde pas par un test.
