---
id: TCK-670
title: "Un montant n'est jamais refusé par le pas natif du champ : restitution de caution, bail, paiements, facture"
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
    - docs/features.md#15-transactions--paiements
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-8--parcours-sur-téléphone
tags: [front, forms, money, pistes]
---

## Contexte

Réfs : **P04.04** et **P08.03** du fichier de pistes, `validé` par le porteur (critère accordé :
V1). Même cause, même correctif, même décision : un seul ticket, comme le demande P08.03.

Les champs montant portaient `step={1000}` ou `step={100}` dans un `<form>` sans `noValidate`. Le
navigateur refuse alors l'envoi (`stepMismatch`) avant `onSubmit` : un loyer de 152 500, un
paiement de 12 350 ne partaient pas. La modale de restitution de caution (`min={0.01}
step={1000}`) ne validait que 0,01 + k×1000 : le montant pré-rempli d'une caution ronde, donc la
restitution intégrale, était impossible depuis l'écran.

## Décision du porteur

step="any" et min={1}, zod reste la seule borne

## Objectif

Aucun champ montant de ces écrans ne refuse un montant par son pas ; zod (et le serveur) restent
les seules bornes.

## Delta à produire

- [x] `DepositRefundModal` : `min={1} step="any"`.
- [x] `CreateLeaseForm` : `sale_price` et `monthly_rent` en `min={1} step="any"`,
      `deposit_amount` en `step="any"` (`min={0}` gardé).
- [x] `LeaseRenewalDialog` : loyer en `min={1} step="any"`, caution en `step="any"`.
- [x] `LeasePaymentDialog`, `BookingPaymentDialog` : `amount` en `min={1} step="any"`.
- [x] `CreateInvoiceDialog` : `unit_price` en `step="any"` (`min={0}` gardé).
- [x] Tests : `leases/__tests__/montants-hors-pas.test.tsx` (5), un cas dans
      `LeaseRenewalDialog.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Restitution d'une caution de 150 000 : le montant pré-rempli est valide et le clic
      sur « Confirmer le remboursement » appelle `POST /api/leases/{id}/deposit-refund`.
- [x] AC2 — Création de bail : un loyer de 152 500, une caution de 75 500 ou de 0 sont valides.
- [x] AC3 — Paiement de bail et de réservation : 12 350 est valide.
- [x] AC4 — Facture : un prix unitaire de 12 350 est valide.
- [x] AC5 — Renouvellement : un loyer de 152 500 et une caution de 305 000 sont valides.

## Hypothèses (mode sans humain)

- `min={1}` s'applique aux montants que zod veut **strictement positifs** (loyer, prix de vente,
  paiements, restitution). Sur les champs que zod admet à **0** (`deposit_amount` :
  `nonnegative`, `unit_price` : `nonnegative`), `min={0}` est gardé : y poser `min={1}` ferait
  du navigateur une seconde borne, plus stricte que zod, contre « zod reste la seule borne ».
- `LeaseRenewalDialog` n'est pas dans un `<form>` : son `step={1000}` ne bloquait pas l'envoi,
  il marquait seulement le champ invalide. Il est aligné parce que P04.04 le cite.

## Hors périmètre

- `CreateInvoiceDialog` : la quantité garde `step={1}` (zod l'admet décimale) et le taux de TVA
  `step={0.5}` : ce ne sont pas des montants, non cités par les pistes.
- P04.10 (borner la restitution à la caution encaissée) : autre correctif, `retenu · à valider`.

## Notes d'implémentation

- Rouge avant correctif : les 6 tests, tous sur `validity` (`stepMismatch`), y compris le montant
  pré-rempli de la restitution (150 000 avec `min=0.01 step=1000`).
- Ablation : les six composants remis à leur version d'avant → les mêmes 6 rouges ; correctif
  remis → 9 verts sur les deux fichiers.
