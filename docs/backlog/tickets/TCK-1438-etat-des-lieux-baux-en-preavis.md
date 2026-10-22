---
id: TCK-1438
title: "Le choix du bail d'un état des lieux liste aussi les baux en préavis"
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
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-162--compteurs-et-sélecteurs--en-cours--écrits-par-une-liste-de-statuts-à-la-main"
tags: [web, inventory, leases, pistes]
---

## Contexte

Réf : **P162.05** du fichier de pistes, `retenu · autonome` (A1). `InventoryLeasePicker`, seul
chemin de l'équipe vers `/app/inventories/new`, ne demande que `filter[status]=active`. Un bail en
préavis (`terminating`), celui dont l'état des lieux de sortie approche, n'y figure pas, alors
que l'API accepte l'état des lieux sur tout bail que l'appelant peut modifier.

## Objectif

L'équipe ouvre l'état des lieux de sortie d'un bail en préavis depuis le sélecteur.

## Delta à produire

- [x] Le hook (renommé `useAllOngoingLeases`) demande `filter[status]=active,terminating`.
- [x] Le commentaire du sélecteur nomme les deux statuts.

## Critères d'acceptation

- [x] AC1 — Le sélecteur demande `active,terminating` au serveur, et liste le bail en préavis avec son lien `?lease=`.
- [x] AC2 — Les baux actifs restent listés, toutes pages (test TCK-1371 vert).

## Hors périmètre

- L'API, inchangée.

## Notes d'implémentation

- Hook renommé `useAllActiveLeases` → `useAllOngoingLeases` : son nom aurait menti ; seul appelant, le sélecteur.
- Ablation : filtre remis à `active` → le test neuf rougit (lien en préavis absent) ; remis → vert.
