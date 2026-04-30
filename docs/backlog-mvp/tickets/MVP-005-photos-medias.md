---
id: MVP-005
title: "Upload photos et infos de base"
status: todo
slice: "Weekend 3"
estimate: 1 weekend
created: 2026-04-16
depends_on: [MVP-004]
blocks: []
tags: [back, media, mvp]
---

## Objectif utilisateur

L'admin peut facilement ajouter des photos de qualité et optimiser les informations essentielles de chaque annonce.

## Contrat de données

- Upload : jusqu'à 10 photos par annonce
- Formats : JPEG, PNG, WebP
- Taille max : 5MB par photo
- Optimisation : auto-resize + compression
- Ordre : drag & drop pour réorganiser

## Contraintes strictes

- **Performance** : photos optimisées automatiquement
- **Mobile-first** : photos doivent être excellentes sur mobile
- **SEO** : alt tags automatiques
- **CDN ready** : structure pour futur Cloudflare

## Delta à produire

### Backend (Laravel)
- [ ] Installation Spatie MediaLibrary
- [ ] Configuration conversions (thumbnail, medium, large)
- [ ] Model `Property` avec `HasMedia`
- [ ] Upload endpoint : `POST /api/admin/properties/{id}/photos`
- [ ] Suppression photo : `DELETE /api/admin/photos/{id}`
- [ ] Réorganisation : `PUT /api/admin/properties/{id}/photos/order`

### Optimisation images
- [ ] Thumbnail : 300x300px (gallery)
- [ ] Medium : 800x600px (detail view)
- [ ] Large : 1200x900px (lightbox)
- [ ] WebP auto-conversion
- [ ] Watermark optionnel (logo Takussan)

### Frontend (Admin)
- [ ] Composant `PhotoUploader` (drag & drop)
- [ ] Gallery avec preview et suppression
- [ ] Progress bar pour uploads multiples
- [ ] Validation taille/format côté client

## Critères d'acceptation

- [ ] Upload de 10 photos fonctionne en < 30 secondes
- [ ] Photos sont automatiquement optimisées
- [ ] Ordre des photos peut être modifié par drag & drop
- [ ] Suppression photo met à jour l'annonce immédiatement

## KPI à tracker

- **Upload success rate** : objectif > 95%
- **Temps upload/annonce** : objectif < 2 minutes
- **Photo quality score** : taille moyenne < 200KB

## Structure de stockage

```
storage/
├── app/public/properties/
│   ├── {property_id}/
│   │   ├── thumbnails/
│   │   ├── medium/
│   │   └── large/
```

## Informations de base optimisées

- **Titre SEO** : auto-généré si absent
- **Description** : texte enrichi avec emojis supportés
- **Localisation** : autocomplete quartiers Dakar
- **Prix** : formatage automatique FCFA/XOF
- **Superficie** : support m² avec validation

## Hors périmètre

- Tours virtuels 360°
- Vidéos
- Plans d'étage
- Intégration API photos externes
- Face detection/cropping
