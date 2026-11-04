---
id: TCK-1423
title: "Photos d'état des lieux et images de la médiathèque : refus au-delà de 20 Mpx"
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
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-143--pdf-à-contenu-variable-rendus-par-dompdf-dans-la-requête-http"
tags: [back, medias, pdf, pistes]
---

## Objectif utilisateur

Une photo d'état des lieux ou un logo d'agence trop grand en pixels est refusé à l'envoi, au lieu
de faire décoder l'original entier par GD à chaque PDF, hors de `memory_limit`.

## Contexte

Réf : **P143.02** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif (tests ci-dessous, rouges sur `9edd576f4`) : un en-tête JPEG de
10 000 × 10 000 (`Tests\Support\ImageEnTete`) est accepté par `POST
/api/inventories/{id}/room-photos` (200) et par `POST /api/media` en collection `logo` (201).

## Décision du porteur (déléguée)

> `new PixelsAuPlus` (20 Mpx, message existant `validation.dimensions`, décision de TCK-677) sur `photos.*` d'`UploadRoomPhotosInventoryRequest` et sur le fichier image de `MediaUploadRequest` (les collections hors `documents`), avec le test d'en-tête 10 000 × 10 000 (`Tests\Support\ImageEnTete`) sur ces deux routes ; reste : un plafond propre au logo plus bas que 20 Mpx, et la réduction au rendu (P143.03)

## Delta à produire

- [x] `new PixelsAuPlus` sur `photos.*` d'`UploadRoomPhotosInventoryRequest`.
- [x] `new PixelsAuPlus` sur `file` de `MediaUploadRequest` hors collection `documents`
  (`photos`, `avatars`, `logo`).
- [x] Tests : `InventoryRoomPhotosTest::test_a_photo_beyond_twenty_megapixels_is_refused`,
  `AgencyLogoUploadTest::test_an_image_beyond_twenty_megapixels_is_refused`.

## Critères d'acceptation

- [x] AC1 — Une photo d'état des lieux de 10 000 × 10 000 rend 422 `validation.dimensions` sur
  son index, et rien n'est rangé.
- [x] AC2 — Un logo de 10 000 × 10 000 rend 422 `validation.dimensions` sur `file` ; un logo de
  20 Mpx exactement passe la validation.
- [x] AC3 — Un document (`pdf`, `docx`) n'est pas jugé en pixels (la règle n'est posée que hors `documents` ; `MediaUploadTest`, envois de documents, vert).

## Reste à faire

> un plafond propre au logo plus bas que 20 Mpx, et la réduction au rendu (P143.03)

## Hors périmètre

- Les images déjà rangées au-delà de 20 Mpx restent : aucune réécriture de données.

## Notes d'implémentation

- Ablation : les deux FormRequests rendus à `9edd576f4` → 1 rouge dans chacune des deux classes
  (200 et 201 au lieu de 422) ; remis → 14 et 9 verts. `MediaUploadTest` reste vert (12).
