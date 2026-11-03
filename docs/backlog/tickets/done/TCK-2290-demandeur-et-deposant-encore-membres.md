---
id: TCK-2290
title: "Le demandeur d'une intervention et le déposant d'une demande de passage en agence professionnelle n'en gardent que ce que leur appartenance leur laisse"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md#amendement-du-2026-10-25--laccès-suit-lappartenance"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-233--colonnes-dauteur-du-personnel-restées-hors-de-la-règle-dauteur-dadr-0031"
tags: [api, authorization, maintenance, agency-upgrade, pistes]
---

## Contexte

Réfs : **P233.03, P233.04** du fichier de pistes, `validé` par le porteur le 2026-10-25. Décision D2
de l'amendement du 2026-10-25 d'ADR-0031 : la partie B (règle d'auteur) s'étend à `requester_id`
d'une intervention et à `submitted_by` d'une demande de passage en agence professionnelle.

- `MaintenanceRequestPolicy` rendait l'intervention à son demandeur (`requester_id`) sans condition
  (`view`, `respondToResolution`, `actorsOf`), et `MaintenanceRequest::scopeVisibleTo` la listait de
  même. `store` écrit `requester_id` = l'appelant, personnel compris : l'agent suspendu ou retiré qui
  avait ouvert l'intervention la lisait, la listait, et confirmait ou contestait la réparation.
- `AgencyUpgradeRequestPolicy::revoke` rendait vrai dès `submitted_by === user.id` : l'administrateur
  suspendu ou retiré révoquait la demande qu'il avait déposée, et la révocation est finale.

## Décision du porteur

- **P233.03** :
  > validé — validation du porteur (2026-10-25) : la branche du demandeur vaut si le bien est sans agence, si le demandeur est membre, ou s'il n'a jamais tenu de profil de personnel dans l'agence ; trois sites et la liste (partie B d'ADR-0031 étendue à `requester_id`)
- **P233.04** :
  > validé — validation du porteur (2026-10-25) : `auteurEncoreMembre($user, submitted_by, agency_id)` (partie B d'ADR-0031 étendue à `submitted_by`)

## Delta à produire

- [x] `MembershipCapabilityResolver::agencesDuPersonnelParti()` : les agences où l'utilisateur a tenu
      un profil d'agent ou d'administrateur (tout statut, supprimés compris, brouillon exclu) et
      n'est plus membre (`isMemberAt`).
- [x] `MaintenanceRequestPolicy::isRequester()` : la branche du demandeur, lue par `view`,
      `respondToResolution` et `actorsOf`.
- [x] `MaintenanceRequest::scopeVisibleTo` : la clause `requester_id` exclut les biens des agences du
      personnel parti.
- [x] `BasePolicy::auteurEncoreMembre` devient publique et statique ; `AgencyUpgradeRequestPolicy::revoke`
      la lit pour `submitted_by`.
- [x] `tests/Feature/Maintenance/DemandeurEncoreMembreTest.php`,
      `tests/Feature/Agency/DeposantEncoreMembreTest.php`.

## Critères d'acceptation

- [x] AC1 (P233.03) — Agent demandeur suspendu (`TeamMemberSuspensionService::suspend`), puis retiré
      (`AgencyMemberRemovalService::remove`), d'une intervention `completed` d'un bien de l'agence :
      `GET` 403, absente de `GET /api/maintenance-requests`, `confirm-resolution` et
      `contest-resolution` 403, la demande reste `completed`, et `actorsOf` ne le range plus parmi
      les demandeurs.
- [x] AC2 (P233.03) — Gardent tout (lecture, liste, confirmation) : l'agent demandeur actif, le
      locataire demandeur, le demandeur parti sur un bien sans agence, l'ancien agent d'une autre
      agence locataire ici, le locataire invité comme agent (profil `draft`) de l'agence.
- [x] AC3 (P233.04) — Déposant suspendu, puis retiré : `DELETE /api/agencies/{id}/upgrade-requests/{req}`
      403, la demande reste `pending`. Le déposant actif révoque (200), et un autre administrateur
      actif révoque la demande du déposant retiré (200).

## Hypothèses

- **« N'a jamais tenu de profil de personnel »** : un `AgentProfile` ou un `AgencyAdminProfile` de
  l'agence, de tout statut, supprimé compris. Un `AgentProfile` en `draft` (invitation envoyée, non
  acceptée) n'a pas été tenu : le locataire qu'on invite comme agent ne perd pas sa demande avant
  d'avoir accepté. Une délégation de rôle n'est pas un profil, et ne compte pas. C'est l'option qui
  ne retire rien à un demandeur qui n'a jamais été du personnel.
- **Bien supprimé** : `view` lit l'agence par `$request->property`, qui ne rend pas un bien supprimé.
  La branche du demandeur vaut alors comme pour un bien sans agence, et la liste fait de même
  (`whereDoesntHave('property', …)`). C'est la forme d'`InventoryPolicy` (`$property?->agency_id`).
- **`auteurEncoreMembre` statique** : `AgencyUpgradeRequestPolicy` n'hérite pas de `BasePolicy`
  (ses abilities prennent une `Agency`, signatures incompatibles). La règle reste écrite une fois.

## Notes d'implémentation

- Ablation, fichier par fichier : `MaintenanceRequestPolicy` remis → 2 rouges (`view`) ;
  `scopeVisibleTo` remis → 2 rouges (« encore listée ») ; `actorsOf` seul remis → 2 rouges
  (« encore acteur demandeur ») ; `AgencyUpgradeRequestPolicy` remis → 2 rouges. Correctif rétabli → 11 verts.
- `respondToResolution` seul remis reste vert : il exige aussi `transitionTo`, qui lit `actorsOf`.
  Le site est aligné pour que la règle soit la même aux trois, sans comportement propre à garder.
