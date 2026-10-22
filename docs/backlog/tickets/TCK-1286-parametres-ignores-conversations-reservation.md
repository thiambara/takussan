---
id: TCK-1286
title: "Front : `useConversations` sans filtres que l'API ignore, `useBooking` sans `include=booking_payments`"
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
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-150--sort-filter-et-include-du-front-face-aux-listes-blanches-de-lapi"
tags: [web, queries, query-builder, code-mort, pistes]
---

## Contexte

Réf : **P150.05** du fichier de pistes, `retenu · autonome` (A3).

`useConversations` accepte `status` et `property_id`, envoyés en `filter[…]` ;
`ConversationController::index` n'en lit aucun (il lit `?archived=`) : un filtre « archivées » posé
demain rendrait les actives sans le dire. `useBooking` demande `include=…,booking_payments,…` ;
`BookingController::show` charge ses relations lui-même et `booking_payments` n'est pas une
relation. Aucun appelant ne passe ces filtres.

## Objectif

Les deux hooks ne portent plus de paramètre sans effet.

## Delta à produire

- [x] Retrait de `status` et `property_id` de `UseConversationsParams` et de leur `filter`.
- [x] Retrait de `booking_payments` de l'`include` de `useBooking`, avec un commentaire disant que
      `show` charge ses relations.
- [x] Test `parametres-ignores.tck-1286.test.ts`.

## Critères d'acceptation

- [x] AC1 — `tsc --noEmit` refuse `status` / `property_id` dans `UseConversationsParams` ; forcés,
      ils ne partent pas.
- [x] AC2 — `useBooking` ne demande plus `booking_payments`.

## Hors périmètre

- Brancher un filtre « archivées » sur `?archived=` (comportement neuf : option écartée par le
  classement du mesureur).
- Le relevé complet des paramètres ignorés (angle 186).

## Notes d'implémentation

- L'écran lit toujours `booking_payments`, qui sort de `BookingResource` sans `include`.
- Ablation : les deux modules remis à `HEAD` → vitest 2 rouges et `tsc --noEmit` 1 TS2578 ;
  correctif remis → verts. `ConversationList`, `useUnreadCount`, les quatre `BookingDetail.*`,
  `property-fields.coverage` et `coque-sans-modules-de-requetes-entiers` verts (41 tests).
