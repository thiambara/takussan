---
id: TCK-1764
title: "Un refreshUser() qui rend le même compte ne relit ni les favoris, ni les accueils vus, ni l'éligibilité à l'avis"
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
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#111-avis--réputation"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-172--lectures-du-navigateur-faites-par-fetch-dans-un-useeffect-hors-de-tanstack-query"
tags: [front, auth, favoris, performance, pistes]
---

## Contexte

Réf : **P172.04** du fichier de pistes, `retenu · autonome` (A2).

`refreshUser()` pose un objet `user` neuf à chaque appel, même pour le même compte. Trois effets
en dépendaient : l'amorçage des favoris d'`AuthContext` (toutes les pages de `/api/favorites`, en
série, puis invalidation de `['favorites']`), la lecture de `/api/me/welcome-seen` de
`MinimalProfileTriggerProvider` et la lecture de l'éligibilité à l'avis de `PropertyReviews`.
Chaque changement de profil appelle `refreshUser()`.

## Objectif utilisateur

Un utilisateur dont le compte n'a pas changé ne repaie pas ces lectures à chaque rafraîchissement
de sa session.

## Contrat de données

Aucun changement d'API. `GET /api/favorites` dépend du compte et de son agence
(`FavoriteController::index`, `staffAgencyId()`, qui ne lit que `agency_id`).

## Contraintes strictes (métier)

- Un changement d'agence (profil d'une autre agence) relit toujours les favoris.
- Une déconnexion vide toujours le magasin de favoris ; un changement de compte relit tout.

## Delta à produire

- [x] Favoris : l'effet dépend de `user.id`, `user.agency_id` et du jeton.
- [x] `MinimalProfileTriggerProvider` et `PropertyReviews` : l'effet dépend de `user.id`.
- [x] Tests vitest : même compte → aucune relecture (trois lecteurs) ; autre agence → favoris relus.

## Critères d'acceptation

- [x] AC1 — deux `refreshUser()` rendant le même compte : une seule lecture des favoris.
- [x] AC2 — un `refreshUser()` rendant une autre `agency_id` relit les favoris.
- [x] AC3 — un nouvel objet `user` du même compte ne relit ni `welcome-seen` ni l'éligibilité.

## Hors périmètre

- La lecture des favoris à chaque chargement de document (P136.05).
- Les quatre lectures de `welcome-seen` (P136.03).

## Notes d'implémentation

- Choix entre les deux voies de la `Piste` : la clé de l'effet plutôt que « ne poser un nouvel
  utilisateur que s'il diffère », comme le classement A2 du mesureur ; `user.id` seul aurait cessé
  de relire les favoris au changement d'agence.
- Ablation : les trois fichiers rendus à `HEAD` → 3 rouges sur 4 (2 lectures au lieu d'une) ;
  correctif remis → 4/4 verts.
