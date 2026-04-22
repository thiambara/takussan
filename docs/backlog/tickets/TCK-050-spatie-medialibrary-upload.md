---
id: TCK-050
title: "Spatie MediaLibrary + Upload Infrastructure"
status: done
phase: P0
family: back
estimate: S
created: 2026-04-16
updated: 2026-04-22
depends_on: [TCK-048]
blocks: [TCK-016, TCK-035]
spec_refs:
  features: [docs/features.md#27-médias--fichiers]
  models: []
tags: [back, infrastructure, spatie, medialibrary, upload, image]
---

## Objectif utilisateur

Tout modèle peut recevoir des fichiers uploadés avec conversions d'images automatiques et suppression sécurisée.

## Contrat de données

- `HasMedia` + `InteractsWithMedia` sur modèles concernés
- Collections : `photos`, `documents`, `avatars`
- Conversions : `thumbnail` (150x150), `preview` (400x400), `full` (1200xauto)
- `POST /api/media` (multipart) → `MediaResource`
- `DELETE /api/media/{id}`
- Validation : jpg/png/webp/pdf/docx, 10MB photos, 25MB documents

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Upload authentifié uniquement
- Un user ne peut supprimer que ses propres médias (ou admin)
- Conversions générées à l'upload (pas deferred)
- Fichiers stockés dans `storage/app/public/{collection}/`
- Nom de fichier sluggifié
- Médias orphelins nettoyés après 24h via scheduler

## Delta à produire

- [x] `composer require spatie/laravel-medialibrary`
- [x] Config + migration publiées
- [x] Trait `HasMediaConversions` avec conversions par défaut
- [x] `MediaController` (upload, delete), `MediaUploadRequest`, `MediaResource`, `MediaPolicy`
- [x] Route `POST /api/media`, `DELETE /api/media/{id}`
- [x] Command `media:cleanup`
- [x] Tests : `MediaUploadTest`, `MediaDeleteTest`, `MediaConversionTest`

## Critères d'acceptation

- [x] Fichier uploadé attaché au modèle avec conversions générées
- [x] Types non autorisés rejetés (422)
- [x] Fichiers trop gros rejetés
- [x] Suppression retire fichier du storage et DB
- [x] Conversions thumbnail/preview/full accessibles via URL

## Hors périmètre

- Upload multiple drag & drop (→ TCK-016 P1)
- Réorganisation drag & drop (→ TCK-016 P1)
- CDN / formats modernes (→ P2)

## Notes d'implémentation

- **Trait `HasMediaConversions`** (`app/Models/Concerns/`) définit les trois
  conversions standard (`thumbnail` 150×150 crop, `preview` 400×400 contain,
  `full` width 1200 auto-height) en `nonQueued()` pour respecter la contrainte
  « conversions à l'upload, pas deferred ». Les modèles consommateurs doivent
  toujours déclarer leur propre `registerMediaCollections()`.
- **Collision de trait sur `User`** : `InteractsWithMedia` déclare déjà un
  `registerMediaConversions()` vide, d'où un `insteadof` explicite :
  `HasMediaConversions::registerMediaConversions insteadof InteractsWithMedia`.
  Les autres modèles HasMedia qui adoptent le trait devront faire pareil s'ils
  n'ont pas déjà surchargé la méthode.
- **Collections `User`** : `avatar` (legacy singleFile) + `avatars`, `photos`,
  `documents` — ce dernier triplet suit la nomenclature `MediaUploadRequest`.
- **Policy** : `MediaPolicy` enregistrée explicitement via
  `Gate::policy(Media::class, MediaPolicy::class)` dans `AppServiceProvider`
  car `Spatie\MediaLibrary\MediaCollections\Models\Media` vit hors de
  `App\Models` et échappe à l'auto-discovery. Le `super_admin` passe via le
  `Gate::before` global. L'ownership se lit sur le morph target
  (`$media->model`) : user lui-même, `user_id` direct, ou fallback
  `agency_admin`/`admin` si `agency_id` matche.
- **Upload policy-check** : pour autoriser l'attachement, le contrôleur
  délègue à la `update` policy du target si une existe (e.g. future
  `PropertyPolicy`). En absence de policy, fallback « owner-only » sur
  `user_id` ou sur l'identité du user. Cela permet à TCK-034/035 de brancher
  leurs propres policies sans modifier `MediaController`.
- **Orphan definition** (`media:cleanup`) : media dont `model_type` n'est plus
  une classe chargeable, `model_id` null, ou target soft-deleted. Seuil 24 h
  par défaut (paramétrable via `--hours`). Scheduler quotidien 03:00 ajouté
  dans `routes/console.php`.
- **Cleanup tests** : test bonus `MediaCleanupTest` couvre les trois cas
  (orphan ancien supprimé, orphan récent conservé, media valide conservé).
- **Naming** : `MediaController::store` slugifie le `ClientOriginalName` via
  `Str::slug` puis concatène l'extension d'origine — pas de collision
  puisque le disk backend Spatie stocke chaque media dans un sous-dossier
  par id.
