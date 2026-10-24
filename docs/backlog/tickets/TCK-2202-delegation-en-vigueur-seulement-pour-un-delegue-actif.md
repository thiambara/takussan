---
id: TCK-2202
title: "Une délégation ne confère rien à un délégué sans profil actif dans l'agence"
status: doing
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#66-roledelegation-"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md#a-une-délégation-ne-confère-rien-à-un-délégué-sans-profil-actif-p21801-p21802-p21805-b"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-218--ce-que-le-retrait-éteint-et-que-la-suspension-laisse--délégations-de-rôle-et-colonnes-dauteur"
tags: [api, autorisation, delegation, suspension, pistes]
---

## Objectif

Une délégation de rôle n'est **en vigueur** que si elle est active et que son délégué détient,
dans l'agence de la délégation, un profil d'agence actif (`AgentProfile`, `AgencyAdminProfile` ou
`OwnerProfile`). La règle s'écrit une fois, `RoleDelegation::scopeEnVigueur()`, et tous les sites
qui confèrent un droit à partir d'une délégation la lisent.

## Contexte

Réfs : **P218.01** et **P218.02** du fichier de pistes, `validé` (V2 accordé), même ticket.

La suspension (`TeamMemberSuspensionService`) ne touche que les profils : la délégation de l'agent
suspendu restait `active`, et aucun de ses lecteurs ne regardait les profils du délégué. Délégué
`agency_admin` puis suspendu, l'agent restait personnel (`isStaffAt`), invitait
(`POST …/agents/invite` → 201), approuvait un reversement (`PayoutApprovers`) et recevait les
demandes de contact (`ContactLeadService`), à rebours de `docs/features.md` § 2.2 (« un profil non
actif ne confère aucune capacité ni aucun périmètre »).

## Décision du porteur

P218.01 : validé — validation du porteur (2026-10-24) : ADR-0031, amendement du 2026-10-24 : une délégation ne compte que si le délégué détient un profil actif dans l'agence, règle écrite une fois en scope de `RoleDelegation` et lue par tous les sites qui confèrent un droit ; la réactivation rend la délégation ; ferme P218.02 et le second point de P218.05

P218.02 : validé — validation du porteur (2026-10-24) : rien de propre : une délégation vers un délégué sans profil actif reste permise et inerte (ADR-0031, amendement du 2026-10-24) ; le commentaire renvoie au § 3 ; même ticket que P218.01

## Hypothèses (mode sans humain)

- Les sites sont ceux que liste ADR-0031, amendement du 2026-10-24, § A, point 2 : les quatre du
  résolveur (`loadActiveDelegations`, branche délégation d'`isStaffAt`, amorce `primed`,
  `staffAgencyIds`), `ContactLeadService::delegues`, `PayoutApprovers::holders` et les trois
  lectures d'`AgentAvailability`. Le cycle de vie (`RoleDelegationController`,
  `ProcessRoleDelegationsJob`, révocation, `AgentAbsenceService`,
  `HasProfiles::hasActiveAgencyDelegation`) garde `active()` (point 3).
- Le commentaire de `RoleDelegationService::create` renvoie au point 5 de l'amendement, qui porte
  la règle de P218.02 (le « § 3 » de la décision désigne le § 3 de `docs/features.md`, que ce
  point cite).
- Le second point de P218.05 (le job active une délégation planifiée vers un suspendu) n'a rien de
  propre : la délégation activée est inerte (point 5). P218.05 est pris par une autre PR ; son
  entrée n'est pas touchée ici.

## Delta à produire

- [x] `RoleDelegation::scopeEnVigueur()` : `active()` et un `EXISTS` sur l'un des trois profils
      actifs du délégué dans l'agence de la ligne.
- [x] Les sites du point 2 passent de `active()` à `enVigueur()`.
- [x] `RoleDelegationService::create` : commentaire qui dit pourquoi la délégation vers un délégué
      sans profil actif reste permise.
- [x] `DelegationEnVigueurTest` ; deux jeux de test existants qui posaient une délégation vers un
      utilisateur sans aucun profil dans l'agence (état que `create` refuse) reçoivent un profil de
      bailleur actif dans l'agence.

## Critères d'acceptation

- [x] AC1 — agent délégué `agency_admin`, suspendu : délégation toujours `active`, `allows(team.invite)`
      faux, `isStaffAt` faux (unitaire et sous `primed`), agence absente de `staffAgencyIds`,
      `POST …/agents/invite` 403.
- [x] AC2 — réactivé : `isStaffAt` vrai, invitation 201, sans geste sur la délégation.
- [x] AC3 — suspendu : absent de `PayoutApprovers::holders` et de `ContactLeadService::agencyReaders`
      (présent comme témoin avant la suspension).
- [x] AC4 (P218.02) — délégation créée par `RoleDelegationService::create` vers un agent suspendu :
      `active`, et `isStaffAt` faux.

## Notes d'implémentation

- Avant correctif : AC1, AC3 et AC4 rouges (AC1 sur `allows` vrai, AC3 sur l'approbateur suspendu,
  AC4 sur `isStaffAt` vrai) ; AC2 vert, comme attendu.
- Ablation : `scopeEnVigueur` réduit à `active()` → 3 rouges sur 4 ; rétabli → 4 verts.
- Piège : `AgencyStaffTwoFactorTest` et `MaintenanceStaffPredicateTest` posaient chacun une
  délégation par la factory vers un utilisateur sans profil dans l'agence de la délégation. Cet
  état, `RoleDelegationService::create` le refuse (`hasProfileAt`), et ADR-0031 § 1 le prive
  d'effet. Leur jeu reçoit un `OwnerProfile` actif, qui ne rend pas personnel à lui seul :
  ce que chaque test mesure ne change pas.
