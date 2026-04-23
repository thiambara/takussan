---
id: TCK-071
title: "Médias — Upload multiple + reorder drag-drop"
status: todo
phase: P1
family: front
estimate: S
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-016, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#28-media
tags: [media, upload, reorder, front]
---

## Contexte

TCK-016 (médias & fichiers) est `review` : backend supporte upload, conversions, suppression sécurisée. Le composant `ImageUpload` côté frontend gère le single-file. L'audit frontend signale deux gaps P1 §2.7 : **upload multiple avec drag-drop** et **réorganisation des médias par glisser-déposer**. Les fiches biens, documents et profils utilisent tous l'upload — l'amélioration bénéficie à l'ensemble.

## Objectif utilisateur

Un agent doit pouvoir uploader plusieurs photos d'un bien en une seule opération (drag-drop de tout le dossier) et réorganiser l'ordre d'affichage par glisser-déposer sur la grille des miniatures.

## Contrat de données

Endpoints existants (TCK-016) :

- `POST /api/{entity}/{id}/media` — upload single ou multiple (multipart)
- `PATCH /api/{entity}/{id}/media/reorder` — body `{ media_ids: [id, id, id, ...] }` → nouvel ordre
- `DELETE /api/media/{id}` — suppression

Vérifier à l'implémentation que l'endpoint reorder existe bien pour properties/documents/etc. Si absent, ticket bascule en full-stack — ajouter endpoint côté back.

## Direction UX / Artistique

Inspiré Airbnb host / Unsplash upload. Zone de drop large avec feedback visuel net pendant le drag, multi-sélection de fichiers, barre de progression par fichier, thumbnails en grille sortable, action "Définir comme photo principale" (drag sur la 1re position).

## Contraintes strictes (métier)

- Validation côté client : types MIME (jpg, png, webp), taille max par fichier (5 Mo pour images, 50 Mo pour PDF/vidéo), nombre max par upload (20 fichiers).
- L'ordre est persisté immédiatement après drag-drop (pas de bouton "Sauvegarder").
- La première image de la liste est automatiquement la "cover" / photo principale.
- En cas d'erreur upload (422, 413, réseau), afficher par fichier sans bloquer les autres.

## Delta à produire

- [ ] Refactor `ImageUpload` (ou nouveau composant `MediaManager`) supportant multi-upload drag-drop
- [ ] Intégration de la bibliothèque sortable choisie par l'IA (pas de prescription — ex: `@dnd-kit/core`, `react-sortablejs`)
- [ ] Barre de progression par fichier en upload
- [ ] Réorganisation grille par drag-drop avec persist immédiat via PATCH reorder
- [ ] Remplacement/mise à jour dans les 3 lieux d'usage minimum : fiche bien, inventaires, documents
- [ ] Tests Vitest : rendu multi-upload, flow reorder (mock API), erreur validation MIME

## Critères d'acceptation

- [ ] AC1 — Drag-drop de 5 photos simultanées upload les 5 avec barres de progression individuelles
- [ ] AC2 — Une erreur sur un fichier (MIME non supporté) n'interrompt pas les autres uploads
- [ ] AC3 — Drag-drop d'une miniature à la position 1 persiste le nouvel ordre via PATCH reorder
- [ ] AC4 — La première photo affichée après reorder est utilisée comme cover dans la liste des biens
- [ ] AC5 — L'upload dépassant la taille max affiche un message clair sans envoyer la requête
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Watermark automatique sur photos de biens (P2)
- Optimisation CDN / formats modernes webp/avif (P2 — partiellement backend)
- Streaming vidéo adaptatif (P3)
- Édition d'image inline (crop, rotate) — non demandé par la spec

## Notes d'implémentation

_(Rempli à l'implémentation)_
