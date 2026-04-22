---
id: TCK-035
title: "Property — Adresse & médias"
status: todo
phase: P0
family: back
estimate: S
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-034, TCK-050]
blocks: [TCK-040]
spec_refs:
  features: [docs/features.md#11-gestion-des-biens]
  models: [docs/models-spec.md#4-address, docs/models-spec.md#3-property]
tags: [back, property, address, media]
---

## Objectif utilisateur

Un agent peut associer une adresse géolocalisée et des photos à un bien immobilier.

## Contrat de données

- Modèle `Address` (polymorphique, cf `models-spec.md#4`)
- Endpoints à créer :
  - `POST /api/properties/{property}/address` — associer une adresse
  - `PUT /api/properties/{property}/address` — mettre à jour l'adresse
  - `DELETE /api/properties/{property}/address` — détacher l'adresse
  - `POST /api/properties/{property}/photos` — upload de photos (medialibrary collection `photos`)
  - `DELETE /api/properties/{property}/photos/{mediaId}` — supprimer une photo
  - `PUT /api/properties/{property}/photos/reorder` — réordonner les photos
- Conversions d'images : `thumbnail` (200x200), `preview` (800x600)

## Contraintes strictes (métier)

- Une seule adresse par bien (relation morphOne)
- Photos : max 20 par bien, types image uniquement (jpeg, png, webp), max 5MB chacune
- La première photo uploadée devient automatiquement la photo de couverture (`order_column = 1`)
- Un bien sans adresse ne peut pas passer en `visibility = published` (validé dans TCK-034)

## Delta à produire

- [ ] Migration `addresses` (colonnes cf models-spec.md#4)
- [ ] Modèle Address + relation polymorphique `addressable()`
- [ ] PropertyAddressController (attach/update/detach)
- [ ] Endpoints upload/suppression/réordonnancement photos
- [ ] MediaConversions sur Property (thumbnail, preview)
- [ ] Tests : PropertyAddressTest, PropertyPhotoUploadTest

## Critères d'acceptation

- [ ] Un agent peut associer une adresse géolocalisée à un bien
- [ ] Les photos uploadées génèrent les conversions thumbnail et preview
- [ ] La première photo est la photo de couverture
- [ ] La suppression d'une photo fonctionne et réordonne les suivantes

## Hors périmètre

- Plans, vidéos, visites virtuelles (→ P1, TCK-036)
- Carte interactive (→ TCK-039)
