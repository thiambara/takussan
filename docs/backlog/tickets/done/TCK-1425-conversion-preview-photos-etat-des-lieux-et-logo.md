---
id: TCK-1425
title: "Photos d'état des lieux et logo d'agence : une conversion `preview` en file, prise par le PDF avant l'original"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-143--pdf-à-contenu-variable-rendus-par-dompdf-dans-la-requête-http"
tags: [back, medias, pdf, performance, pistes]
---

## Objectif utilisateur

Télécharger le PDF d'un état des lieux ne relit plus ni ne réduit plus chaque photo d'origine, ni
le logo de l'agence : le coût de la réduction est payé une fois, en file, à l'envoi.

## Contexte

Réf : **P143.03** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif (garde ci-dessous, rouge sur `9edd576f4`) : un état des lieux signé à deux
photos, d'une agence à logo → `GET /api/inventories/{id}/pdf` réduit **3** originaux par GD
(`PdfImageEmbedder::reducedOriginal`) ; ni `Inventory` ni `Agency` ne déclarent de conversion.

## Décision du porteur (déléguée)

> une conversion `preview` en file sur `room_photos` d'`Inventory` et sur `logo` d'`Agency`, réduite comme aujourd'hui (`Fit::Max` 600 px, en PNG pour le logo afin de garder la transparence, TCK-1233), que `PdfImageEmbedder` prend déjà avant l'original ; la garde compte les appels à `reducedOriginal` pendant un téléchargement d'un état des lieux dont les conversions sont produites ; reste : ranger le PDF signé (lié à P140.02, au porteur) et un plafond du nombre de photos par pièce ou par état des lieux

## Hypothèses (mode sans humain)

- « Réduite comme aujourd'hui » : les photos à 600 px (`PdfImageEmbedder::MAX_WIDTH`), JPEG
  qualité 70 ; le logo à **320 px** et non 600, car c'est sa largeur de rendu aujourd'hui
  (`DocumentPdfService::LOGO_MAX_WIDTH`, TCK-1233). La parenthèse « 600 px » de la décision décrit
  la réduction des photos ; 320 garde le PDF identique, ce que la délégation visait (« même
  réduction, même PDF »).
- La conversion ne vaut que pour `room_photos` (pas `photos` d'`Inventory`) et `logo`.
- `reducedOriginal` passe de `private` à `protected`, pour que la garde compte ses appels.

## Delta à produire

- [x] `Inventory::registerMediaConversions()` : `preview` en file sur `room_photos`.
- [x] `Agency::registerMediaConversions()` : `preview` PNG en file sur `logo`.
- [x] `PdfImageEmbedder` : constante `MAX_WIDTH`, `reducedOriginal` protégée.
- [x] Test : `tests/Feature/Media/PdfImageConversionsTest.php`.

## Critères d'acceptation

- [x] AC1 — Les conversions produites, un téléchargement du PDF ne réduit aucun original.
- [x] AC2 — La `preview` d'une photo de 1 600 × 1 200 fait 600 × 450 en JPEG ; celle d'un logo de
  900 × 300 fait 320 × 107 en PNG ; une photo de la collection `photos` n'en a pas.

## Reste à faire

> ranger le PDF signé (lié à P140.02, au porteur) et un plafond du nombre de photos par pièce ou par état des lieux

## Hors périmètre

- Les photos et logos déjà rangés n'ont pas de `preview` : le PDF retombe pour eux sur l'original
  réduit, comme avant, jusqu'à une régénération des conversions (geste d'exploitation).

## Notes d'implémentation

- La garde remplace `PdfImageEmbedder` dans le conteneur par une sous-classe qui compte
  `reducedOriginal` : la méthode devait être `protected`, faute de quoi la sous-classe ne la
  surchargerait pas et la garde serait verte sans rien voir.
- Ablation : `Inventory.php` et `Agency.php` rendus à `9edd576f4` → 2 rouges (3 originaux
  réduits ; pas de `preview`) ; remis → 2 verts. Classes voisines vertes : `InventoryRoomPhotosTest`,
  `InventorySignatureTest`, `DocumentPdfDompdfRenderTest`, `AgencyLogoUploadTest`,
  `MediaDiskCollectionsTest`, `MediaDiskPrivatePhotosTest`, `ApplyWatermarkJobTest`,
  `RegenerateAgencyWatermarksJobTest`, `PublicAgencyLogoTest`, `AgencySetupStatusTest`,
  `MediaCleanupTest`, `InventoryTraceabilityHashTest`, `PdfDUnBienSupprimeTest`.
