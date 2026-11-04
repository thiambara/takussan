---
id: TCK-1827
title: "Le compte à rebours d'une résiliation anticipée compte des jours calendaires"
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
tags: [front, leases, dates, pistes]
---

## Contexte

Réf : **P183.04** du fichier de pistes, `retenu · autonome` (A1).

`EarlyTerminationBanner.daysFromTodayTo` lisait la date effective `Y-m-d` à minuit UTC, puis la
ramenait à minuit **local** (`setHours(0, 0, 0, 0)`). Hors d'UTC, le compte perdait un jour : à
2026-10-31T15:00Z pour une date effective au 2026-11-01, New York et Tokyo comptaient 0, le
bandeau titrait « Fin aujourd'hui » et cachait le bouton d'annulation. L'API accepte pourtant
l'annulation tant que la date effective est postérieure au jour UTC
(`EarlyTerminationService.php:138-143`), et ADR-0018 dit qu'une date calendaire se compare
littéralement.

## Delta à produire

- [x] `daysFromTodayTo` : écart en jours entre la date du jour UTC (`Y-m-d`) et la date effective,
      toutes deux lues à minuit UTC.
- [x] `EarlyTerminationBanner.fuseau.test.tsx` : horloge figée, trois fuseaux (Dakar, New York,
      Tokyo) la veille UTC, et le jour UTC même.

## Critères d'acceptation

- [x] AC1 — La veille UTC de la date effective, le bandeau dit « Fin dans 1 jours » et montre
      « Annuler la résiliation », quel que soit le fuseau du navigateur.
- [x] AC2 — Le jour UTC de la date effective, il dit « Fin aujourd'hui », sans bouton.

## Hypothèse

- Le jour de référence est le jour **UTC**, celui de l'API (`config/app.php` en `UTC`), et non le
  jour local du navigateur : c'est la fenêtre que l'API accepte.

## Notes d'implémentation

- Ablation : l'ancienne fonction remise → New York et Tokyo rougissent (« Fin aujourd'hui ») ;
  remise → 4/4, et les deux autres fichiers du bandeau 5/5.
- Le changement de fuseau passe par `process.env.TZ` dans le test, que Node relit à chaque
  affectation ; `afterEach` le rend.
