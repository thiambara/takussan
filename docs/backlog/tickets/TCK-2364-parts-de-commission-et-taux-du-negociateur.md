---
id: TCK-2364
title: "Les parts de commission ne s'écrivent et ne se lisent que par le personnel qui ouvre les baux, et le taux du négociateur s'écrit sur la fiche de membre"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#8-propertycollaborator"
    - "docs/models-spec.md#35-agentprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-241--termes-du-mandat-dagence-écrits-hors-de-leaseservicecommission_terms"
  adr:
    - "docs/adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md"
tags: [api, front, commissions, collaborateurs, équipe, autorisation, pistes]
---

## Objectif

Donner un écrivain juste à chacune des deux moitiés de la ventilation d'une commission (ADR-0049
« Ventilation » § 1 et § 2) : les parts des collaborateurs, que le bailleur fixait, et le taux du
négociateur, que personne ne pouvait écrire.

## Contexte

Réfs : **P241.01**, **P241.02** et **P241.03** du fichier de pistes, `validé`.

- **P241.01** : `POST` et `PUT /api/properties/{id}/collaborators` ne jugeaient que `update` du bien,
  que le bailleur tient par `properties.update_own`. Mesuré (mesureur, `db3e25230`) : le bailleur
  posait 60 % puis 100 % sur l'agent de son choix, ramenait à 0 la part posée par l'admin, et lisait
  les parts de tous. Le bail activé ne créditait que son agent, et le négociateur ne recevait rien.
- **P241.02** : `agent_profiles.commission_rate` n'avait aucun écrivain dans l'API. La règle 2 de la
  ventilation ne servait que les tests (taux posé par factory).
- **P241.03** : la copie d'un bien recopiait les parts, et `PropertyResource` les rendait à tout
  lecteur hors des routes publiques.

## Décision du porteur

- P241.01 : seul le personnel de l'agence du bien qui tient `leases.create` (`maySetCommissionTerms`) écrit une part de commission non nulle, à l'ajout comme à la modification ; le bailleur reçoit 403 et ne lit plus les parts
- P241.02 : le taux de commission d'un agent s'écrit sur sa fiche de membre, sous `team.assign_role` ; la règle 2 d'ADR-0049 reste
- P241.03 : la copie et les deux lectures suivent la règle de P241.01

## Delta à produire

- [x] `PropertyPolicy::manageCommissionShares` = `LeaseService::maySetCommissionTerms`.
- [x] `StorePropertyCollaboratorRequest::authorize` : part > 0 sans la règle → 403
  `property.commission_share_forbidden` (texte en `fr`, `en`, et `wo` en français).
- [x] `UpdatePropertyCollaboratorRequest::authorize` : part changée (effacée comprise) sans la règle → 403.
- [x] `PropertyCollaboratorResource` et `PropertyResource` (`collaborators`) : `commission_share`
  omise pour qui ne tient pas la règle.
- [x] `PropertyDuplicationService` : parts copiées seulement si celui qui copie tient la règle.
- [x] `PATCH /api/profiles/{agent_profile}/commission-rate` (`AgentProfileController`,
  `UpdateAgentCommissionRateRequest`, `AgentProfilePolicy::setCommissionRate` sous
  `team.assign_role`), listé dans `ProtectedActions::AGENCY_TWO_FACTOR`.
- [x] `AffectationsDeRole` : `commission_rate` sur la ligne d'un profil d'agent.
- [x] Front : `AgentCommissionRateField` sur la fiche de membre (`UserDetailDrawer`), sous
  `team.assign_role` ; `useSetAgentCommissionRate` ; `commission_share` optionnelle dans les types.
- [x] ADR-0049, amendement du 2026-10-25 (bis), et sa ligne de `docs/adr/README.md`.
- [x] `docs/features.md`, `docs/models-spec.md`, `docs/features-by-actor.md` régénéré.

## Critères d'acceptation

- [x] AC1 — le bailleur qui ajoute un collaborateur avec une part non nulle reçoit 403
  `property.commission_share_forbidden`, et aucune ligne ne naît. Sans part, ou à 0, il l'ajoute (201).
- [x] AC2 — le bailleur qui change une part (0, 100 ou `null` sur une ligne à 40) reçoit 403, et la
  part reste à 40. Renvoyer 40 tel quel passe (200).
- [x] AC3 — un admin d'agence sans `leases.create` reçoit le même 403 ; témoin : l'admin qui la tient
  écrit la part à l'ajout et à la modification.
- [x] AC4 — le bailleur ne lit plus `commission_share`, ni par la liste des collaborateurs ni par
  `GET /api/properties/{id}?include=collaborators` ; témoin : l'admin la lit par les deux.
- [x] AC5 — la copie du bailleur reprend les collaborateurs sans leur part ; témoin : celle de
  l'admin garde 40.
- [x] AC6 — l'admin fixe le taux d'un agent à 30 sur sa fiche, puis un bail de commission 100 000 dont
  l'agent est le négociateur est activé : une seule ligne naît, `negotiator`, 30 %, 30 000.
- [x] AC7 — l'agent (le sien, ou un collègue), le bailleur, un admin sans `team.assign_role` et l'admin
  d'une autre agence reçoivent 403 ; un taux hors de 0 à 100, ou absent, rend 422 ; `null` l'efface.
- [x] AC8 — la liste des membres rend le taux sur la ligne d'affectation d'un agent, et la fiche
  l'affiche et l'enregistre (champ vidé : `null`) ; un refus s'affiche, et le champ revient au taux en
  place.

## Hypothèses

- P241.01, modification : « écrit une part non nulle » se lit « change la part ». Ramener à 0 la part
  posée par l'admin est l'un des gestes mesurés au constat ; renvoyer la part inchangée n'écrit rien.
  C'est l'option qui ne retire rien à un appelant légitime.
- P241.01 : le changement de rôle hors d'`agent` (qui efface la part, TCK-1448) et le retrait d'un
  collaborateur restent au bailleur. Ils retirent une part sans la donner à personne. Écrit en « Ce
  qui n'est pas gardé » de l'amendement.
- P241.01 : le code est neuf (`property.commission_share_forbidden`) plutôt que
  `lease.commission_forbidden`, dont le texte parle de la commission et du négociateur du bail.
- P241.01 : la règle passe par une policy (`manageCommissionShares`), donc le super-admin la franchit
  par le `Gate::before` global, comme toute policy.
- P241.03 : hors du lecteur autorisé, la clé `commission_share` manque plutôt que de valoir `null`,
  qui dirait « aucune part ». Le front ne l'affichait nulle part.
- P241.02 : la capacité est celle de la décision, `team.assign_role`, jugée dans l'agence du profil
  comme `AgencyRolePolicy::assign`. L'action rejoint `AGENCY_TWO_FACTOR`, comme l'affectation de rôle
  de la même fiche. La lecture du taux passe par `meta.role_assignments`, déjà gardé par cette capacité.

## Notes d'implémentation

- Avant correctif : 5 rouges sur 10 dans `CommissionShareWritersTest` (ajout 403, modification 403,
  admin sans `leases.create`, lecture, copie), et 8 sur 8 dans `AgentCommissionRateTest` (route
  absente, 404). Front : le composant n'existait pas.
- Ablations, chacune remise : la garde de l'ajout → AC1 et AC3 rouges ; celle de la modification → AC2
  rouge ; la lecture de la liste, puis celle de `PropertyResource` → AC4 rouge chaque fois ; la copie
  → AC5 rouge ; la policy du taux rendue `true` → les 4 refus d'AC7 rouges ; l'écriture du taux
  retirée → AC6 et l'effacement rouges ; le taux retiré des affectations → AC8 (API) rouge. Front :
  le champ retiré de la fiche → le test de placement rouge ; `null` et le retour au taux en place
  retirés → 2 rouges.
- Quatre classes existantes posaient la part en bailleur : leurs cas de plafond, de verrou et de
  projection la posent désormais en admin d'agence, et ceux qui ne portaient pas sur la part
  l'ont perdue. `UserAdminRoleAssignmentsTest` épingle la forme d'une affectation : la clé
  `commission_rate` y entre.
