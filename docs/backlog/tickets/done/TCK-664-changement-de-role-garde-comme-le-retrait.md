---
id: TCK-664
title: "Le changement de rôle d'un membre suit les gardes du retrait et de la suspension"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-3--isolation-entre-agences-et-autorisation
tags: [back, team, authorization, pistes]
---

## Contexte

Réf : **P03.01** du fichier de pistes, `validé` par le porteur (critère accordé : V2).

`PUT /api/users/{user}/role` (`UserRoleController`) change le rôle de tout membre qui a un profil
dans l'agence, quel que soit son statut. `setAgent()` et `setOwner()` suppriment le profil
`agency_admin`, et rien ne protège l'administrateur principal, le dernier admin ni l'acteur
lui-même. Un agent suspendu promu admin repart avec un profil `active` neuf. Les voies sœurs ont
ces gardes : `AgencyMemberRemovalService` (admin principal, dernier admin sous verrou) et
`TeamMemberSuspensionService` (soi-même, admin principal).

## Décision du porteur

mêmes gardes qu'AgencyMemberRemovalService : refus sur l'admin principal, le dernier admin, soi-même et un membre non actif

## Objectif utilisateur

Un admin d'agence ne peut pas, par le sélecteur de rôle, laisser son agence sans administrateur,
rétrograder l'administrateur principal, changer son propre rôle ni lever une suspension.

## Contraintes strictes (métier)

- Les refus rendent 422 avec un code, et n'écrivent rien.
- Le dernier admin se compte sous verrou de la ligne `agencies` (point de sérialisation parent),
  pour que deux rétrogradations croisées ne passent pas toutes deux.
- Les gardes valent pour tout acteur, super-admin compris, comme dans les voies sœurs.

## Delta à produire

- [x] `UserRoleController::update` : `assertRoleChangeable()` (soi-même, admin principal, membre
      non actif) avant la transaction ; dernier admin sous verrou dans la transaction.
- [x] Codes `user.role_change_self`, `user.role_primary_admin`, `user.role_last_admin`,
      `user.role_member_not_active` dans `lang/{fr,en,wo}/errors.php`.
- [x] Tests : `UserRoleControllerTest` (+5 : une par garde, et le versant autorisé).

## Critères d'acceptation

- [x] AC1 — Changer son propre rôle rend 422 `user.role_change_self`.
- [x] AC2 — Rétrograder (`agent`, `owner`) l'administrateur principal rend 422
      `user.role_primary_admin`.
- [x] AC3 — Rétrograder le seul admin de l'agence rend 422 `user.role_last_admin`.
- [x] AC4 — Un membre dont un profil dans l'agence n'est pas `active` ne change pas de rôle :
      422 `user.role_member_not_active`, profil suspendu intact.
- [x] AC5 — Un co-admin qui n'est ni principal, ni le dernier, ni l'acteur se rétrograde (200).

## Hypothèses (mode sans humain)

- « Admin principal » et « dernier admin » ne jouent que sur un rôle qui retire le profil
  `agency_admin` (`agent`, `owner`) : `agency_admin` est un no-op pour un admin, et `tenant`,
  `customer`, `service_provider` ne mutent aucun profil.
- « Membre non actif » : un des profils `agent`, `owner` ou `agency_admin` de la cible dans
  l'agence a un statut autre que `active` (suspendu, inactif, brouillon, archivé, bloqué).
- Le dernier admin compte les profils `agency_admin` non supprimés, comme
  `AgencyMemberRemovalService`.

## Hors périmètre

- Déplacer la règle d'autorisation de `UpdateUserRoleRequest::authorize()` dans une policy
  (reprise TCK-305, inchangée).
- Le front n'est pas modifié : `UserRolesEditor` affiche déjà le message de l'erreur.

## Notes d'implémentation

- **Ablation** : contrôleur remis à `pre-dev`, tests gardés → 4 rouges sur 18 (les quatre gardes,
  chacune à 200 au lieu de 422) ; correctif remis → 18 verts. Chaque test n'atteint qu'une garde
  (un second admin est créé dans le test « soi-même », l'acteur du test « dernier admin » est un
  super-admin), donc chaque garde est observée seule.
- Le verrou porte sur `agencies`, pas sur les profils restants comme dans
  `AgencyMemberRemovalService` : verrouiller les profils « autres que la cible » ne sérialise pas
  A qui rétrograde B pendant que B rétrograde A (piège n°2 de `takussan-api/CLAUDE.md`). La même
  faiblesse dans `AgencyMemberRemovalService` est signalée au rapport, pas corrigée ici.
