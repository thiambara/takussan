---
id: TCK-711
title: "Le profil plateforme se lit une fois par requête, dans ResolveActiveProfile"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#21-authentification--comptes
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes
tags: [api, authorization, performance, pistes]
---

## Contexte

Réf : **P02.03** du fichier de pistes, `validé` par le porteur (critère accordé : V2).

`Gate::before` appelle `isSuperAdmin()` à chaque `can()`, et `activePlatformLevel()` relit alors
`platform_profiles` tant que la relation n'est pas chargée. `LeaseResource` le rappelle à chaque
ligne, et `RequireTwoFactor`, `RequireRecentTwoFactor` et `TwoFactorRequirement` émettent chacun
un `platformProfile()->exists()`. Mesuré avant correctif : `GET /api/leases` d'un super-admin sur
3 baux lit `platform_profiles` 8 fois.

## Décision du porteur

platformProfile chargé une fois par requête ; une révocation prend effet à la requête suivante

## Objectif

Une requête HTTP authentifiée lit `platform_profiles` une seule fois, et une révocation du profil
plateforme vaut dès la requête suivante.

## Delta à produire

- [x] `ResolveActiveProfile` : `$user->load('platformProfile')` dès que l'utilisateur est résolu.
- [x] `HasProfiles::holdsPlatformProfile()` : profil plateforme actif ou non, lu sur la relation
      chargée quand elle l'est (même sens que les `exists()` remplacés).
- [x] `RequireTwoFactor`, `RequireRecentTwoFactor`, `TwoFactorRequirement::isMandatory()` passent
      par `holdsPlatformProfile()`.
- [x] Test `tests/Feature/Authorization/PlatformProfileLuUneFoisParRequeteTest.php`.

## Critères d'acceptation

- [x] AC1 — `GET /api/leases` d'un super-admin sur 3 baux lit `platform_profiles` une seule fois.
- [x] AC2 — Un super-admin dont le profil est révoqué entre deux requêtes, sur la même instance
      `User`, reçoit 403 sur `/api/admin/system/metrics` à la seconde.

## Hypothèses (mode sans humain)

- `load()` et non `loadMissing()` : l'instance `User` peut survivre d'une requête à l'autre (en
  test, le garde d'authentification la conserve), et la décision veut la révocation à la requête
  suivante. Coût : une requête par requête HTTP authentifiée, déjà payée aujourd'hui par
  `ResolveActiveProfile` lui-même (`isSuperAdmin()`).
- Relation chargée sans contrainte `active()` : `platform_profiles.user_id` est unique, et
  `activePlatformLevel()` tranche par `isActive()`. Les middlewares 2FA, qui comptaient aussi un
  profil révoqué, gardent ce sens.

## Hors périmètre

- Les files et la console : sans requête HTTP, `isSuperAdmin()` relit la base comme avant.
- `ReviewController` garde ses `loadMissing('platformProfile')`, désormais sans effet sous HTTP.
- `TwoFactorRequirement::requiredAtAgency()` (`agencyAdminProfiles()->exists()`) n'est pas touché.

## Notes d'implémentation

- Ablation : ligne `load()` retirée → AC1 rouge (« 8 is identical to 1 ») ; `loadMissing()` à sa
  place → AC2 rouge (la révocation n'est pas vue sur la même instance) ; correctif remis → 2 verts.
- `bin/impacted-tests.php` sélectionne 675 classes (le middleware est sur tout le groupe `api`) :
  remplacé localement par les classes qui citent le profil plateforme, la 2FA ou le step-up ; la CI
  joue la suite.
