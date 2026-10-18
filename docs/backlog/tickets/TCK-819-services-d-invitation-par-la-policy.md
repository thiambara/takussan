---
id: TCK-819
title: "Invitations : les trois services jugent l'inviteur par la policy, et non par une copie de sa règle"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#22-rôles--permissions"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-22--formrequests-sans-autorisation-propre-et-règles-d-autorisation-dans-les-services"
tags: [back, authorization, invitations, pistes]
---

## Contexte

Réf : **P22.03** du fichier de pistes, `validé` (V2 et V8 accordés).

`AgentInvitationService::assertInviterCanManageTeam()`, `OwnerInvitationService::assertInviterCanInvite()`
et `ServiceProviderInvitationService::assertInviterCanInvite()` recopiaient la règle de leur policy
(`AgentProfilePolicy::canManageTeamIn()`, `OwnerProfilePolicy::invite()`,
`ServiceProviderProfilePolicy::invite()`) : admin de l'agence, ou capacité `team.invite` à
l'agence, super-admin d'office. Les contrôleurs appellent la policy avant le service : la règle
était jugée deux fois, par deux copies, et la copie avait déjà divergé (la policy refuse d'abord
par `AgencyKindGuard`, le service ne le faisait pas dans la même méthode).

## Décision du porteur

validé — les trois services d'invitation appellent la policy au lieu de leur copie ; reste : la règle de facture jugée deux fois (StoreInvoiceRequest et InvoiceService), les autres règles des services, et la garde étendue à app/Services

## Reste à faire

la règle de facture jugée deux fois (StoreInvoiceRequest et InvoiceService), les autres règles des services, et la garde étendue à app/Services

## Objectif utilisateur

Une règle d'invitation qui change dans sa policy change aussi pour les services, appelés hors HTTP
compris (`TeamMemberSuspensionService` passe par `AgentInvitationService::suspend()`).

## Contraintes strictes

- Aucune réponse ne change : même statut (403), même message traduit par service.
- `assertAgencyCanInvite()` reste en tête de chaque service : il juge le type d'agence **avant**
  la policy, y compris pour le super-admin, que `Gate::before` laisse passer la policy.
- Le super-admin passe par `Gate::before`, comme pour toute policy.

## Delta à produire

- [x] `AgentInvitationService` : `invite` → ability `invite` sur `[AgentProfile::class, $agency]`,
      `suspend` → `suspend` sur le profil, `remove` → `delete` sur le profil.
- [x] `OwnerInvitationService` et `ServiceProviderInvitationService` : `invite` sur
      `[<Profil>::class, $agency]`.
- [x] `tests/Feature/Invitation/InvitationServicesFollowPolicyTest.php`.

## Critères d'acceptation

- [x] AC1 — La policy forcée à refuser (`Gate::before`) : les trois invitations, la suspension et
      le retrait d'un agent lèvent 403 pour un admin d'agence.
- [x] AC2 — La policy forcée à accorder : les trois invitations et la suspension passent pour un
      compte sans profil.
- [x] AC3 — Une agence `individual` reste refusée à l'invitation d'agent, même quand la policy
      accorde.
- [x] AC4 — Les tests existants des invitations, de l'équipe et de la suspension restent verts.

## Hypothèses

- « Appeler la policy » se fait par `Gate::forUser($acteur)->denies(...)` : la Gate porte le
  `Gate::before` du super-admin, que l'ancienne copie rejouait à la main.
- Pour la suspension et le retrait, l'ability prise est celle de l'action (`suspend`, `delete`),
  qui juge l'agence du profil, celle que le service jugeait déjà.

## Hors périmètre

- Ce que dit « Reste à faire ».

## Notes d'implémentation

- **Ablation** : services d'origine remis, 6 des 7 tests rougissent (AC3 reste vert : il garde le
  type d'agence, que les deux versions jugent) ; correctif remis, 7 verts.
- Aucun appel HTTP ne distingue l'ancienne copie de la policy : les deux rendent aujourd'hui la
  même réponse. Le test fixe donc la décision de la policy par `Gate::before` pour observer que le
  service la suit.
