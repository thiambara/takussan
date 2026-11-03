---
id: TCK-1524
title: "Un crédit confirmé sur une facture envoyée ou en retard la solde"
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
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-crédit-confirmé-sur-une-facture-envoyée-ne-la-solde-pas--elle-reste-relancée-et-sannule-par-avoir-avec-sa-ligne-toujours-rapprochée"
tags: [api, invoices, reconciliation, pistes]
---

## Contexte

Réf : **P110.03** du fichier de pistes, `validé`. La confirmation d'un crédit sur une facture
`sent` ou `overdue` n'écrivait que `bank_reconciled_at` et `bank_statement_line_id` : la facture
restait `sent`, était relancée au jalon suivant (puis passée `overdue`), et s'annulait par avoir
avec sa ligne toujours `confirmed`.

## Décision du porteur

validé — porteur (2026-10-22) : un crédit confirmé sur une facture `sent` ou `overdue` vaut règlement : `markPaid` dans la transaction de `confirmMatch`

## Objectif utilisateur

Une facture dont le règlement est rapproché d'un crédit du relevé est payée : ni relancée, ni
annulable.

## Contrat de données

`POST /api/bank-statement-lines/{line}/match` sur une facture `sent` ou `overdue` la passe `paid`
(et lui attribue son numéro si besoin, comme `InvoiceService::markPaid`). Une facture déjà `paid`
se rapproche sans changer.

## Contraintes strictes (métier)

- Le règlement passe par `InvoiceService::markPaid`, seul chemin de « payée » (numéro,
  `settled_by` manuel), appelé dans la transaction de la confirmation : un refus défait les deux.
- L'activité `matched` (TCK-828) garde le statut lu à la confirmation, avant le règlement.

## Delta à produire

- [x] `ReconciliationManager::confirmMatch` : `markPaid` d'une facture `sent`/`overdue`, dans la
  transaction, après l'écriture du rapprochement.
- [x] `ReconciledInvoiceSettlementTest`.

## Critères d'acceptation

- [x] AC1 — facture `sent` de 170 000 rapprochée d'un crédit de 170 000 : `paid`, rapprochée.
- [x] AC2 — relance au 2026-07-13 (échéance 2026-07-10) : aucune, `reminders_sent_count = 0`.
- [x] AC3 — `InvoiceService::cancel` refuse ensuite (422), la facture reste `paid`.
- [x] AC4 — une facture `overdue` est soldée de même ; une facture `paid` se rapproche sans changer.

## Hors périmètre

- Délier (`unmatch`) une facture soldée par son rapprochement la laisse `paid` : rien ne
  défait le règlement. Non tranché par la décision, à reprendre au besoin.
- Le geste de rapprochement solde la facture sous l'autorisation du rapprochement, et non sous
  celle de `markPaid` (`InvoicePolicy`) : c'est l'effet de la décision du porteur, signalé ici.

## Notes d'implémentation

- Piège : `markPaid` rafraîchit l'instance passée ; l'activité `matched` lisait alors `paid`, et
  `ReconciliationConfirmationAuditTest` (« une facture journalise son statut ») a rougi. Le
  statut est capturé dans la transaction, avant le règlement.
- Ablation : appel à `markPaid` retiré → AC1 et AC4 (`overdue`) rouges ; remis → 3/3.
