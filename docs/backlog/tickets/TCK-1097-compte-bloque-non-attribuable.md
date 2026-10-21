---
id: TCK-1097
title: "Tâche, référent, remplaçant et collaborateur refusent un compte bloqué"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-88--comptes-blocked--ce-quils-reçoivent-et-qui-les-propose-encore"
tags: [back, agence, crm, taches, pistes]
---

## Contexte

Réf : **P88.02** du fichier de pistes, `validé (délégué)` (critère accordé : V7, refuser ces
cibles change ce que l'admin d'agence peut faire).

Le blocage d'un compte ne touche pas ses profils d'agence : il reste « personnel actif » au sens
d'`isStaffAt()`. Quatre jugements de cible n'appelaient que lui, et confiaient tâches, clients,
remplacements et collaborations à un compte qui ne peut ouvrir aucune session (TCK-589).
`PersonnelDeLAgence::estPersonnel()` ajoute la joignabilité et se dit « LA définition du
personnel » pour l'attribution.

### Décision du porteur (déléguée)

> remplacer `isStaffAt()` par `PersonnelDeLAgence::estPersonnel()` dans les quatre jugements de cible : `TaskController::authorizeAssignee`, `SetPrimaryContactCustomerRequest` (le référent), `AgentAbsenceService::declare` (le remplaçant `substitute_id`) et le prédicat `$personnel` de `CollaboratorEligibleForProperty` ; les attributions existantes ne sont pas réécrites ; test : un cas « cible `blocked` → 422 » par chemin, et le témoin « cible `inactive` → accepté » ; reste : signaler aux admins, au blocage d'un compte, ce qui lui reste attribué ; le routage `routeToSubstitute` vers un remplaçant bloqué après la déclaration de l'absence ; `PropertyController::assignAgent`, que la Piste ne nomme pas

### Reste à faire

> signaler aux admins, au blocage d'un compte, ce qui lui reste attribué ; le routage `routeToSubstitute` vers un remplaçant bloqué après la déclaration de l'absence ; `PropertyController::assignAgent`, que la Piste ne nomme pas

## Objectif utilisateur

L'admin d'agence ne peut plus confier une tâche, un client, un remplacement ou un bien à un compte
bloqué.

## Contraintes strictes (métier)

- Les codes et messages d'erreur existants de chaque chemin sont gardés.
- Les attributions existantes ne sont pas réécrites.
- Dans `AgentAbsenceService::declare`, seul le remplaçant passe à `estPersonnel()` ; l'absent
  reste jugé par `isStaffAt()`.

## Delta à produire

- [x] `TaskController::authorizeAssignee`, `SetPrimaryContactCustomerRequest`,
      `AgentAbsenceService::declare` (`substitute_id`), `CollaboratorEligibleForProperty` :
      `PersonnelDeLAgence::estPersonnel()`.
- [x] Test `CompteBloqueNonAttribuableTest` : bloqué → 422 par chemin, inactif → accepté.

## Critères d'acceptation

- [x] AC1 — `POST /api/tasks` vers un bloqué → 422 `task.assignee_not_staff`.
- [x] AC2 — `POST /api/customers/{id}/primary-contact` → 422 sur `user_id`.
- [x] AC3 — `POST /api/agencies/{a}/absences`, bloqué en `substitute_id` → 422 sur `substitute_id`.
- [x] AC4 — `POST /api/properties/{p}/collaborators` (`agent`) → 422 sur `user_id`.
- [x] AC5 — un compte `inactive` reste accepté sur les quatre chemins (201, 200, 201, 201).

## Hors périmètre

- Le reste ci-dessus, gardé par le porteur.

## Notes d'implémentation

- Ablation, un fichier à la fois rendu à `HEAD` → exactement le cas bloqué de son chemin rougit
  (1 rouge sur 8 chaque fois) ; correctifs remis → 8/8.
