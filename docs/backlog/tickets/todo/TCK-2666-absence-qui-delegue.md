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

Implémenté le 2026-11-11 (agent back-agence, branche `feat/audit-ux-app-lot-1`), d'après l'amendement
du 2026-11-10 d'ADR-0035, déjà écrit.

**Prémisse re-mesurée** : conforme — aucun lien entre absence et délégation, pas de `PATCH`, les
absences hors de la console des délégations.

**Unicité partielle — décision (a) de la session du 2026-11-11, écrite dans l'amendement d'ADR-0035** : l'amendement posait `covers_absence_id` **unique**.
L'unicité est ici **partielle** (`role_delegations_live_cover_unique` : unique parmi les délégations
`scheduled`/`active`) — au plus UNE délégation liée en cours par absence. Changer de remplaçant
révoque la délégation et en crée une neuve, et retirer puis rendre le droit aussi : une unicité
pleine refuserait la seconde ligne, ou obligerait à effacer le lien des délégations révoquées
(et l'historique « couvre l'absence de… »). Ablations : l'index plein fait rougir ces deux cas, et
l'index retiré fait rougir le test qui insère une seconde délégation liée en cours.

**Décisions**

- **Le rôle prêté** : `agency_admin` si l'absent a un profil d'administrateur actif dans l'agence,
  sinon `agent` s'il a un profil d'agent actif ; sinon 422 `substitute_can_act`
  (`team_handover.absences.no_base_role`) — un membre qui n'est personnel que par une délégation
  n'a rien à prêter.
- **La délégation liée** passe par `RoleDelegationService::create()` (mêmes événements, même journal,
  mêmes notifications) dans la transaction de l'absence, délégant = l'auteur du geste, mêmes
  `starts_at`/`ends_at`. Ses refus (délégation à soi-même, remplaçant sans profil d'agent ni de
  bailleur, administrateur principal) sont rendus sur `substitute_can_act`, et rien n'est écrit.
  **Un remplaçant seulement administrateur** (sans profil d'agent) ne reçoit pas de délégation :
  `create()` exige un profil d'agent ou de bailleur, comme la page Rôles — 422 `substitute_can_act`
  (`user_not_in_agency`), épinglé. À savoir pour l'écran (TCK-2668) : un administrateur qui couvre
  un agent ne peut pas « agir à sa place » par ce geste.
  Le **motif** de l'absence n'est pas recopié : il peut être une donnée de santé (verif-591 m3), et
  la délégation se lit sur la page Rôles.
- **AC2** : `substitute_can_act: true` exige en plus `create` de `RoleDelegationPolicy` (déléguer en
  propre, ou administrateur principal), dans `StoreAgentAbsenceRequest::authorize()` : 403 avant
  toute validation et toute écriture.
- **Propagation** dans `RoleDelegationService` : `revoke`, `activate` et `expire` d'une ABSENCE
  emportent sa délégation liée en cours **dans la même transaction**. La révocation par
  `DELETE absences`, l'activation et l'expiration par `ProcessRoleDelegationsJob` passent donc
  toutes par là. Révoquer reste ouvert à l'absent et à l'auteur (règle de `revokeAbsence`) :
  retirer un droit n'en accorde aucun.
- **`PATCH /api/agencies/{agency}/absences/{delegation}`** (`UpdateAgentAbsenceRequest`, sur
  `BaseFormRequest`) : `starts_at`, `ends_at`, `substitute_id`, `substitute_can_act`, `reason`.
  - Ordre : 404 (autre agence, délégation ordinaire), 403, 422.
  - Autorisation (`RoleDelegationPolicy::updateAbsence`) : ceux qui peuvent révoquer l'absence ;
    **et** pouvoir déléguer dès qu'après la modification une délégation liée sera en cours et que
    la requête porte ses dates, son remplaçant ou `substitute_can_act`. L'absent sans
    `team.delegate_role` corrige donc son motif ou retire le droit, mais n'allonge ni ne
    réoriente une délégation.
  - Absence révoquée ou expirée → 422 `agent_absence.closed`. Le début d'une absence commencée ne
    bouge plus (422 `starts_at`) ; une absence planifiée ramenée à maintenant commence, sa
    délégation avec elle. Fin avant le début → 422 `ends_at`. Remplaçant : mêmes règles qu'à la
    déclaration. Chevauchement rejugé sous le verrou de l'absent, l'absence elle-même exclue.
  - Délégation liée : dates modifiées **en place** ; autre remplaçant → l'ancienne révoquée (son
    titulaire en est avisé), une neuve au nouveau ; droit retiré → révoquée ; droit rendu ou ajouté
    → créée.
- **La console des délégations** liste la délégation liée avec `covers_absence {id, absent {id,
  name}}` (`null` pour une délégation ordinaire), et refuse de la révoquer seule : 422
  `role_delegation.covers_absence`, après l'autorisation.
- **Sortie d'une absence** : `substitute_can_act` (une délégation liée EN COURS) et `delegation_id`
  (la dernière délégation liée, close comprise : après `DELETE`, l'absence nomme la délégation
  révoquée avec elle).
- **Journal** : `absence.declared` porte `delegation_id` ; `absence.updated` est neuf
  (`{changed, agency_id, delegation_id}`, causé par l'auteur) ; la révocation d'une absence
  (`revoked`) porte le `delegation_id` qu'elle emporte ; la délégation journalise ses propres actes
  (`role_delegation.created`/`revoked`). `absence.updated` n'a pas encore de libellé dans
  `admin.audit.events` du front (repli sur le code) : à ajouter avec l'écran (TCK-2668).
- Second facteur : `AgentAbsenceController@update` ajouté à `ProtectedActions`.
- Aucun `NotificationCode` neuf : les avis de délégation existants partent pour la délégation liée,
  comme le veut l'ADR.

**Mesures** : 30 tests dans `AbsenceCoverDelegationTest` ; `AgentAbsenceTest` et
`TeamHandoverAbsenceTwoFactorTest` inchangés et verts (AC5). 38 ablations rouges, restaurées par
`cp`, md5 vérifiés. AC1 est éprouvé avec un **administrateur** absent et un **agent** remplaçant, sur
`team.invite`, que le rôle d'agent ne porte pas (précondition assertée) — deux agents ne
prouveraient rien : faux avant, vrai le 12, faux le 15. `down()` éprouvé sur une base jetable (migrate, rollback d'un pas, re-migrate) ; la base de
démo est migrée (lot 8, permis par le brief) — si l'unicité pleine est retenue, revenir d'un pas.

**Pour `/sync-specs`** : `docs/models-spec.md` § RoleDelegation (`covers_absence_id`, l'index
partiel) et `docs/features.md` § 1.12 (« Couvrir une absence », le `PATCH`).
