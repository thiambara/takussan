---
id: TCK-2666
title: "Couvrir une absence, côté API : l'absence peut porter une délégation de rôle liée"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2668]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#66-roledelegation-"
tags: [back, team, absences, adr-0035, audit-ux, app]
---

## Objectif utilisateur

Quand un agent part en congé, l'admin dit en un seul geste qui reprend ses nouvelles demandes et, s'il le faut, qui peut agir à sa place pendant ce temps.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- Absences et délégations partagent la table `role_delegations` (`RoleDelegation`) : une absence est une ligne à `replaces_user_id` non nul et `role = absence_cover` ; elle **n'accorde aucun droit** (ADR-0035). Routes : `GET|POST|DELETE /api/agencies/{a}/absences`, `GET|POST|DELETE /api/agencies/{a}/role-delegations`.
- **Aucun lien** entre une absence et une délégation ; **aucune modification** d'une absence (`PATCH` absent).
- Décision 3 (a) de la famille : fusionner les deux gestes (« Couvrir une absence »).

## Contraintes strictes (métier)

- ADR-0035 tient : l'absence elle-même n'accorde rien. Le droit d'agir vient d'une **délégation de rôle** ordinaire, créée en même temps, sur la même période, et **liée** à l'absence. Cette liaison est une décision structurelle : amendement du 2026-11-10 de [ADR-0035](../../../adr/0035-l-absence-est-une-delegation-qui-n-accorde-rien.md), écrit avant l'implémentation.
- Le rôle délégué est celui de l'absent dans l'agence (`agent` ou `agency_admin`), jamais plus.
- Créer la délégation exige `team.delegate_role` (ou l'admin principal), comme `POST role-delegations` ; déclarer une absence sans délégation garde ses règles d'aujourd'hui (soi-même, ou `team.delegate_role`).
- Terminer ou révoquer l'absence révoque la délégation liée dans la même transaction ; modifier ses dates ou son remplaçant modifie la délégation liée.
- Double authentification : comme aujourd'hui sur la création et la révocation des absences et des délégations, et sur la modification neuve.
- Journalisé (une entrée par acte, la délégation liée nommée).

## Delta à produire

- [ ] Migration `add_covers_absence_id_to_role_delegations` (nullable, référence `role_delegations.id`).
- [ ] `StoreAgentAbsenceRequest` : `substitute_can_act` (booléen, défaut faux) ; `AgentAbsenceService` crée la délégation liée.
- [ ] `PATCH /api/agencies/{a}/absences/{absence}` → `AgentAbsenceController::update`, `UpdateAgentAbsenceRequest` (`starts_at`, `ends_at`, `substitute_id`, `substitute_can_act`, `reason`).
- [ ] `DELETE` d'une absence révoque sa délégation liée.
- [ ] Sortie d'une absence : `substitute_can_act`, `delegation_id` ; sortie d'une délégation liée : `covers_absence {id, absent {id, name}}`.
- [ ] Tests : `AbsenceCoverDelegationTest` (création, modification, révocation, refus sans capacité, droits pendant et après la période).

## Critères d'acceptation

- [ ] AC1 — `POST absences {substitute_can_act: true}` crée deux lignes liées ; pendant la période, le remplaçant passe une capacité de l'absent (ex. encaisser) ; le lendemain de la fin, il ne la passe plus.
- [ ] AC2 — Sans `team.delegate_role`, `substitute_can_act: true` → 403 et aucune ligne écrite (ni absence, ni délégation).
- [ ] AC3 — `DELETE` de l'absence → la délégation liée est `revoked` dans la même requête.
- [ ] AC4 — `PATCH` qui avance la fin au 12 → la délégation liée finit aussi le 12.
- [ ] AC5 — Une absence sans `substitute_can_act` se comporte exactement comme aujourd'hui (tests existants d'ADR-0035 inchangés et verts).

## Hors périmètre

- L'écran (TCK-2668).
- La suppression des « Délégations temporaires » de la page Rôles : elles restent pour les délégations sans absence.

## Notes d'implémentation

_(à remplir par implementing-specs)_
