---
id: TCK-1135
title: "Le montant rendu d'une échéance de loyer dans sa ressource et dans l'export des paiements"
status: done
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-76--effets-aval-dun-paiement-soldé-puis-passé-à-refunded"
tags: [back, paiements, export, pistes]
---

## Contexte

Réf : **P76.06** du fichier de pistes, `validé (délégué)` (V7 accordé : champ en lecture seule
d'une colonne déjà écrite, annoncé par TCK-873 « Hors périmètre »).

`lease_payments.refund_amount` est écrit par TCK-873, mais `LeasePaymentResource` ne l'expose pas
(`BookingPaymentResource` le fait), et l'export des paiements d'`ExportDataService::payments()`
ne le porte pas : une échéance remboursée en partie s'exporte avec son seul montant facial.

## Décision du porteur (déléguée)

> validé (délégué) — ajouter `refund_amount` à `LeasePaymentResource`, sous la forme de `BookingPaymentResource` (`(float)` ou `null`), et une colonne `refund_amount` (la valeur en base, sans calcul ; pas de `net_amount`) en fin de colonnes de l'export des paiements d'`ExportDataService::payments()` ; test : une échéance remboursée en partie rend son `refund_amount` dans la ressource et dans l'export ; reste : l'affichage du montant rendu dans l'écran de l'historique, au porteur

## Reste à faire

- l'affichage du montant rendu dans l'écran de l'historique, au porteur

## Objectif utilisateur

Le montant rendu sur un loyer se lit dans l'API et dans l'export des paiements, sans calcul.

## Delta à produire

- [x] `refund_amount` dans `LeasePaymentResource` (`(float)` ou `null`).
- [x] Colonne `refund_amount` en fin de colonnes de l'export des paiements (sélection et ligne).
- [x] `LeasePaymentResourceContractTest` : la clé entre au contrat, et deux cas neufs.

## Critères d'acceptation

- [x] AC1 — une échéance au `refund_amount` de 40 000 rend `refund_amount: 40000` dans
      `GET /api/leases/{id}/payments`, et `40000.0` en dernière colonne de l'export.
- [x] AC2 — sans remboursement, `refund_amount` vaut `null` dans les deux.

## Hors périmètre

- `net_amount` (un montant calculé) : écarté par la décision.
- L'affichage dans l'écran de l'historique (« Reste à faire »).

## Notes d'implémentation

- Le type `LeasePayment` du front (`takussan-web/src/types/lease.ts`) n'est pas touché : la clé
  s'ajoute, rien ne la lit encore, et l'écran reste au porteur.
- Ablation : ressource et service rendus à `3c6c8301f` → 3 rouges (contrat des clés, cas
  remboursé, cas nul) ; correctif remis → 8/8.
