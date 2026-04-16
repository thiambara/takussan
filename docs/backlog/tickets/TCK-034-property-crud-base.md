---
id: TCK-034
title: "Property — Modèle & CRUD base"
status: todo
phase: P0
family: back
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-013, TCK-014, TCK-015, TCK-016, TCK-048, TCK-051]
blocks: [TCK-035, TCK-036, TCK-024]
spec_refs:
  features: [docs/features.md#11-gestion-des-biens]
  models: [docs/models-spec.md#3-property]
tags: [back, property, crud, migration]
---

## Objectif utilisateur

Un agent peut créer, lire, modifier et supprimer un bien immobilier avec ses caractéristiques de base.

## Contrat de données

- Modèle `Property` (cf `models-spec.md#3`) — toutes les colonnes P0
- Endpoints à créer :
  - `GET /api/properties` — liste (scopé par agence via Policy)
  - `POST /api/properties` — création
  - `GET /api/properties/{property}` — détail
  - `PUT /api/properties/{property}` — mise à jour
  - `DELETE /api/properties/{property}` — soft delete
  - `PUT /api/properties/{property}/status` — changement de statut
  - `PUT /api/properties/{property}/visibility` — publier / dépublier
- Génération automatique `reference_number` format `TK-YYYY-NNN`

## Contraintes strictes (métier)

- Un bien sans adresse ne peut pas être publié (validation API : 422 si `visibility = published` et `address` absent)
- Soft delete obligatoire (pas de suppression physique)
- `reference_number` est immuable après génération
- Seuls les rôles `agent`, `agency_admin`, `super_admin` peuvent créer/modifier
- Un agent ne voit que les biens de son agence ; `agency_admin`/`super_admin` voient tout
- Statuts valides : `available`, `reserved`, `sold`, `rented`, `archived`
- Visibilités valides : `private`, `public`

## Delta à produire

- [ ] Migration : ajout colonnes Property P0 (`reference_number`, `bedrooms`, `bathrooms`, `furnished`, `floor_number`, `total_floors`, `year_built`, `parking_spaces`, `lot_position`, `title_type`, `admin_monitored`, `featured`, `views_count`, `favorites_count`, `available_from`, `published_at`, `parent_property_id`) — `parent_property_id` nullable pour hiérarchie immeuble→lots
- [ ] Modèle Property + enums PropertyType, PropertyStatus, PropertyVisibility, ContractType, Currency
- [ ] PropertyController CRUD + status + visibility
- [ ] FormRequests : StorePropertyRequest, UpdatePropertyRequest, UpdatePropertyStatusRequest, UpdatePropertyVisibilityRequest
- [ ] Génération auto reference_number (Observer ou dans le contrôleur)
- [ ] Policy PropertyPolicy (création/édition par agent de l'agence, admin, super_admin)
- [ ] Tests : PropertyCrudTest, PropertyStatusTest, PropertyReferenceNumberTest, PropertyPolicyTest

## Critères d'acceptation

- [ ] Un agent peut créer un bien avec tous les champs P0
- [ ] La référence unique est générée automatiquement au format `TK-YYYY-NNN`
- [ ] La suppression est un soft delete
- [ ] Un bien sans adresse ne peut pas être publié (422)
- [ ] Un agent d'une agence A ne peut pas modifier un bien de l'agence B

### P1

- [ ] Hiérarchie de biens : `GET /api/properties/{property}/children` — liste des lots/enfants d'un immeuble ; `parent_property_id` nullable sur Property ; un bien parent de type `building` peut avoir N enfants de type `apartment`/`commercial`/`lot`
- [ ] Tests : `PropertyHierarchyTest`

### P2

- [ ] Archivage en lot : `POST /api/properties/bulk-archive` — archiver plusieurs biens en une requête (tableau d'IDs, validation ownership)
- [ ] Tests : `PropertyBulkArchiveTest`

## Hors périmètre

- Adresse géolocalisée (→ TCK-035)
- Tags, collaborateurs, historique de prix (→ TCK-036)
- Recherche et filtres (→ TCK-024)
- Pages frontend (→ TCK-038, TCK-039, TCK-040, TCK-041)
- Duplication de biens (→ P2 futur)
- Modération avant publication (→ P2 futur)
- Import CSV / API externe (→ P3 futur)
- Estimation automatique de prix IA (→ P3 futur)
