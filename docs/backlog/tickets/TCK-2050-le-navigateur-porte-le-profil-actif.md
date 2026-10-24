---
id: TCK-2050
title: "Les appels du navigateur à l'API portent l'indice du profil actif, tenu par AuthProvider depuis le layout racine"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-1996]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-174--lectures-serveur-sans-profil-actif-et-le-navigateur-non-plus"
  tickets:
    - "docs/backlog/tickets/TCK-143-frontend-multi-profile-switcher.md"
tags: [front, multi-profil, auth, pistes]
---

## Contexte

Réf : **P174.01** du fichier de pistes, `validé`.

L'API est sur une autre origine que le front. Le cookie `active_profile_id`, `httpOnly` et posé
sur l'hôte du front par son relais, n'atteint jamais l'API depuis le navigateur, et `apiRequest`
n'y posait `X-Active-Profile-Hint` que si l'appelant passait `activeProfileId`, ce qu'aucun
appelant du navigateur ne faisait. Pour un compte de deux agences, l'API (qui n'auto-bascule que
pour une seule agence) rendait aux lectures du navigateur des listes vides, des fiches en 403 et
des indicateurs refusés (mesuré par l'explorateur et le mesureur). TCK-1996 a fermé le versant
serveur (P174.02, P174.03) ; celui-ci ferme le versant navigateur.

## Décision du porteur

« validation du porteur (2026-10-23) : le navigateur tient le profil actif du layout racine (`initialActiveProfileId`, comme `initialToken`), mis à jour par `useSwitchActiveProfile` ; tout appel authentifié porte l'indice ; la ligne d'ADR-0004 (§ Application) s'écrit en session ; avec P197.04 et P197.05 »

## Objectif utilisateur

Un compte présent dans plusieurs agences voit, dans les écrans qui lisent l'API depuis le
navigateur, les données de l'espace qu'il a choisi, et de lui seul après un changement d'espace.

## Contrat de données

- Le layout racine lit le profil actif du cookie (rien pendant une impersonation, invariant 11 de
  TCK-600 ; rien sans jeton) et le passe à `AuthProvider` en `initialActiveProfileId`.
- `AuthProvider` tient `activeProfileId` (exposé par `useAuth()`, avec `setActiveProfileId`) et
  l'écrit dans `src/lib/profil-actif-navigateur.ts`, que lit `apiRequest`. Un nouveau rendu du
  layout (`router.refresh()`, action serveur qui pose le cookie) fait foi. `openSession` et
  `logout` l'oublient, comme `set-token` et `logout` effacent le cookie.
- `useSwitchActiveProfile` le met à jour au succès, avant les relectures.
- `apiRequest`, dans le navigateur, pour un appel authentifié qui ne nomme aucun profil, pose
  `X-Active-Profile-Hint` à cette valeur. Côté API rien ne change : un indice qui ne désigne plus un
  profil du compte est ignoré.

## Contraintes strictes (métier)

- L'appelant qui passe son profil, un indice ou un `X-Profile-Id` l'emporte.
- Aucun indice sans jeton (pendant une impersonation, le navigateur n'a pas de jeton et le relais
  retire l'indice).
- L'état de module n'est écrit ni lu côté serveur (partagé entre requêtes).

## Delta à produire

- [x] `src/lib/profil-actif-navigateur.ts` (neuf).
- [x] `src/context/AuthContext.tsx` : `initialActiveProfileId`, `activeProfileId`, `setActiveProfileId`.
- [x] `src/app/layout.tsx` : passe le profil actif du cookie.
- [x] `src/hooks/useProfiles.ts` : `useSwitchActiveProfile` met le profil à jour au succès.
- [x] `src/lib/api.ts` : le repli navigateur de l'indice.
- [x] Test `src/context/__tests__/AuthContext.profil-actif-navigateur.tck-2050.test.tsx`.

## Critères d'acceptation

- [x] AC1 — une lecture `useApiQuery` sous `AuthProvider` porte l'indice reçu du layout.
- [x] AC2 — après `useSwitchActiveProfile`, les appels portent le profil choisi.
- [x] AC3 — un profil passé par l'appelant l'emporte ; un appel sans jeton n'en porte aucun.
- [x] AC4 — après `logout`, aucun indice ; un nouveau rendu du layout avec un autre profil fait foi.

## Hors périmètre

- La ligne d'ADR-0004 (§ Application), que la décision du porteur réserve à la session.
- P197.04 et P197.05, que la décision associe à celle-ci : angle impair, part de l'autre instance
  de l'implémenteur (amendement d'ADR-0066 du 2026-10-21 bis), non prises ici.
- Les clés de cache de `useApiQuery` ne portent toujours ni l'agence ni le profil (P197.04).
- Aucun écran n'a été rendu au navigateur pour un compte de deux agences.

## Notes d'implémentation

- Le module est écrit dès l'initialiseur d'état d'`AuthProvider` (premier rendu) : les requêtes des
  enfants partent à l'abonnement, après le rendu, donc avec l'indice. Un `useLayoutEffect` le
  resynchronise, et le setter l'écrit à l'appel pour que les invalidations de `onSuccess` partent
  sous le nouveau profil sans attendre le rendu suivant.
- Trois tests simulaient `useAuth` sans `setActiveProfileId` (`useSwitchActiveProfile.lectures-d-agence`,
  `ProfileSwitcher`, `publish/page.auto-space`) : le premier rougissait (`onSuccess` levait), les
  doubles sont complétés.
- Ablation : `src/lib/api.ts` rendu à `HEAD` → 3 rouges sur 6 (AC1, AC2, rendu du layout) ;
  `src/hooks/useProfiles.ts` rendu à `HEAD` → 1 rouge (AC2) ; correctif remis → 6/6.
