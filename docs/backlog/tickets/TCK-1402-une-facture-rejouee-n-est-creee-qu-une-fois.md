---
id: TCK-1402
title: "Une facture rejouée sous la même clé n'est créée qu'une fois"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1396]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-144--écritures-du-navigateur-quune-réponse-perdue-invite-à-rejouer"
  adr:
    - "docs/adr/0072-une-cle-d-idempotence-commune-pour-les-ecritures-rejouees.md"
tags: [api, web, invoices, idempotence, pistes]
---

## Contexte

Réf : **P144.05** du fichier de pistes, `validé` par le porteur. Deux `POST /api/invoices` identiques créaient deux brouillons de numéros distincts (le mesureur a établi qu'ils sont `draft`, sans numéro légal) ; `CreateInvoiceDialog` garde sa saisie après une erreur.

## Décision du porteur

> validé — porteur (2026-10-22) : ADR-0072, lot 2 : la clé sur `POST /api/invoices`

## Objectif

La facture renvoyée après une réponse perdue rend le premier brouillon au lieu d'en créer un second.

## Delta à produire

- [x] `invoices.store` porte `idempotent`, ajoutée à `IdempotentRoutesTest`.
- [x] `useCreateInvoice` passe `idempotence: true`.
- [x] Tests : `tests/Feature/Idempotence/FactureRejoueeTest.php`, `src/lib/queries/__tests__/payments.idempotence.tck-1402.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Deux envois de la même facture sous la même clé, à 30 s d'écart : une facture, le même `id` rendu.
- [x] AC2 — Le hook demande l'option.

## Hors périmètre

- L'annulation d'un brouillon en double déjà créé : rien ne change pour ceux d'avant.

## Notes d'implémentation

- Ablation : route sans `idempotent` → `FactureRejoueeTest` rouge (2 factures) et `IdempotentRoutesTest` rouge ; option retirée du hook → 1 rouge vitest ; remis → verts.
