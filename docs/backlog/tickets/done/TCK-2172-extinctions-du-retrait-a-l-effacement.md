---
id: TCK-2172
title: "L'effacement d'un compte fait les extinctions du retrait : marques d'agent principal et délégations"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-204--travail-dun-agent-laissé-à-son-compte-effacé"
tags: [back, account, agency, delegations, pistes]
---

## Objectif utilisateur

Un compte effacé ne garde ni marque d'agent principal sur un bien ni délégation de rôle,
comme un membre retiré de l'agence.

## Contexte

Réf : **P204.05** du fichier de pistes, `validé`. Le retrait révoque les délégations et ôte les
marques (`AgencyMemberRemovalService`) ; l'effacement ne faisait ni l'un ni l'autre (mesuré :
`is_primary` vrai, délégation `active` après `executeDeletion()`).

## Décision du porteur

> validation du porteur (2026-10-24) : une méthode commune ôte les marques d'agent principal et les délégations, appelée par le retrait et par l'effacement ; le référent client reste un sujet à part

## Hypothèses (mode sans humain)

- La méthode commune vit dans `AgencyMemberRemovalService` (`dropDelegationsAndMarks`), que le
  retrait appelle pour une agence et l'effacement pour toutes (`$agencyId` nul).
- À l'effacement, l'auteur de la révocation est le compte lui-même (comme l'activité
  `account.deletion.executed`).
- Appelée juste avant la suppression du compte, déjà anonymisé et `deleted` : l'avis de révocation
  lit encore le délégué (`$delegation->user`, nul après la suppression) et les avis l'écartent.

## Delta à produire

- [x] `AgencyMemberRemovalService::dropDelegationsAndMarks()` (révocation + `dropPrimaryMarks` à agence facultative), appelée par `remove()`.
- [x] `AccountDeletionService::anonymize()` l'appelle.
- [x] Test : `EffacementMarquesEtDelegationsTest` (3 cas).

## Critères d'acceptation

- [x] AC1 — La marque d'agent principal du compte effacé tombe, la ligne reste.
- [x] AC2 — Les délégations où il est remplacé ou délégué sont révoquées ; une autre reste active ; aucun avis codé ne lui part.
- [x] AC3 — Le référent client garde `is_primary`.

## Hors périmètre

- Le référent client (sujet à part, selon la décision).
- La source que rend `GET …/collaborators`, non relue par l'explorateur.

## Notes d'implémentation

- Ablation : l'appel retiré de `anonymize()` → AC1 et AC2 rouges, AC3 vert (il garde l'absence) ; remis → vert.
- Piège : appelée après `$user->delete()`, la révocation faisait lever `NotifyDelegationRevoked` (`send(null, …)`, `TypeError`) : le délégué supprimé n'est plus résolu.
