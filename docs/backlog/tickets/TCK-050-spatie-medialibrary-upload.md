---
id: TCK-050
title: "Spatie MediaLibrary + Upload Infrastructure"
status: todo
phase: P0
family: back
estimate: S
created: 2026-04-16
updated: 2026-04-16
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

- [ ] `composer require spatie/laravel-medialibrary`
- [ ] Config + migration publiées
- [ ] Trait `HasMediaConversions` avec conversions par défaut
- [ ] `MediaController` (upload, delete), `MediaUploadRequest`, `MediaResource`, `MediaPolicy`
- [ ] Route `POST /api/media`, `DELETE /api/media/{id}`
- [ ] Command `media:cleanup`
- [ ] Tests : `MediaUploadTest`, `MediaDeleteTest`, `MediaConversionTest`

## Critères d'acceptation

- [ ] Fichier uploadé attaché au modèle avec conversions générées
- [ ] Types non autorisés rejetés (422)
- [ ] Fichiers trop gros rejetés
- [ ] Suppression retire fichier du storage et DB
- [ ] Conversions thumbnail/preview/full accessibles via URL

## Hors périmètre

- Upload multiple drag & drop (→ TCK-016 P1)
- Réorganisation drag & drop (→ TCK-016 P1)
- CDN / formats modernes (→ P2)
