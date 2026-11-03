---
id: TCK-751
title: "HEIC refusé sur les photos d'état des lieux et l'avatar"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage"
tags: [back, media, validation, pistes]
---

## Contexte

Réf : **P10.06** du fichier de pistes, `validé` (critère accordé : V7). Sous Laravel 13, la règle
`image` accepte `heic` et `heif`, que GD ne décode pas (`imagecreatefromheif` absente). Une photo
d'état des lieux HEIC entre dans l'empreinte figée et manque en silence au PDF contractuel
(`PdfImageEmbedder` rend `null` hors jpeg, png, webp, gif) ; un avatar HEIC est servi brut, sans
miniature.

## Décision du porteur

HEIC refusé (mimes:jpg,jpeg,png,webp) sur l'état des lieux et l'avatar

## Objectif

Les deux règles n'acceptent plus que JPEG, PNG et WebP.

## Contrat de données

`POST /api/inventories/{inventory}/room-photos` et `PUT /api/auth/profile` : un fichier HEIC rend
422 (`photos.N`, `avatar`) au lieu de 200. Le front n'envoie déjà que jpeg, png et webp.

## Contraintes strictes

- `image` reste à côté de `mimes`, pour ne rien desserrer.

## Delta à produire

- [x] `UploadRoomPhotosInventoryRequest` et `UpdateProfileRequest` : `mimes:jpg,jpeg,png,webp`.
- [x] `Tests\Support\ImageEnTete::heic()` : un HEIC réduit à sa boîte `ftyp`, que finfo reconnaît.
- [x] Un cas dans `InventoryRoomPhotosTest` et un dans `AuthProfileTest`.

## Critères d'acceptation

- [x] AC1 — Une photo HEIC d'état des lieux rend 422 sur `photos.0`, aucun média ajouté.
- [x] AC2 — Un avatar HEIC rend 422 sur `avatar`, aucun média ajouté.
- [x] AC3 — Les envois JPEG existants restent verts.

## Hors périmètre

- Les autres règles `image` seules du dépôt, non citées par la piste.

## Notes d'implémentation

- Avant correctif : 2 rouges (200 au lieu de 422). Ablation : deux FormRequests d'avant remis →
  les 2 mêmes rouges ; remis → 34/34 verts.
- `UploadedFile::fake()->create('x.heic')` ne suffit pas : son contenu vide n'est pas `image/heic`
  pour finfo, et `image` le refuse déjà ; d'où le fichier réduit à son en-tête.
