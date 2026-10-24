---
id: TCK-1775
title: "La fiche de la console dit l'état du verrou de connexion, et « Débloquer » refuse un verrou échu"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-83--clés-des-colonnes-json-hors-agenciessettings"
tags: [api, front, console, auth, pistes]
---

## Objectif utilisateur

L'opérateur de support qui ouvre la fiche d'un utilisateur voit si le compte est verrouillé, jusqu'à
quand, et si sa 2FA est à reconfigurer. « Débloquer le compte » ne lui est offert que si un verrou
court ; un verrou échu ne se « débloque » plus en 200 avec une ligne de journal trompeuse.

## Contexte

Réf : **P83.04** du fichier de pistes.

Mesuré avant correctif sur `0d8a522b4` : `locked_at` posé il y a 20 minutes → `POST
/api/admin/users/{id}/unlock` rendait 200 (attendu 409) ; `GET /api/admin/users/{id}` ne portait ni
`locked_until` ni `force_2fa_reconfigure` ; la console offrait « Débloquer le compte » à toute fiche.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Critères accordés : V7 (dernier classement du mesureur) et V2 (relevé par le délégué, avant la
validation).

## Hypothèses (mode sans humain)

- Choix retenu (la piste et la recommandation du délégué le décrivent ; tout est fait ensemble,
  la validation couvrant les deux temps) :
  - `LoginLock::lockedUntil(User)` rend l'échéance du verrou qui court, **tous canaux** : celui du
    mot de passe (`metadata.locked_at`) et celui du numéro vérifié (le cache), puisque `unlock()`
    lève les deux. `null` sans verrou, un `locked_at` échu comptant pour aucun.
  - `UserSupportService::unlock()` rend 409 `support.account_not_locked` quand `lockedUntil()` est
    `null`.
  - `UserDetailResource` rend `locked_until` (ISO, par `iso()`) et `force_2fa_reconfigure`
    (booléen, faux par défaut).
  - La fiche affiche deux badges (« Verrouillé jusqu'à … », « Double facteur à reconfigurer ») et
    n'offre « Débloquer le compte » que si `locked_until` n'est pas nul.
- Clés i18n neuves en `wo` : le texte français tel quel (wolof en pause).

## Delta à produire

- [x] `LoginLock::lockedUntil()`.
- [x] `UserSupportService::unlock()` juge par elle.
- [x] `UserDetailResource` : `locked_until`, `force_2fa_reconfigure`.
- [x] `user-detail.tsx` : badges, action conditionnelle (prop `locked` de `UserSupportActionsMenu`).
- [x] Type `AdminUserDetail` et clés `superAdmin.userDetail.lockedUntil` / `force2faReconfigure`.

## Critères d'acceptation

- [x] AC1 — `locked_at` il y a 20 minutes → 409 `support.account_not_locked`, aucune ligne
  `super_admin_account_unlocked` (`UserSupportTest::test_unlock_refuses_an_expired_lock`).
- [x] AC2 — La fiche rend `locked_until` = `locked_at` + 15 min pour un verrou qui court, `null`
  pour un verrou échu, et `force_2fa_reconfigure` (`test_detail_renders_the_derived_lock_state`).
- [x] AC3 — La console n'offre « Débloquer » qu'à un compte verrouillé et affiche les deux états
  (`UserLifecycleActions.test.tsx`, « état du verrou »).

## Notes d'implémentation

- Ablation API : ancienne condition d'`unlock()` et les deux clés de la ressource retirées → 2
  rouges sur 10 ; rétablies → 10 verts.
- Ablation front : filtre de l'action et badges neutralisés → 3 rouges sur 10 ; rétablis → 10 verts.
- La prop `locked` de `UserSupportActionsMenu` est requise : les deux tests du second facteur la
  passent ; la fixture de `UserProfilesSection.test.tsx` porte les deux champs neufs.
