---
id: TCK-019
title: Gestion des biens
status: todo
phase: P0
family: applicatif
estimate: XL
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-013, TCK-014, TCK-015, TCK-016]
blocks: [TCK-024, TCK-025, TCK-026, TCK-027, TCK-029, TCK-030, TCK-031, TCK-032, TCK-033]
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#10-tag
    - docs/models-spec.md#26-propertypricehistory-
tags: [back, front, property, crud, address, tags, media]
---

## Contexte

La gestion des biens est l'entité centrale de la plateforme. Le modèle `Property` existe déjà mais nécessite des enrichissements majeurs (référence unique, hiérarchie, historique de prix, titre foncier, collaborateurs avec commission). Ce ticket couvre le cycle de vie complet d'un bien.

## Objectif

Implémenter le CRUD complet des biens immobiliers avec adresse géolocalisée, médias, tags, collaborateurs, historique de prix et gestion du statut/visibilité.

## Delta à produire

### P0 — MVP bloquant

- [ ] Migration : ajout colonnes Property (`reference_number`, `bedrooms`, `bathrooms`, `furnished`, `floor_number`, `total_floors`, `year_built`, `parking_spaces`, `lot_position`, `title_type`, `admin_monitored`, `featured`, `views_count`, `favorites_count`, `available_from`, `published_at`)
- [ ] Génération automatique `reference_number` (format `TK-YYYY-NNN`)
- [ ] Endpoints CRUD : `GET/POST /api/properties`, `GET/PUT/DELETE /api/properties/{property}`
- [ ] Endpoint `POST /api/properties/{property}/address` — associer une adresse géolocalisée
- [ ] Endpoint `POST /api/properties/{property}/photos` — upload de photos (via medialibrary)
- [ ] Endpoint `PUT /api/properties/{property}/status` — changer le statut (available, reserved, sold, rented, archived)
- [ ] Endpoint `PUT /api/properties/{property}/visibility` — publier / dépublier
- [ ] Soft delete sur `DELETE /api/properties/{property}`
- [ ] Pages Angular : liste des biens, création, édition, fiche détaillée
- [ ] Tests : `PropertyCrudTest`, `PropertyAddressTest`, `PropertyPhotoUploadTest`, `PropertyStatusTest`, `PropertyReferenceNumberTest`

### P1

- [ ] Upload plans, vidéos et visites virtuelles 360° (collections medialibrary `plans`, `videos`, `virtual_tours`)
- [ ] Endpoint `POST /api/properties/{property}/tags` — associer tags / amenités
- [ ] Migration : `PropertyPriceHistory` — historique de prix automatique à chaque changement
- [ ] Observer `PropertyObserver` : enregistrer l'ancien prix dans `property_price_histories` sur `updating`
- [ ] Endpoint `POST /api/properties/{property}/collaborators` — ajouter collaborateurs avec `commission_share` et permissions
- [ ] Hiérarchie de biens (`parent_id`) : immeuble → étages → lots
- [ ] Colonne `title_type` (TitleType enum : bail, titre_foncier, deliberation, autre)
- [ ] Compteurs de vues et de favoris (incrémentation via `DB::increment()`)
- [ ] Tests : `PropertyTagsTest`, `PropertyPriceHistoryTest`, `PropertyCollaboratorTest`, `PropertyHierarchyTest`

### P2

- [ ] Endpoint `POST /api/properties/{property}/duplicate` — duplication (template)
- [ ] Endpoint `POST /api/properties/moderation` — modération avant publication (admin/super_admin)
- [ ] Endpoint `POST /api/properties/bulk-archive` — archivage en lot

### P3

- [ ] Marquage suivi administratif (`admin_monitored`)
- [ ] Import CSV / API externe (MLS, syndication)
- [ ] Estimation automatique de prix (IA / comparables)

## Critères d'acceptation

- [ ] Un agent peut créer un bien avec tous les champs requis et une adresse géolocalisée
- [ ] La référence unique est générée automatiquement au format `TK-YYYY-NNN`
- [ ] Les photos uploadées génèrent les conversions `thumbnail` et `preview`
- [ ] Le changement de prix crée une entrée dans `property_price_histories`
- [ ] La hiérarchie parent/enfant fonctionne (immeuble → lots)
- [ ] La somme des `commission_share` par bien ne dépasse pas 100%
- [ ] La suppression est un soft delete

## Hors périmètre

- Recherche publique et filtres (→ TCK-024, TCK-025)
- Favoris utilisateur (→ TCK-025)
- Réservations (→ TCK-026)
- Baux (→ TCK-027)

## Notes d'implémentation

_(à remplir par implementing-specs)_
