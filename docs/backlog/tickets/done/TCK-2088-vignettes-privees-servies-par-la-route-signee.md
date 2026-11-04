---
id: TCK-2088
title: "La route signée des fichiers privés sert une conversion nommée : les vignettes d'état des lieux et de maintenance ne chargent plus l'original"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  adr:
    - "docs/adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md#amendement-du-2026-10-23--la-route-signée-sert-aussi-une-conversion-nommée-p18002"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-180--images-téléversées-sans-borne-de-pixels-face-aux-décodages-gd-qui-les-suivent"
tags: [api, web, media, performance, pistes]
---

## Objectif utilisateur

Réf : **P180.02** du fichier de pistes (V7 accordé par le porteur).

Le téléphone d'un locataire ou d'un prestataire ne télécharge plus chaque photo d'état des lieux
(jusqu'à 5 Mo) ou de maintenance (jusqu'à 10 Mo) en entier pour une tuile d'une centaine de pixels :
la tuile affiche une conversion, le clic ouvre l'original.

## Décision du porteur

« validé — validation du porteur (2026-10-23) : ADR-0029, amendement du 2026-10-23 : `media.private.show` sert une conversion nommée dans l'URL signée, propre à la collection, en commençant par l'état des lieux (`preview`) ; `PixelsAuPlus` (20 Mpx) s'applique aussi aux photos de maintenance »

La décision et son application sont écrites dans ADR-0029, § « Amendement du 2026-10-23 ».

## Contrat de données

- `GET /api/media/{media}/file?conversion=<nom>` (signée) : sert la conversion au lieu de
  l'original ; 404 si elle n'est pas dans la liste de sa collection
  (`PrivateMediaAccess::SERVABLE_CONVERSIONS`) ou pas encore produite. Sans `conversion`, inchangé.
- `InventoryResource.room_photos[].photos[].preview_url` : URL signée de la `preview`, ou
  l'original tant qu'elle n'est pas produite. `url` reste l'original.
- `MaintenanceRequestResource.media.<collection>[].thumbnail_url` : URL signée de la `thumbnail`,
  ou l'original (devis, ou conversion pas encore produite). `url` reste l'original.

## Contraintes strictes (métier)

- Le nom de la conversion est couvert par la signature (ni ajouté à l'URL de l'original, ni changé).
- La même décision d'autorisation couvre conversion et original : l'URL n'est émise que par les
  ressources qui émettaient déjà celle de l'original.
- La conversion vit sur le disque privé et sort par `PrivateMediaAccess` (présignature 5 min ou flux).
- Les trois requêtes de photos de maintenance refusent en 422 une image de plus de 20 Mpx.

## Delta à produire

- [x] `PrivateMediaAccess` : liste des conversions servables, `signedUrl(…, conversion:)`,
  `signedConversionUrl()`, `servesConversion()`, `redirect()`/`stream()` sur la conversion.
- [x] `PrivateMediaController` : lit `conversion`, 404 hors liste ou non produite.
- [x] `MaintenanceRequest` : conversion `thumbnail` (400 px, JPEG 70, en file) sur `photos`,
  `before_photos`, `completion_photos`.
- [x] `InventoryResource` (`preview_url`) et `MaintenanceRequestResource` (`thumbnail_url`).
- [x] `PixelsAuPlus` sur `UploadPhotosMaintenanceRequestRequest`, `CompleteMaintenanceRequestRequest`,
  `ContestMaintenanceResolutionRequest`.
- [x] Commentaire de `MediaResource::conversionUrl()` (TCK-545) mis à jour.
- [x] Front : `InventoryDetail` affiche `preview_url` dans un lien vers l'original ;
  `MaintenanceGallery` affiche `thumbnail_url` (le lien vers l'original existait).

## Critères d'acceptation

- [x] AC1 — La route signée avec `conversion=preview` présigne le chemin de la conversion, en `image/jpeg`.
- [x] AC2 — Une conversion hors liste, même marquée produite, ou non produite : 404.
- [x] AC3 — Conversion ajoutée à l'URL de l'original, ou changée : 403.
- [x] AC4 — La ressource d'état des lieux rend `preview_url` distincte de `url`, et l'original tant
  que la `preview` est en file.
- [x] AC5 — Une photo de maintenance téléversée a sa `thumbnail`, servie par `thumbnail_url`.
- [x] AC6 — Un en-tête de 10 000 × 10 000 est refusé en 422 sur les trois routes de photos de maintenance.
- [x] AC7 — Les deux grilles du front affichent la conversion et ouvrent l'original au clic.

## Hors périmètre

- Produire la `thumbnail` des photos de maintenance déjà en base (aucune commande de rattrapage :
  la ressource retombe sur l'original pour elles).

## Hypothèses (mode sans humain)

- La vignette de maintenance fait 400 px de grand côté (`Fit::Max`), JPEG 70 % comme la `preview`
  de l'état des lieux : les tuiles de la galerie font une centaine à deux cents pixels.
- Le type MIME de la conversion se déduit de son extension (`MimeTypes`).

## Notes d'implémentation

- Classes jouées : `PrivateMediaConversionTest` 9 (neuve), `PrivateMediaAccessTest` 12,
  `InventoryRoomPhotosTest` 14, `MediaDiskCollectionsTest` 5, `MediaDiskPrivatePhotosTest` 7,
  `PdfImageConversionsTest` 2, `MaintenanceCompletionTest` 7, `MaintenanceResolutionConfirmationTest` 7,
  `MaintenanceRequestTest` 11, `MaintenancePrincipalFieldsTest` 9 — verts. Front :
  `vignettes-privees.tck-2088.test.tsx` 2, `InventoryDetail.pieces.test.tsx`, `MaintenanceDetail.test.tsx`.
- Ablations (API) : liste ignorée → 1 rouge (AC2) ; conversion non produite servie → 2 rouges ;
  contrôleur qui sert toujours l'original → 3 rouges ; `file()` qui ignore la conversion → 3 rouges ;
  `PixelsAuPlus` retiré de chacune des trois requêtes → 1 rouge chaque fois ; conversion de
  maintenance sur aucune collection → 1 rouge. Remis → 9 verts.
- Ablation (front) : `InventoryDetail.tsx` puis `MaintenanceGallery.tsx` remis à l'origine → 1 rouge chacun.
- Piège : le test « hors liste » passait aussi sans la liste tant que la `thumbnail` n'était pas
  produite (`hasGeneratedConversion` refusait seul) ; il marque désormais la conversion produite.
- Piège : `addMedia()->toMediaCollection()` rend l'instance d'avant la conversion en file ; la
  relire (`refresh()`) pour voir `generated_conversions`.
