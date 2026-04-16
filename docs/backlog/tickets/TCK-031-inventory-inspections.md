---
id: TCK-031
title: État des lieux & inventaires
status: todo
phase: P1
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-034, TCK-027]
blocks: []
spec_refs:
  features:
    - docs/features.md#19-état-des-lieux--inventaires
  models:
    - docs/models-spec.md#24-inventory-
tags: [back, front, inventory, inspection, checkin, checkout]
---

## Contexte

Le modèle `Inventory` est nouveau dans `models-spec.md`. Les états des lieux d'entrée et de sortie sont essentiels pour gérer les cautions et les litiges en fin de bail.

## Objectif

Implémenter la création et gestion d'inventaires d'entrée et de sortie avec photos par pièce et état par élément.

## Delta à produire

### P1

- [ ] Migration `inventories` : `property_id`, `lease_id`, `type` (check_in, check_out), `conducted_by_id`, `conducted_at`, `status`, `notes`, `items` (JSON : tableau de pièces avec éléments et état), medialibrary collection `photos`
- [ ] Endpoint `POST /api/inventories` — créer un inventaire d'entrée ou de sortie
- [ ] Endpoint `GET /api/inventories/{id}` — consulter un inventaire
- [ ] Endpoint `PUT /api/inventories/{id}` — éditer un inventaire (ajout photos, modification état)
- [ ] Endpoint `GET /api/properties/{property}/inventories` — liste des inventaires par bien
- [ ] Pages Next.js : création inventaire (formulaire dynamique par pièce), consultation, édition
- [ ] Tests : `InventoryCreationTest`, `InventoryEditTest`, `InventoryListTest`

### P2

- [ ] Signature des deux parties (locataire + bailleur) : champ `tenant_signature_at`, `landlord_signature_at`
- [ ] Export PDF de l'état des lieux (template Blade → PDF via dompdf/snappy)

### P3

- [ ] Comparaison automatique entrée ↔ sortie (diff sur `items` JSON)
- [ ] Reconnaissance IA de dégradations sur photos

## Critères d'acceptation

- [ ] Un agent peut créer un inventaire d'entrée avec photos par pièce
- [ ] Chaque élément d'une pièce a un état (bon, usé, endommagé, manquant)
- [ ] L'inventaire est éditable tant qu'il n'est pas signé
- [ ] La liste par bien affiche tous les inventaires avec type et date

## Hors périmètre

- Comparaison automatique entrée/sortie (→ P3 futur)
- Reconnaissance IA (→ P3 futur)

## Notes d'implémentation

_(à remplir par implementing-specs)_
