---
id: TCK-1758
title: "L'octroi du profil plateforme à la confirmation de la 2FA pose la relation sur l'instance de la requête"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-154--relations-restées-en-mémoire-après-une-écriture-faite-à-côté-delles"
tags: [api, super-admin, profils, pistes]
---

## Contexte

Réf : **P154.02** du fichier de pistes, `validé`.

`ResolveActiveProfile` charge `platformProfile` sur l'utilisateur de chaque requête, et
`activePlatformLevel()` lit la relation chargée. `SuperAdminTwoFactorController::attachSuperAdminRole()`
créait ou réactivait le profil par `firstOrNew(…)->save()` sans `setRelation` : pour le reste de la
requête, `isSuperAdmin()` et `Gate::before` disaient l'inverse de la base. Rien ne les lit après
l'écriture aujourd'hui.

## Décision du porteur

« validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket »

Critère accordé : V2. La Piste n'a qu'une voie.

## Delta à produire

- [x] `$user->setRelation('platformProfile', $profile)` après `save()`.
- [x] Test dans `SuperAdminGrantOnlyByCooptationTest` : après `confirm()`, l'instance de la
  requête est super-admin.

## Critères d'acceptation

- [x] AC1 — Après `POST /api/auth/super-admin/2fa/confirm`, `isSuperAdmin()` est vrai sur
  l'instance authentifiée de la requête.

## Notes d'implémentation

- Avant correctif : `relationLoaded('platformProfile')` vrai et `isSuperAdmin()` faux (rouge).
- Ablation : contrôleur remis à `HEAD` → 1 rouge ; remis → 7/7.
