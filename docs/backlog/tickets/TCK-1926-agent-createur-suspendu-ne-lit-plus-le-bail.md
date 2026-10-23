---
id: TCK-1926
title: "L'agent créateur d'un bien, suspendu ou retiré, ne lit plus le bail qui le désigne, ni en fiche ni en liste"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, leases, authorization, pistes]
---

## Contexte

Réf : **P190.04** du fichier de pistes, `validé` (V2 accordé). `LeaseService::create` recopie le
créateur du bien en `landlord_id` (P15.06) : sur un bien saisi par un agent, le bail le désigne.
`LeasePolicy::view` (`user.id === landlord_id`) et `LeaseController::index`
(`where('landlord_id', …)`) le lisaient tel quel : suspendu ou retiré, l'agent lisait le bail, le
voyait dans sa liste, et TCK-1711 ne lui faisait pas quitter le fil du bail. TCK-1722 n'avait fait
juger que les gestes par `BailleurDuBien`.

## Décision du porteur

la piste telle qu'écrite ; la dépendance à P15.06 est levée par la décision écrite dans `BailleurDuBien`

## Delta à produire

- [x] `LeasePolicy::view` : branche du bailleur par `BailleurDuBien::est($user, landlord_id, agency_id)`.
- [x] `LeaseController::index` : clause `landlord_id` restreinte de même (bail sans agence, ou profil propriétaire dans son agence).
- [x] Test `AgentCreateurLectureDuBailTest`.

## Critères d'acceptation

- [x] AC1 — Bail au `landlord_id` de l'agent créateur, agent suspendu → `GET /api/leases/{id}` 403, absent de `GET /api/leases`.
- [x] AC2 — Même bail, agent retiré → idem, et le fil `group` du bail est quitté (`ConversationAccess::allows` faux).
- [x] AC3 — Témoins : l'agent actif lit au titre du personnel ; le bailleur du bien et le bailleur particulier (bail sans agence) gardent fiche et liste.

## Hors périmètre

- Le sens de `landlord_id` lui-même (P15.06).
- Les autres entrées de l'angle 190 (états des lieux, réservations, paiements, documents, modération, bien).

## Notes d'implémentation

- Ablation : politique et contrôleur remis → 2 rouges sur 5 (suspendu et retiré lisent encore) ; remis → 5 verts.
- Le fil du bail est quitté sans toucher à `AgencyMemberRemovalService` : il juge déjà par `can('view', lease)`.
