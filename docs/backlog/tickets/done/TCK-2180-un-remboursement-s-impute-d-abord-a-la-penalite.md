---
id: TCK-2180
title: "Un remboursement d'un checkout pénalité comprise s'impute d'abord à la pénalité"
status: done
phase: P2
family: back
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2174]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#7-un-remboursement-simpute-dabord-à-la-pénalité-p20604"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-206--pénalités-de-retard-réglées-face-aux-lecteurs-de-largent"
tags: [api, paiements, remboursement, reversements, pistes]
---

## Objectif

Un remboursement d'un checkout qui portait la pénalité de retard la rend d'abord, puis le loyer ;
la part rendue se trace et tous les lecteurs de l'argent la retranchent.

## Contexte

Réf : **P206.04** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : ADR-0039, amendement du 2026-10-24 : un remboursement s'impute d'abord à la pénalité, puis au loyer ; le plafond d'un remboursement devient loyer plus pénalité du checkout ; la part rendue de la pénalité est tracée par `lease_payments.late_fee_refund_amount` ; une pénalité rendue en entier est remise, ni acquittée ni due (`late_fee_paid_at` garde sa valeur) ; une pénalité reversée puis remboursée donne une reprise

- Un checkout de 157 500 (pénalité de 7 500 comprise) remboursé en entier donnait
  `refund_amount 150000`, `late_fee_paid_at` posé, et les 7 500 n'étaient tracés nulle part.

## Hypothèses (mode sans humain)

- « La pénalité du checkout » est celle que portait le checkout qui a soldé le loyer
  (`settled_by`, son entrée `late_fee_included` et `late_fee_amount`, à défaut la pénalité de
  l'échéance), et seulement si elle est acquittée. Sans elle, rien ne change.
- Le montant rapporté par le fournisseur reste lu comme le total remboursé (règle de TCK-873) ; il
  se répartit pénalité d'abord, à hauteur de la pénalité, le reste au loyer.
- Le `Payout` constaté porte le remboursement entier, pénalité comprise (point 7, « Constaté »).
- Lecteurs : la ligne de pénalité du reversement, l'*Encaissé*, les frais des métriques,
  `lateFeeSettledWith` (donc la clôture) et `refundedSinceClosing` retranchent la part rendue ;
  `LeasePaymentResource` la rend.
- `refundedSincePreparation` lit aussi la pénalité que porte le reversement (TCK-2174) : sans elle,
  un reversement à pénalité dont une pièce était remboursée en partie se refusait à tort en
  `payout.items_changed`, son brut de pièces restant sous `gross_amount`.

## Reste à faire

la reprise d'une pénalité reversée puis remboursée (ADR-0039, amendement du 2026-10-24, point 7, « Reprise »), qui suit la table `payout_clawbacks` de P205.01 (TCK-2151), pas encore fusionnée ; et l'affichage « remise » de la pénalité dans l'échéancier et la quittance du front, que `late_fee_refund_amount` rend possible

## Delta à produire

- [x] Migration neuve, en ajout seul : `lease_payments.late_fee_refund_amount`.
- [x] `PaymentGatewayService::applyRefund` : imputation pénalité d'abord, plafond loyer + pénalité.
- [x] Lecteurs : `PayoutCalculator`, `CollectedPayments::LATE_FEE_NET_SQL`,
  `PlatformMetricsSnapshotter::flowsBetween`, `PlatformPayoutService::lateFeeSettledWith`,
  `refundedSinceClosing`, `PayoutService::refundedSincePreparation`, `LeasePaymentResource`.

## Critères d'acceptation

- [x] AC1 — Remboursement de 157 500 : `refund_amount 150000`, `late_fee_refund_amount 7500`,
  `refunded`, `late_fee_paid_at` gardé, rien à recouvrer ; la ressource rend 7 500.
- [x] AC2 — Remboursement de 5 000 : tout à la pénalité, le loyer reste `paid` sans
  `refund_amount`. Remboursement de 10 000 : 7 500 à la pénalité, 2 500 au loyer.
- [x] AC3 — Après 5 000 rendus : Encaissé 152 500, frais 7 625, clôture `late_fees_gross 2500` et
  brut 152 500, ligne de pénalité du reversement à 2 500.
- [x] AC4 — Encaissé par l'intégration de l'agence : le constaté vaut 157 500.
- [x] AC5 — Un reversement à pénalité se paie malgré une pièce remboursée en partie avant la
  préparation ; une pénalité reversée puis rendue en partie le fait refuser (`items_changed`).

## Hors périmètre

- La reprise au bailleur (ci-dessus, reste) et l'écran.

## Notes d'implémentation

- Tests : `takussan-api/tests/Feature/Api/RemboursementPenaliteDAbordTest.php` (6 cas) ; la clé neuve entre dans `LeasePaymentResourceContractTest::KEYS` et le type front `LeasePayment`. Avant
  correctif : 4 rouges sur 4 (le cas AC5 a été ajouté avec le correctif de
  `refundedSincePreparation`).
- Ablation : imputation coupée → 5 rouges ; pénalité retirée de `refundedSincePreparation` → 1 rouge
  (AC5) ; part rendue non retranchée par `lateFeeSettledWith` → 1 rouge (AC3). Remis → 6 verts.
- Piège : la clôture sélectionne ses colonnes (`get([...])`) : `late_fee_refund_amount` doit y
  figurer, sans quoi la part rendue se lit nulle.
- Piège : un second événement de remboursement de la même transaction est dédupliqué ; les cas
  partiels se jouent donc sur des checkouts distincts.
