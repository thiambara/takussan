---
id: TCK-016
title: Médias & fichiers
status: todo
phase: P0
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-013, TCK-050]
blocks: [TCK-034, TCK-021]
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [back, front, media, upload, spatie]
---

## Contexte

Spatie/medialibrary est déjà référencé comme package transversal dans `models-spec.md`. Les fonctionnalités d'upload, conversions et gestion de fichiers sont nécessaires pour de nombreux domaines (biens, documents, profils).

## Objectif

Implémenter le système d'upload, de validation, de conversion et de gestion de fichiers basé sur spatie/medialibrary.

## Delta à produire

### P0 — MVP bloquant

- [ ] Configuration spatie/medialibrary : collections et conversions pour chaque modèle (cf. tableau `models-spec.md`)
- [ ] Endpoint générique `POST /api/media/upload` — upload avec validation type MIME et taille
- [ ] Conversions d'images automatiques : `thumbnail` (300×300), `preview` (800×600), `responsive`
- [ ] Endpoint `DELETE /api/media/{media}` — suppression sécurisée (vérification propriétaire)
- [ ] Tests : `MediaUploadTest`, `MediaConversionTest`, `MediaDeletionTest`

### P1

- [ ] Upload multiple avec support drag & drop côté React
- [ ] Réorganisation des médias par glisser-déposer (mise à jour `order_column`)
- [ ] Composant React : `MediaUploadComponent` réutilisable (drag & drop, preview, progression)
- [ ] Tests : `MediaMultiUploadTest`, `MediaReorderTest`

### P2

- [ ] Optimisation CDN et conversion vers formats modernes (webp, avif)
- [ ] Watermark automatique sur photos de biens (via conversions medialibrary)

### P3

- [ ] Streaming vidéo adaptatif

## Critères d'acceptation

- [ ] Un upload valide crée un média avec les conversions `thumbnail` et `preview`
- [ ] Un fichier excédant la taille maximale est rejeté avec un message clair
- [ ] Seul le propriétaire du média (ou un admin) peut le supprimer
- [ ] Le composant React affiche la progression d'upload et gère les erreurs

## Hors périmètre

- Upload spécifique aux biens (→ TCK-035)
- Upload de documents contractuels (→ TCK-021)

## Notes d'implémentation

_(à remplir par implementing-specs)_
