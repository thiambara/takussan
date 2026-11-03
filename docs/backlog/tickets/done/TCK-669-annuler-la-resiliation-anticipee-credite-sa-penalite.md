---
id: TCK-669
title: "Annuler une résiliation anticipée annule sa pénalité émise par un avoir"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  adr:
    - docs/adr/0039-les-sorties-d-argent.md#7-factures--numéro-à-lémission-unicité-par-agence-avoir
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements
tags: [back, money, invoice, lease, pistes]
---

## Contexte

Réf : **P04.03** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

La facture de pénalité d'une résiliation anticipée naît émise (`sent`) et numérotée `FA-…`
(TCK-090, TCK-594). `EarlyTerminationService::cancel()` la passait en `cancelled` par
`forceFill`, sans avoir : un numéro de facture émise disparaissait sans contrepassation, contre
ADR-0039 §7, que `InvoiceService::cancel()` applique partout ailleurs.

## Décision du porteur

`validé`, sans précision : l'option unique de la `Piste` — passer par `InvoiceService::cancel()`,
et asserter `credited_invoice_id`.

## Objectif

Annuler une résiliation anticipée annule sa pénalité émise par un avoir du même montant, numéroté.

## Delta à produire

- [x] `EarlyTerminationService::cancel()` délègue l'annulation de la pénalité à
      `InvoiceService::cancel()` (même transaction, verrou déjà pris).
- [x] Une pénalité déjà `cancelled` ou `void` (annulée à part depuis l'écran des factures) est
      laissée telle quelle : ni second avoir, ni 422 `invoice.cannot_cancel`.
- [x] Tests : `InvoiceNumberingTest` (avoir créé et numéroté), `EarlyTerminationServiceTest`
      (pénalité déjà annulée).

## Critères d'acceptation

- [x] AC1 — Pénalité émise `FA-2026-00001`, résiliation annulée : la pénalité est `cancelled` et
      garde son numéro ; un avoir unique (`credit_note`, `void`, même `total_amount`,
      `credited_invoice_id` = la pénalité) est numéroté `AV-2026-00001`.
- [x] AC2 — Pénalité déjà `cancelled` : l'annulation de la résiliation réussit, aucun avoir.
- [x] AC3 — Pénalité payée : toujours 422 (inchangé).

## Hypothèses (mode sans humain)

- Une pénalité déjà annulée ou neutralisée par une autre voie n'a pas à être recréditée : le
  geste d'annulation de la résiliation la laisse en l'état plutôt que d'échouer.

## Hors périmètre

- Aucun.

## Notes d'implémentation

- Ablation : sans la délégation, le test d'AC1 rougit (`ModelNotFoundException` : aucun avoir).
  Sans la condition « déjà annulée », celui d'AC2 rougit en `ApiError invoice.cannot_cancel`.
