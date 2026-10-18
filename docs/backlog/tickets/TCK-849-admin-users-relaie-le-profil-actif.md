---
id: TCK-849
title: "Le relais admin-users transmet le profil actif"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-proxy-admin-users-ne-relaie-pas-le-profil-actif"
tags: [front, bff, profils, pistes]
---

## Contexte

Réf : **P03.07** du fichier de pistes, `validé` par le porteur (critère accordé : V2).

Le relais `admin-users` ne transmet que `Authorization`. Sans indice de profil, `ResolveActiveProfile`
ne choisit l'agence que si l'utilisateur n'en a qu'une : un admin de deux agences reçoit 403 de
`GET /api/users` (mesuré par le mesureur le 2026-10-15), et la console d'équipe lui est fermée.

## Décision du porteur

le proxy admin-users transmet le profil actif

## Objectif utilisateur

Un admin présent dans plusieurs agences gère l'équipe de l'agence qu'il a choisie.

## Delta à produire

- [x] `admin-users/[[...path]]/route.ts` pose `X-Active-Profile-Hint` depuis
      `profilActifEspaceApplicatif(request.cookies)`, comme le relais `agencies`.
- [x] Test du relais.

## Critères d'acceptation

- [x] AC1 — Avec le cookie `active_profile_id`, la requête amont porte `X-Active-Profile-Hint` de
      même valeur.
- [x] AC2 — Sans ce cookie, aucun indice n'est envoyé.
- [x] AC3 — Pendant une impersonation, le profil de l'opérateur n'est pas transmis (invariant 11).

## Hors périmètre

- Les autres en-têtes que pose `apiRequest` (langue, IP du visiteur) : P41.02, à valider.

## Notes d'implémentation

- **Ablation** : correctif retiré → AC1 rouge (indice absent), AC2 et AC3 verts ; remis → 3 verts.
- Hypothèse : le cookie `active_profile_id` porte la même valeur que celle qu'`agencies` relaie déjà
  en indice ; aucun format neuf n'est introduit.
