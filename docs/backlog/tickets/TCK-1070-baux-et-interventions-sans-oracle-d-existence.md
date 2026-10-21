---
id: TCK-1070
title: "L'état des lieux, l'intervention et la conversation ne disent plus quels baux et quelles interventions existent (P62.04)"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#24-inventory-"
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#18-conversation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [back, authorization, inventories, maintenance, messaging, pistes]
---

## Objectif utilisateur

Un compte connecté qui n'a aucun droit sur une agence ne peut plus apprendre, en créant un état des
lieux, une demande d'intervention ou une conversation, qu'un bail ou une demande d'intervention de
cette agence existe.

## Contexte

Réf : **P62.04** du fichier de pistes (angle 62), `validé` par le porteur (critère V2 accordé).

Les quatre `authorize()` rendent `true` ou `user() !== null`, et `exists:leases,id` (état des lieux,
intervention, conversation directe et de groupe) et `exists:maintenance_requests,id` (groupe) se
jugeaient avant le refus. Mesuré avant correctif, compte sans agence, bail et demande d'une agence
tierce : un identifiant absent rend « The selected … is invalid » sur son champ, un identifiant
tiers passe la validation et reçoit le refus (403 pour l'état des lieux ; « You cannot link this
… to this item » pour les conversations).

## Décision du porteur

> (a) comme P62.01 : retirer `exists:` des champs que `guardContext()` juge, et juger le bail dans le contrôleur avec la réponse du refus (porteur, 2026-10-20)

Et, pour P62.01 à P62.07 : « juger l'existence dans le service avec la réponse du refus (modèle de
TCK-599) ; test : même statut et même corps pour un absent et un tiers ».

## Hypothèses (mode sans humain)

- **La réponse du refus de l'intervention est 403** (`abort_unless(... , 403)` de
  `MaintenanceRequestController::store()`). Le bail rattaché se juge par `can('view', $lease)` : la
  route ne jugeait aucun bail, et un bail d'une agence tierce se rattachait (201, mesuré par
  ablation). Le cas « bail visible, mais d'un autre bien » n'est pas jugé : hors de la décision.
- **Le `property_id` des conversations suit le même traitement** que leur `lease_id` : la décision
  vise « les champs que `guardContext()` juge », et il en est un. Cela couvre la partie
  conversation de P62.06.

## Contrat de données

Formes inchangées. `lease_id`, `property_id` et `maintenance_request_id` de ces routes deviennent
`integer` sans `exists:`.

## Delta à produire

- [x] `InventoryStoreRequest` : `lease_id` `['required', 'integer']` ; `InventoryController::store()` :
      bail absent → 403, comme un bail que l'appelant ne gère pas.
- [x] `StoreMaintenanceRequestRequest` : `lease_id` `['nullable', 'integer']` ;
      `MaintenanceRequestController::store()` : bail absent ou invisible → 403.
- [x] `StoreConversationRequest` et `CreateGroupConversationRequest` : `integer` sans `exists:` sur
      les champs que juge `guardContext()`.
- [x] `ExistsSurRouteOuverteTest` : trois exceptions retirées, `StoreMaintenanceRequestRequest` ne
      garde que P62.06.
- [x] Test : `tests/Feature/Api/LeaseContextExistenceOracleTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/inventories` : bail absent et bail tiers, même statut (403) et même corps ;
      sans corps complet, même 422.
- [x] AC2 — `POST /api/maintenance-requests` sur le bien de l'appelant : bail absent et bail tiers,
      même 403, aucune demande créée.
- [x] AC3 — conversation directe : bail absent et bail tiers, même 422 et même message
      `conversation_context_forbidden` ; `lease_id=abc` reste un 422.
- [x] AC4 — groupe : bail, demande d'intervention et bien absents ou tiers, même réponse
      `group_context_forbidden`.

## Hors périmètre

- P62.05 à P62.07 (autres routes de la même famille), dont `property_id` de l'intervention, de la
  visite et du calendrier.
- La cohérence bail/bien de l'intervention (un bail visible d'un autre bien de la même agence).

## Notes d'implémentation

- Ablation : correctif d'`app/` retiré → 5 rouges sur 5 ; remis → 5 verts. Ablation partielle :
  seul le contrôle du bail de `MaintenanceRequestController` retiré → un bail tiers se rattache
  (201 au lieu de 403).
- `integer` est gardé sur les conversations : sans lui, `guardContext()` enverrait `find('abc')`
  à PostgreSQL (erreur de type, 500).
