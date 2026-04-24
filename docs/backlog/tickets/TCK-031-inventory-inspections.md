---
id: TCK-031
title: État des lieux & inventaires
status: done
phase: P1
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-22
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

### Schéma de colonnes (divergence ticket ↔ spec)

Le ticket listait `type` (check_in/check_out) et `items` (JSON). La spec **`models-spec.md` §24** (source de vérité) utilise :

- `type` → valeurs `move_in` / `move_out` (enum `InventoryType`)
- `items` → **colonne `rooms`** (JSON) — les noms divergent mais la sémantique est identique
- `conducted_by_id` → `conducted_by` (FK users, sans suffixe `_id`)
- `tenant_signature_at` / `landlord_signature_at` → `tenant_signed_at` / `owner_signed_at` (déjà implémentés — voir workflow submit → sign dans InventoryService)

Aucune migration additive nécessaire : le schéma existant couvre tous les besoins.

### Schéma JSON `rooms` (étendu)

Pour répondre au critère "chaque élément d'une pièce a un état (bon, usé, endommagé, manquant)", le schéma `rooms` accepte désormais un sous-tableau optionnel `elements` par pièce :

```json
[
  {
    "name": "Salon",
    "condition": "good",
    "notes": "optionnel",
    "elements": [
      {"label": "Canapé", "state": "bon"|"usé"|"endommagé"|"manquant", "notes": "optionnel"}
    ]
  }
]
```

Validé via `App\Http\Requests\InventoryStoreRequest` et `InventoryUpdateRequest` — règles imbriquées sur `rooms.*.elements.*.label` et `rooms.*.elements.*.state`. Les états autorisés sont exposés via la constante `InventoryStoreRequest::ELEMENT_STATES`.

Rétrocompatible : une pièce sans `elements` reste valide (comportement existant préservé).

### Endpoints livrés

- `POST /api/inventories` — contrôleur passe au FormRequest (`InventoryStoreRequest`)
- `PUT/PATCH /api/inventories/{id}` — idem via `InventoryUpdateRequest`; reste réservé aux inventaires `draft`
- `GET /api/properties/{property}/inventories` — liste par bien (spatie : filtres sur `type`, `status`, etc. ; tri défaut `-conducted_at`)
- Le reste (`show`, `submit`, `sign`, `dispute`, `uploadRoomPhotos`) inchangé.

### Signatures (P2 pré-livré)

Les colonnes `tenant_signed_at` / `owner_signed_at` et le workflow `POST /api/inventories/{id}/sign` étaient déjà livrés par un ticket antérieur. Rien à ajouter.

### Hors périmètre confirmé

- Export PDF (dompdf/snappy non installé) → P2 futur
- Comparaison auto entrée/sortie (diff rooms) → P3 futur
- Frontend Next.js → Vague 3

Voir PR feat/wave2-back-ops.
