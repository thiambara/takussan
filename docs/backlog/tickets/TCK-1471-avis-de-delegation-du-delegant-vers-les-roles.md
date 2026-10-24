---
id: TCK-1471
title: "Les avis de délégation du délégant mènent à `/app/agency/roles`"
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
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-161--cibles-de-notification-qui-ouvrent-un-écran-fermé-au-destinataire"
tags: [back, notifications, delegations, pistes]
---

## Contexte

Réf : **P161.03** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`NotifyDelegationActivated`, `NotifyDelegationRevoked` et `NotifyDelegationExpired` envoient au
bénéficiaire et au délégant la même cible `team` (`/app/agency/team`). Pour le délégant, cette
page ne montre aucune délégation : elles vivent sous `/app/agency/roles`
(`RoleDelegationsSection`, TCK-369).

## Décision du porteur (déléguée)

validé (délégué) — le délégant reçoit un genre neuf vers `/app/agency/roles`, où vivent les délégations (`RoleDelegationsSection`, TCK-369), pour l'activation, la révocation et l'expiration ; test : chaque code `role_delegation.*_delegator` rend `/app/agency/roles` ; reste : la cible du bénéficiaire (aucune, ou une page qu'il ouvre), au porteur

## Reste à faire

la cible du bénéficiaire (aucune, ou une page qu'il ouvre), au porteur

## Contrat de données

- `NotificationTarget::PATHS` gagne `role_delegations` → `/app/agency/roles`.
- Les trois écouteurs l'emploient pour le seul avis `*_delegator` ; le bénéficiaire garde `team`.
- La cible déduite des lignes anciennes (`fromReferenceable`, `RoleDelegation` → `team`) n'est pas
  touchée : elle ne sait pas qui, du délégant ou du bénéficiaire, est le destinataire.

## Delta à produire

- [x] Genre `role_delegations` dans `NotificationTarget::PATHS`.
- [x] Cible du délégant dans les trois écouteurs.
- [x] `tests/Feature/Notifications/RoleDelegationNotificationTargetTest.php`.

## Critères d'acceptation

- [x] AC1 — `role_delegation.activated_delegator`, `revoked_delegator`, `expired_delegator` →
  `/app/agency/roles`.
- [x] AC2 — l'avis du bénéficiaire garde `/app/agency/team`.

## Hors périmètre

- Un délégant qui tiendrait `team.delegate_role` sans `team.assign_role` n'ouvre pas
  `/app/agency/roles` (relevé par le délégué, lu, non mesuré).

## Notes d'implémentation

- Ablation : `$target` (`team`) remis pour le délégant dans les trois écouteurs → 3 rouges,
  remis → 3/3 verts.
