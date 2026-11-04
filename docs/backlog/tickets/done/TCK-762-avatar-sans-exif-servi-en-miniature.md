---
id: TCK-762
title: "Avatar réencodé sans EXIF, et servi en miniature"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage"
tags: [back, media, rgpd, pistes]
---

## Contexte

Réf : **P10.05** du fichier de pistes, `validé` (critère accordé : V3). L'avatar vit sur le disque
public (ADR-0029 §3) et il était déposé tel quel par `addMediaFromRequest('avatar')`, puis servi
en original par huit endroits (`getFirstMediaUrl('avatar')`). Un selfie, ou un appel direct à
l'API, publiait sa position GPS par l'EXIF de l'original.

## Décision du porteur

avatar réencodé à l'upload (EXIF retiré), et la conversion servie au lieu de l'original

## Objectif

L'avatar déposé ne garde aucune métadonnée, et l'URL rendue est celle de la miniature.

## Contrat de données

`PUT /api/auth/profile` : même requête, même réponse. `avatar_url`, partout où il sort (profil,
conversations, biens, avis, comptes inclus, contacts de messagerie, fiche publique, agents
publics), vise la conversion `thumbnail` (150 × 150, produite à l'upload) au lieu de l'original, et
vaut `null` si elle n'a pas été produite.

## Contraintes strictes

- L'orientation EXIF est appliquée aux pixels avant d'être retirée : un selfie ne ressort pas couché.
- Le format reste celui du contenu (jpg, png, webp), deviné sur le fichier et non sur son nom.
- Jamais l'original en repli d'une miniature absente.

## Delta à produire

- [x] `App\Services\Media\AvatarReencode` : décodage et réencodage GD par `spatie/image`.
- [x] `AuthController::updateProfile` : l'avatar passe par lui avant `toMediaCollection('avatar')`.
- [x] `User::avatarUrl()` : la miniature produite, sinon `null` ; les huit appelants y passent.
- [x] Tests : `AuthProfileTest` (EXIF et orientation, URL de miniature),
      `Tests\Support\ImageEnTete::jpegAvecExif()`, garde `AvatarServiEnMiniatureTest`.

## Critères d'acceptation

- [x] AC1 — Un JPEG portant `GPSLatitudeRef` et `Orientation` est rangé sans EXIF, original et
      miniature, et l'orientation 6 a tourné les pixels (200 × 100 → 100 × 200).
- [x] AC2 — `avatar_url` est l'URL de la conversion `thumbnail`, pas celle de l'original.
- [x] AC3 — Aucun fichier de `app/` ne rend `getFirstMediaUrl('avatar')` ni `mediaUrl('avatar')`.

## Hypothèses (mode sans humain)

- « La conversion servie » : `thumbnail`, la seule synchrone et carrée ; `preview` part en file et
  n'existe pas encore à la sortie de l'upload.

## Hors périmètre

- Les avatars déjà déposés : leur original garde son EXIF sur le disque public. Il n'est plus servi,
  mais son URL reste lisible pour qui la connaît. Les réécrire est une réécriture de données (V4).
- `PublicAgencyController.php:320` et `PublicAgentController.php:290` lisent `$u->avatar_url`, un
  attribut qui n'existe pas sur `User` : ils rendent toujours `null`, avant comme après.
- La collection `avatars` (`POST /api/media`), que rien ne lit.

## Notes d'implémentation

- Avant correctif : 2 rouges (EXIF GPS lu sur l'original ; `avatar_url` = l'original).
- Ablation : contrôleur d'avant remis → le test EXIF rougit seul ; `UserResource` d'avant remis →
  le test d'URL rougit seul ; `MessagingContactResource` d'avant remis → la garde rougit ; remis →
  verts.
- `UploadedFile::fake()->image()` ne porte aucun EXIF : `ImageEnTete::jpegAvecExif()` insère un
  segment APP1 (IFD0 Orientation + IFD GPS) dans un vrai JPEG GD.
