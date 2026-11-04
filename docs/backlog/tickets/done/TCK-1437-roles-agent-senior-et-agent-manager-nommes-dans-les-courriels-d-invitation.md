---
id: TCK-1437
title: "Les rôles `agent_senior` et `agent_manager` sont nommés dans le courriel d'invitation et l'avis d'acceptation"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-155--courriels-que-la-suite-ne-rend-jamais"
tags: [back, invitations, i18n, courriels, pistes]
---

## Contexte

Réf : **P155.01** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`AgentInvitationService::ALLOWED_ROLES` accepte `agent_senior` et `agent_manager`, mais
`invitations.roles` ne les connaissait dans aucune langue : le courriel d'invitation et l'avis
d'acceptation rendaient `invitations.roles.agent_senior` au lieu du rôle.

## Décision du porteur (déléguée)

validé (délégué) — ajouter `agent_senior` et `agent_manager` à `invitations.roles` en reprenant les libellés de l'écran où l'agence choisit le rôle (`team.invite.roles`), en minuscules comme les rôles voisins : `fr` « agent senior » et « agent manager », `en` « senior agent » et « agent manager », `wo` le texte français tel quel ; plus la garde de rendu de la `Piste` pour chaque rôle accepté ; reste : harmoniser les libellés divergents d'`agent_manager` au front (`admin.team.invitations`, `admin.inviteAgent`)

## Reste à faire

harmoniser les libellés divergents d'`agent_manager` au front (`admin.team.invitations`, `admin.inviteAgent`)

## Delta à produire

- [x] `lang/{fr,en,wo}/invitations.php` : `roles.agent_senior`, `roles.agent_manager`.
- [x] `tests/Feature/Invitation/RoleDInvitationRenduTest.php` : pour chaque rôle de
  `CreateInvitationRequest` (lu dans sa règle `Rule::in`) et d'`AgentInvitationService::ALLOWED_ROLES`,
  dans les trois langues, la clé existe dans la langue et ni `InvitationMailable` ni
  `InvitationAcceptedNotification` ne rendent `invitations.roles.`.

## Critères d'acceptation

- [x] AC1 — les huit rôles × trois langues : aucun rendu ne contient la clé brute.
- [x] AC2 — un rôle ajouté à l'un des deux émetteurs sans libellé fait rougir la garde.

## Notes d'implémentation

- Piège : retirer la clé d'une seule langue laisse le rendu propre (Laravel retombe sur la langue
  de secours). La garde assert donc `Lang::hasForLocale()` en plus du rendu.
- Ablation : clés retirées de `fr` seul → rouge (« absent en fr ») ; des trois langues → rouge ;
  remises → vert (72 assertions).
