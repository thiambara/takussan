---
id: TCK-1334
title: "Facture et quittance impriment le client, même supprimé depuis"
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
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-130--fiches-client-garant-et-bien-supprimées-en-douceur-et-encore-citées"
tags: [api, pdf, factures, baux, suppression-douce, pistes]
---

## Contexte

Réf : **P130.06** du fichier de pistes, `validé`.

La facture PDF d'un client supprimé (suppression douce) imprimait « — » à la place du nom, sans
e-mail ni téléphone ; la quittance d'un locataire supprimé, un nom vide.
`DocumentPdfController::invoice` et `streamRentReceipt` chargeaient `customer` et `tenant` sous la
portée `SoftDeletes`.

## Décision du porteur

« validé — porteur (2026-10-22) : lire le client et le bien `withTrashed()` dans les documents qui attestent un fait passé (facture, quittance) : le nom du client supprimé y est imprimé »

Critère accordé : V3.

## Objectif

La facture et la quittance impriment la fiche client que le fait passé désignait, même supprimée.

## Delta à produire

- [x] `DocumentPdfController::invoice` : `customer` lu `withTrashed()`.
- [x] `DocumentPdfController::streamRentReceipt` : `tenant` lu `withTrashed()` ; le bien l'était
      déjà (TCK-1250). La quittance du lien de paiement public passe par la même fonction.
- [x] Test `PdfDUnClientSupprimeTest`.

## Critères d'acceptation

- [x] AC1 — Facture d'un client supprimé, rendue à son émetteur : nom et e-mail du client imprimés.
- [x] AC2 — Quittance d'un locataire supprimé, rendue au bailleur : nom du locataire imprimé.

## Hors périmètre

- La facture n'imprime aucun bien (`pdf/invoices/default.blade.php` ne lit que le client) : le
  « bien » de la décision ne concerne que la quittance, déjà fait par TCK-1250.
- Les autorisations ne changent pas : un locataire dont la fiche est supprimée ne lit toujours ni
  son bail ni ses factures (P130.01, au porteur). `LeaseResource` rend toujours `tenant` à `null`.

## Notes d'implémentation

- Même piège que TCK-1250 : `InvoicePolicy::view` a déjà lu `$invoice->customer`, chargé à `null`
  sous la portée `SoftDeletes`, et `loadMissing` ne le relit pas. La relation nulle est retirée
  d'abord ; de même pour `tenant` dans la quittance.
- Le test lit le HTML du gabarit, capturé par `View::composer` (motif de `ReceiptPdfTest`) : le
  texte du PDF lui-même n'est pas extrait.
- Ablation : contrôleur remis à `HEAD` → 2 rouges (nom absent) ; correctif remis → 2/2 verts.
