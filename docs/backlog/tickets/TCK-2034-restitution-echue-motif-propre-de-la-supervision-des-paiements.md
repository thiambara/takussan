---
id: TCK-2034
title: "Supervision des paiements : une restitution de caution échue a son motif « restitution échue », jamais « en retard », et un bail supprimé ne compte plus"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-198--un-même-mot-compté-par-des-règles-différentes-d-un-écran-à-l-autre"
tags: [api, front, console, paiements, caution, pistes]
---

## Objectif utilisateur

Dans la console « Paiements », le super-administrateur ne voit plus sous « En retard » une
restitution de caution que la fiche du paiement dit à l'heure (c'est l'agence qui la doit, pas le
locataire). Une restitution échue et non versée reste visible, sous son propre motif « Restitution
échue », filtrable. Une échéance d'un bail supprimé n'apparaît sous aucun motif.

## Contexte

Réf : **P198.05** du fichier de pistes. `PaymentSupervisionService::lateLeasePayments` lisait
`LeasePayment::overdue()`, qui n'écarte pas les restitutions (`scopeOverdue`, partagé avec
`BookingPayment`), et `leaseBase` joignait `leases` sans `deleted_at IS NULL`.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : exclure les restitutions de caution de « en retard », et dans le même ticket un motif propre « restitution échue » ; ne joindre que les baux non supprimés

## Hypothèses (mode sans humain)

- L'exclusion se pose dans la supervision (`exceptDepositRefunds()`), pas dans `scopeOverdue`, que
  partage `BookingPayment` (relevé du délégué).
- « Restitution échue » suit la règle d'échéance de `LeasePayment::overdue()` (`late`, ou
  `pending`/`partially_paid` dont l'échéance est passée), datée par son échéance dans la période,
  comme « en retard ». Motif `refund_due` dans l'API, filtre `filter[status]=refund_due`.
- Les compteurs par fournisseur (`summary`) ne gagnent pas de colonne : une restitution n'a
  d'ordinaire pas de fournisseur, et la décision ne demande que le motif. Elle n'y est plus comptée
  « en retard ».
- Libellés : fr « Restitution échue », en « Deposit refund overdue », wo le français tel quel
  (wolof en pause).

## Delta à produire

- [x] API : `lateLeasePayments` écarte les restitutions ; `dueDepositRefunds` (motif `refund_due`) ;
  `leaseBase` ne joint que les baux non supprimés ; `IndexPaymentSupervisionRequest` accepte
  `refund_due`.
- [x] Front : option de filtre et libellé « Restitution échue », datée de l'échéance ; types.
- [x] Gardes : `PaymentSupervisionTest::test_p198_05_…`, `PaymentsConsole.test.tsx` (P198.05).

## Critères d'acceptation

- [x] AC1 — une restitution `pending` échue n'est ni listée ni comptée « en retard » ; elle est
  listée sous `refund_due` avec son échéance ; une restitution non échue n'y est pas.
- [x] AC2 — un loyer et une restitution échus d'un bail supprimé ne paraissent sous aucun motif.
- [x] AC3 — la console filtre par « Restitution échue » côté serveur et date la ligne de son échéance.

## Hors périmètre

- `scopeOverdue` lui-même, et les autres lecteurs des retards.

## Notes d'implémentation

- Reproduit sur `96d942893` : `late` comptait 4 lignes au lieu de 1 (restitution, loyer et
  restitution du bail supprimé).
- Ablation API : service et requête remis → rouge (`4 is identical to 1`) ; la seule jointure au
  bail non supprimé retirée → rouge (`2 is identical to 1`) ; rétabli → vert. Ablation front :
  `payments.tsx` remis → rouge (pas de bouton « Restitution échue ») ; rétabli → vert.
