---
id: TCK-2156
title: "Une facture ne se dresse que sur un objet facturable, et à son client ou son locataire"
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
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-200--gestes-dargent-sur-un-dossier-clos--réservation-fermée-facture-dun-objet-clos"
tags: [api, invoices, bookings, leases, pistes]
---

## Contexte

Réfs : **P200.03** et **P200.04** du fichier de pistes, `validé` par le porteur (critère V1
accordé), même ticket par sa décision. `InvoiceService::resolveInvoiceableTarget` ne lisait que
l'agence de l'objet facturé : une facture se créait (puis s'émettait) sur une réservation annulée,
refusée ou expirée, sur un bail en brouillon, et à un autre client que celui de la réservation.

## Décision du porteur

> validé — validation du porteur (2026-10-24) : refus 422 codé `invoice.target_not_billable` pour une réservation `cancelled`, `rejected` ou `expired` et pour un bail `draft` ou `pending_signature` ; un bail actif, terminé ou résilié et une réservation `pending`, `confirmed` ou `completed` restent facturables ; même ticket que P200.04

> validé — validation du porteur (2026-10-24) : le destinataire d'une facture est le `customer_id` de la réservation ou le `tenant_id` du bail, sinon 422 codé `invoice.recipient_mismatch` ; même ticket que P200.03

## Objectif

`POST /api/invoices` refuse un objet non facturable et un destinataire qui n'est pas celui de
l'objet.

## Hypothèses (mode sans humain)

- Les statuts de bail non cités (`expired`, `terminating`, `renewed`) restent facturables : seuls
  `draft` et `pending_signature` sont refusés.
- L'ordre des refus : objet d'une autre agence (`invoice.foreign_target`), puis statut, puis
  destinataire.
- Les créateurs internes (`EarlyTerminationService`, `DepositRefundService`) ne passent pas par
  `InvoiceService::create` : inchangés.
- Libellés des deux codes neufs en `fr` et `en` ; le `wo` porte le texte français (wolof en pause).

## Delta à produire

- [x] `InvoiceService::resolveInvoiceableTarget` : statut et destinataire jugés.
- [x] `lang/{fr,en,wo}/errors.php` : `invoice.target_not_billable`, `invoice.recipient_mismatch`.
- [x] `tests/Feature/Api/InvoiceTargetStatusAndRecipientTest.php` ; témoins de `InvoiceTest` et `InvoiceTargetScopeTest` alignés (client de la réservation, bail signé du locataire).

## Critères d'acceptation

- [x] AC1 — Réservation `cancelled`, `rejected`, `expired` → 422 `invoice.target_not_billable`, rien d'écrit.
- [x] AC2 — Bail `draft`, `pending_signature` → 422 `invoice.target_not_billable`, rien d'écrit.
- [x] AC3 — Réservation `pending`, `confirmed`, `completed` et bail `active`, `terminated`, `expired` → 201.
- [x] AC4 — Autre client que celui de la réservation, ou que le locataire du bail → 422 `invoice.recipient_mismatch`, rien d'écrit.
- [x] AC5 — Témoin : une facture sans objet est inchangée.

## Hors périmètre

- Une facture déjà créée sur un objet devenu non facturable (aucune reprise des données).

## Notes d'implémentation

- Ablation : garde de statut neutralisée → 2 rouges (AC1, AC2) ; garde de destinataire neutralisée → 2 rouges (AC4) ; remises → 6 verts.
- Deux témoins existants facturaient un objet à un client quelconque (`InvoiceTest::test_can_issue_invoice_for_booking`) ou un bail en brouillon d'un autre locataire (`InvoiceTargetScopeTest`) : ils rougissaient sous la décision, et sont alignés sur elle.
