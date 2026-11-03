---
id: TCK-725
title: "Quittance : un intitulé et une ligne de montant par type d'échéance"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-26--pdf--quittances-contrats-factures"
tags: [back, pdf, leases, receipts, pistes]
---

## Contexte

Réf : **P26.01** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`DocumentPdfController::receipt()` ne refuse que l'impayé et `deposit_refund`. Une échéance
`deposit`, `penalty`, `charges` ou `regularization` payée passe, et le gabarit unique
`pdf.receipts.rent` l'imprime en « Quittance de loyer », ligne « Loyer acquitté », mention
« atteste du règlement du loyer pour la période indiquée ». Le même rendu sert le lien de paiement
public (`PublicPaymentLinkController::receipt`, TCK-602).

## Décision du porteur

un intitulé et une ligne de montant par type (caution, pénalité, charges, loyer) ; pas de refus de la quittance hors loyer

Hypothèses (mode sans humain) :

- `regularization` est un type que la décision ne nomme pas ; « par type » l'inclut. Il reçoit son
  propre intitulé, « Reçu de régularisation de charges ».
- Hors loyer, le document est un « Reçu », et sa mention finale dit qu'il ne vaut pas quittance de
  loyer. Le loyer garde son texte mot pour mot.
- Le texte reste en français, comme le reste des actes (TCK-672, P06.03).

## Objectif utilisateur

Le locataire qui télécharge le justificatif d'une caution, d'une pénalité ou de charges payées
obtient un document qui dit ce qu'il a payé, et non un loyer.

## Contraintes strictes (métier)

- Aucun type payé n'est refusé de plus qu'aujourd'hui (`deposit_refund` reste refusé, TCK-594).
- Le texte d'une quittance de loyer ne change pas.

## Delta à produire

- [x] `DocumentPdfController::receiptWording()` : intitulé, badge, ligne de montant et mention par
  type, passés au gabarit par `streamRentReceipt()` (donc aussi au lien de paiement public).
- [x] `pdf.receipts.rent` : titre, ligne de montant et mention lus dans `$wording` ; repli sur le
  texte du loyer quand la vue est rendue sans lui.
- [x] Tests : `ReceiptPdfTest::test_le_recu_hors_loyer_dit_ce_qui_a_ete_paye` (quatre types),
  `::test_le_loyer_garde_sa_quittance`.

## Critères d'acceptation

- [x] AC1 — Une caution payée imprime « Reçu de dépôt de garantie » et « Dépôt de garantie versé ».
- [x] AC2 — Une pénalité payée imprime « Reçu de pénalité » et « Pénalité acquittée ».
- [x] AC3 — Des charges payées impriment « Reçu de charges » et « Charges acquittées » ; une
  régularisation, « Reçu de régularisation de charges » et « Régularisation acquittée ».
- [x] AC4 — Aucun de ces reçus ne contient « Quittance de loyer », « Loyer acquitté » ni
  « règlement du loyer ».
- [x] AC5 — Un loyer payé garde « Quittance de loyer », « Loyer acquitté » et sa mention.

## Hors périmètre

- Le nom du fichier téléchargé (`quittance-<réf>.pdf`) reste le même pour tous les types.
- La ligne « Période » reste affichée pour une caution ou une pénalité qui porte un `period_start`.
- Le libellé du bouton côté front (`CustomerPayments.tsx`) n'est pas touché.

## Notes d'implémentation

- Ablation : contrôleur et gabarit remis à `pre-dev`, les quatre cas hors loyer rougissent
  (« 4 failed, 8 passed ») ; correctif remis, 12 verts.
- Le repli `$wording ??=` du gabarit tient pour les tests qui rendent `pdf.receipts.rent`
  directement (`DocumentPdfServiceTest`, `CurrencyPdfRegressionTest`, `ActesPdfEnFrancaisTest`).
