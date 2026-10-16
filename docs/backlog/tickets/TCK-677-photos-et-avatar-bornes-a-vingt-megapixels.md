---
id: TCK-677
title: "Une photo de bien ou un avatar de plus de 20 Mpx est refusé sur son en-tête, avant tout décodage"
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
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
    - docs/models-spec.md#1-user
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage
tags: [back, media, photos, avatar, securite, pistes]
---

## Contexte

Réf : **P10.02** du fichier de pistes, `validé` par le porteur. Critère accordé : V7 (le choix du
plafond décide quelles images sont refusées).

La miniature des photos de bien (`Property::registerMediaConversions`) et des avatars
(`HasMediaConversions`, sur `User`) est synchrone (`nonQueued`) : GD décode l'image entière pendant
la requête d'envoi. Aucune règle ne bornait les dimensions (`grep -rn 'dimensions:' app/Http` vide).
Un PNG uni de 20 000 × 20 000 pèse quelques Ko, passe `max:10240`, et demande plusieurs Go au
décodage, hors de `memory_limit` (mesure du 2026-10-15 : GD alloue hors du gestionnaire de mémoire
de PHP).

## Décision du porteur

refus au-delà de 20 Mpx (getimagesize sans décoder)

## Objectif

`POST /api/properties/{id}/media` et `PUT /api/auth/profile` refusent en 422 une image dont
l'en-tête annonce plus de 20 000 000 pixels, sans la décoder et sans créer de média.

## Delta à produire

- [x] `app/Rules/PixelsAuPlus.php` : lit largeur et hauteur par `getimagesize()`, refuse au-delà de
      `MAXIMUM = 20_000_000` pixels, avec le message existant `validation.dimensions`. Un en-tête
      illisible est laissé à `image` et `mimes`.
- [x] `StorePropertyMediaRequest` : `photos.*` porte `new PixelsAuPlus`.
- [x] `UpdateProfileRequest` : `avatar` porte `new PixelsAuPlus`.
- [x] Tests : `tests/Unit/Rules/PixelsAuPlusTest.php` (6), `PropertyMediaTest` (1),
      `AuthProfileTest` (1), et `tests/Support/ImageEnTete.php`, qui fabrique un PNG ou un JPEG
      réduit à son en-tête.

## Critères d'acceptation

- [x] AC1 — Une image de 5 000 × 4 000 (20 Mpx tout juste), en PNG comme en JPEG, passe la règle.
      Une image de 5 000 × 4 001 est refusée.
- [x] AC2 — Un lot `[photo de 10 × 10, PNG annonçant 9 000 × 9 000]` envoyé à
      `POST /api/properties/{id}/media` rend 422 sur `photos.1` avec le message
      `validation.dimensions`, aucune erreur sur `photos.0`, et aucun média n'est créé.
- [x] AC3 — Un avatar PNG annonçant 9 000 × 9 000 envoyé à `PUT /api/auth/profile` rend 422 sur
      `avatar`, et aucun média `avatar` n'est créé.

## Hypothèses (mode sans humain)

- « au-delà de 20 Mpx » : strictement plus de 20 000 000 pixels (largeur × hauteur). 20 Mpx tout
  juste passe.
- Le refus reprend le message existant `validation.dimensions` (fr, wo, et l'anglais du
  framework) : aucun texte neuf.
- Le périmètre est celui du `Où` de la piste : les deux envois dont la miniature est synchrone.

## Hors périmètre

- Les photos d'intervention (`UploadPhotosMaintenanceRequestRequest`,
  `CompleteMaintenanceRequestRequest`, `ContestMaintenanceResolutionRequest`), d'état des lieux
  (`UploadRoomPhotosInventoryRequest`) et les envois génériques (`MediaUploadRequest`,
  `GenericMediaUploadRequest`) n'ont pas de borne de pixels. Leurs conversions, si elles en ont,
  n'ont pas été relues : un décodage en file tuerait le worker plutôt que la requête.
- Le comportement de l'écran devant ce 422 n'a pas été rejoué.
- Le ménage d'un média raté (P10.01) relève de TCK-676.

## Notes d'implémentation

- Rouge avant correctif : la photo de 9 000 × 9 000 passait la validation (l'échec venait ensuite
  de GD, en `photo_unprocessable`), et l'avatar rendait **500** (« Could not load image … gd-png:
  fatal libpng error »).
- Ablation : `new PixelsAuPlus` retiré des deux FormRequests → les deux tests Feature rouges ;
  `>` changé en `>=` dans la règle → « vingt megapixels tout juste passent » rouge. Correctif remis :
  verts.
- Les fichiers de test ne portent que leur en-tête : finfo les reconnaît (la règle `image` passe),
  `getimagesize()` les lit, GD ne peut pas les décoder. Le test n'alloue donc rien, et un décodage
  qui aurait lieu malgré la règle se verrait en échec.
