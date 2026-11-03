---
id: TCK-1014
title: "L'effacement dissocie les visites demandées par le compte"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-57--téléphones-et-e-mails-hors-de-users-face-à-lanonymisation"
tags: [api, rgpd, visits, pistes]
---

## Contexte

Réf : **P57.02** du fichier de pistes, `validé` (V3). Une visite demandée en étant connecté écrit
`visitor_id` = le compte et recopie son nom, son e-mail et son téléphone à défaut de saisie
(`PublicPropertyController`). `anonymize()` ne lit pas `property_visits`, et la FK `visitor_id`
en `nullOnDelete` ne joue pas sur un compte soft-deleted. Re-mesuré le 2026-10-19 sur `pre-dev`
5cd62d286 par le test ci-dessous, avant correctif : la visite désigne toujours le compte.

## Décision du porteur

> dissocier comme pour `customers` : `visitor_id` à `null`, le nom, l'e-mail et le téléphone de la visite gardés par l'agence ; un test : après `executeDeletion()`, la visite ne désigne plus le compte (porteur, 2026-10-19)

## Objectif

Après l'effacement, aucune visite ne désigne le compte ; son contact reste à l'agence.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` : `visitor_id` à `null` sur les visites du compte,
      à côté de la dissociation des fiches client.
- [x] `AccountDeletionExecuteTest::test_execute_dissocie_les_visites_du_compte`.

## Critères d'acceptation

- [x] AC1 — Après `executeDeletion()`, aucune visite n'a `visitor_id` = le compte.
- [x] AC2 — `visitor_name`, `visitor_email` et `visitor_phone` de la visite sont inchangés.
- [x] AC3 — La visite d'un autre compte garde son `visitor_id`.

## Hypothèses (mode sans humain)

- Une visite à venir dissociée se traite ensuite comme celle d'un visiteur sans compte (par son
  contact) : c'est la conséquence de la décision, non éprouvée ici.

## Hors périmètre

- Effacer le contact des visites : écarté par le porteur.

## Notes d'implémentation

- Avant correctif : 1 rouge (`1 is identical to 0`). Ablation : la ligne de dissociation retirée
  → 1 rouge, 9 verts ; remise → 10 verts.
