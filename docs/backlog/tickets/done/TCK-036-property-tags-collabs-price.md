---
id: TCK-036
title: "Property — Tags, collaborateurs & historique prix"
status: done
phase: P0
family: back
estimate: M
wave: 4
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-034]
blocks: [TCK-041]
spec_refs:
  features: [docs/features.md#11-gestion-des-biens]
  models:
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#10-tag
    - docs/models-spec.md#26-propertypricehistory-
tags: [back, property, tags, collaborators, pricing]
---

## Objectif utilisateur

Un agent peut catégoriser un bien avec des tags/amenités, inviter des collaborateurs avec part de commission, et l'historique des variations de prix est tracé automatiquement.

## Contrat de données

- Modèle `Tag` polymorphique (cf `models-spec.md#10`) + endpoint `POST /api/properties/{property}/tags` (attach/detach)
- Modèle `PropertyCollaborator` (cf `models-spec.md#8`) + endpoint `POST /api/properties/{property}/collaborators` (CRUD)
- Modèle `PropertyPriceHistory` (cf `models-spec.md#26`) — auto-enregistré via Observer sur `Property::updating`
- Endpoints à créer :
  - `POST /api/properties/{property}/tags` — associer des tags (sync)
  - `DELETE /api/properties/{property}/tags/{tag}` — détacher un tag
  - `POST /api/properties/{property}/collaborators` — ajouter un collaborateur
  - `PUT /api/properties/{property}/collaborators/{collaborator}` — modifier
  - `DELETE /api/properties/{property}/collaborators/{collaborator}` — retirer
  - `GET /api/properties/{property}/price-history` — consulter l'historique des prix
- Upload plans, vidéos, visites virtuelles (collections medialibrary `plans`, `videos`, `virtual_tours`)

## Contraintes strictes (métier)

- Somme des `commission_share` par bien ≤ 100% (validation API : 422 si dépassement)
- L'historique prix est immuable (pas d'édition/suppression)
- Un collaborateur ne peut pas être ajouté deux fois au même bien (unique sur `property_id` + `user_id`)
- Tags de type `amenity` uniquement sur les biens (validation sur `tag.type`)
- Compteurs de vues incrémentés via `DB::increment()` (pas via `save()`)

## Delta à produire

- [ ] Migration `property_price_histories` (colonnes cf models-spec.md#26)
- [ ] Modèle PropertyPriceHistory
- [ ] PropertyObserver : enregistre ancien prix sur `updating` si `price` a changé
- [ ] Endpoints tags (attach/detach/sync)
- [ ] Endpoints collaborateurs (CRUD + validation commission ≤ 100%)
- [ ] Endpoint historique prix (lecture seule)
- [ ] Upload plans, vidéos, visites virtuelles (collections medialibrary)
- [ ] Compteurs de vues et favoris (incrémentation via DB::increment)
- [ ] Tests : PropertyTagsTest, PropertyCollaboratorTest, PropertyPriceHistoryTest

## Critères d'acceptation

- [ ] Le changement de prix crée une entrée dans `property_price_histories`
- [ ] La somme des `commission_share` par bien ne dépasse pas 100% (422 si dépassement)
- [ ] Un collaborateur ne peut pas être ajouté deux fois au même bien
- [ ] L'historique des prix est consultable en lecture seule

## Hors périmètre

- Duplication de biens (→ P2)
- Modération avant publication (→ P2)
- Import CSV (→ P3)
