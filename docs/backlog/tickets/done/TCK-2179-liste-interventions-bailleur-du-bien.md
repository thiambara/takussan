---
id: TCK-2179
title: "La liste des interventions juge le créateur du bien comme view"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-217--clauses-de-périmètre-des-listes-écrites-à-la-main-face-à-la-policy-view"
tags: [api, maintenance, messagerie, autorisation, pistes]
---

## Objectif

`MaintenanceRequest::scopeVisibleTo` ne rend plus à l'agent qui a saisi un bien, suspendu ou
retiré, les interventions de ce bien que `view` lui refuse ; leurs fils sortent de
`GET /api/conversations` par le même scope.

## Contexte

Réfs : **P217.01** et **P217.02** du fichier de pistes, `validé` (V2 accordé).

La clause du bien du scope admettait `properties.user_id = $user->id` sans autre condition, quand
`MaintenanceRequestPolicy::isPrincipalFor` juge le créateur par `BailleurDuBien::est` (TCK-1720).
Le scope sert `index`, `indexForProperty` et `ConversationAccess::constrainListing`.

## Décision du porteur

P217.01 : validé — validation du porteur (2026-10-24) : la clause du bien de la liste des interventions passe par `BailleurDuBien::restreindre`, comme TCK-1928 et TCK-1930 ; ferme aussi P217.02, même ticket

P217.02 : validé — validation du porteur (2026-10-24) : fermée par le correctif de P217.01, même ticket, avec un test dédié (fil absent de `GET /api/conversations`, témoin bailleur présent)

## Hypothèses (mode sans humain)

- Le bailleur du bien bloqué garde la liste, comme `view` (voie étroite de `BailleurDuBien`, sans
  condition de statut).

## Delta à produire

- [x] `scopeVisibleTo` : la clause du bien par `BailleurDuBien::restreindre($p, $user)`.
- [x] `AgentCreateurListeDesInterventionsTest` : suspendu, retiré, témoins agent actif et
  bailleur bloqué, sur la liste des interventions et celle des fils.

## Critères d'acceptation

- [x] AC1 — l'agent créateur suspendu, puis retiré : l'intervention absente de
  `GET /api/maintenance-requests`, son fil absent de `GET /api/conversations`.
- [x] AC2 — l'agent actif et le bailleur du bien (bloqué compris) gardent l'une et l'autre.

## Hors périmètre

- Les autres lecteurs de l'angle 217 (P217.03, P217.04 : tickets propres ; P217.05 non pris).

## Notes d'implémentation

- Avant correctif : les deux cas rendent l'intervention et le fil (2 rouges).
- Ablation : la clause remise à `where('user_id', …)` → 2 rouges ; remise → 4 verts.
