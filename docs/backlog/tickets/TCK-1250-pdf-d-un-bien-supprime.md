---
id: TCK-1250
title: "Quittance, contrat et état des lieux signé d'un bail dont le bien est supprimé : le PDF se rend au lieu d'un 500"
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
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-130--fiches-client-garant-et-bien-supprimées-en-douceur-et-encore-citées"
tags: [api, pdf, baux, suppression-douce, pistes]
---

## Contexte

Réf : **P130.02** du fichier de pistes, `validé (délégué)`.

Un bien sous bail se supprime (suppression douce). Ensuite la quittance, le contrat non figé et
l'état des lieux signé du bail rendent 500 : les trois gabarits lisent `$property->id` sur une
relation que la portée `SoftDeletes` rend nulle.

## Décision du porteur (déléguée)

« validé (délégué) — les trois gabarits lisent le bien supprimé : `loadMissing(['property' => fn ($q) => $q->withTrashed()])` dans `streamRentReceipt`, `leaseContract` et `InventoryController::downloadPdf`, et un test par document (quittance, contrat, état des lieux signé d'un bail dont le bien est supprimé → 200 PDF) ; reste : refuser la suppression d'un bien qui porte un bail `pending_signature` ou `active` (422), règle de produit neuve à trancher par le porteur avec P130.01 »

Critère accordé : V7.

## Reste à faire

refuser la suppression d'un bien qui porte un bail `pending_signature` ou `active` (422), règle de produit neuve à trancher par le porteur avec P130.01

## Objectif

Les trois documents d'un bail dont le bien est supprimé se rendent en PDF, bien compris.

## Delta à produire

- [x] `DocumentPdfController::streamRentReceipt` et `leaseContract`, `InventoryController::downloadPdf` :
      `loadMissing(['property' => fn ($q) => $q->withTrashed(), 'property.address', …])`.
- [x] Test `PdfDUnBienSupprimeTest` : un par document, en locataire.

## Critères d'acceptation

- [x] AC1 — Quittance d'une échéance payée d'un bail dont le bien est supprimé → 200 PDF.
- [x] AC2 — Contrat non figé du même bail → 200 PDF.
- [x] AC3 — État des lieux signé du même bail, en locataire → 200 PDF.

## Hors périmètre

- Le refus de suppression d'un bien loué (reste du porteur).
- L'état des lieux reste 403 à l'équipe après la suppression (`InventoryPolicy::view` passe par
  le bien) : aucune autorisation ne change.

## Notes d'implémentation

- Piège : `loadMissing` seul ne suffit pas pour la quittance et l'état des lieux. La policy a déjà
  lu `$lease->property` (ou `$inventory->property`), relation chargée à `null` sous la portée
  `SoftDeletes`, et `loadMissing` ne la relit pas. La relation nulle est retirée
  (`unsetRelation`) juste avant. Mesuré : avec le seul `loadMissing` de la décision, 2 rouges sur 3
  (quittance, état des lieux).
- Ablation : les deux contrôleurs remis à `HEAD` → 3 rouges (500 « Attempt to read property "id"
  on null ») ; correctif remis → 3/3 verts.
