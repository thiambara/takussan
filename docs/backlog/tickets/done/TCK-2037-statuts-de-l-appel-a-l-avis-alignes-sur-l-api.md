---
id: TCK-2037
title: "Les fiches de bail et de réservation ouvrent l'appel à l'avis sur les statuts de l'API"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#11-review"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-201--gestes-à-usage-unique-jugés-par-une-lecture-déligibilité-faite-au-montage"
tags: [front, avis, bail, reservation, pistes]
---

## Objectif utilisateur

Le client voit l'appel à l'avis sur la fiche de son bail ou de sa réservation exactement pour les
statuts où l'API accepte l'avis du bien.

## Contexte

Réf : **P201.03** du fichier de pistes.

## Décision du porteur (déléguée)

> validé (délégué) — aligner `canBookingLeaveReview` et `canLeaseLeaveReview` sur `ReviewEligibility::BOOKING_STATUSES` (`confirmed`, `completed`) et `LEASE_STATUSES` (`active`, `terminating`, `terminated`, `expired`), corriger `reviewEligibility.test.ts` qui fige l'écart, et retirer le « Mirrors `ReviewController@storeForProperty` » inexact ; garde : un test par statut ; reste : le verdict porté par l'API ou l'appel renvoyé vers `/app/profile/reviews`, et l'appel masqué après l'avis

## Reste à faire

le verdict porté par l'API ou l'appel renvoyé vers `/app/profile/reviews`, et l'appel masqué après l'avis

## Delta à produire

- [x] `reviewEligibility.ts` : réservation `confirmed`/`completed`, bail
  `active`/`terminating`/`terminated`/`expired` ; le « Mirrors … » retiré, renvoi à
  `ReviewEligibility`.
- [x] `reviewEligibility.test.ts` : un test par statut de `BookingStatus` et de `LeaseStatus`.

## Critères d'acceptation

- [x] AC1 — réservation `confirmed` et bail `terminating` ouvrent l'appel ; bail `renewed` ne
  l'ouvre plus.
- [x] AC2 — tout autre statut garde son verdict.

## Hors périmètre

- Le reste de la décision, ci-dessus.

## Notes d'implémentation

- Ablation : prédicats remis → 3 rouges sur 15 (`confirmed`, `terminating`, `renewed`) ; rétablis →
  vert.
