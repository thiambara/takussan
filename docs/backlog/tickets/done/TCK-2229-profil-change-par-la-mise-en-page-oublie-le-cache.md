---
id: TCK-2229
title: "Un profil actif changé par la mise en page oublie le cache de l'ancien profil"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2091, TCK-2050]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-197--clés-tanstack-query-des-lectures-de-lagence-active-face-au-changement-de-profil"
tags: [front, cache, profil-actif, pistes]
---

## Objectif utilisateur

Quand l'espace (profil actif) change sans passer par le menu — un parcours d'accueil qui pose le
cookie `active_profile_id` par une action serveur, puis une navigation —, aucun écran ne montre
une donnée de l'agence quittée : le cache est oublié et relu, comme après un changement par le
menu (TCK-2091).

## Contexte

Réf : **P197.06** du fichier de pistes, `validé (délégué)`.

Décision du porteur (déléguée) : remettre le cache à zéro aussi dans le chemin de la mise en page, par la même fonction que l'`onSuccess` de `useSwitchActiveProfile` (le prédicat de TCK-2091, hors `['me','profiles']`, écrit une fois et appelé des deux) : `AuthProvider` l'appelle, dans un effet et jamais pendant le rendu, quand la mise en page rend un `initialActiveProfileId` différent du profil que le client tient déjà, si bien que le `router.refresh()` d'un changement par le menu, qui rend le profil déjà posé par `setActiveProfileId`, n'oublie pas le cache une seconde fois ; l'`onSuccess` de `useSwitchActiveProfile` reste tel quel ; test : `AuthProvider` re-rendu sous un autre `initialActiveProfileId` oublie une clé d'agence et garde les profils, re-rendu sous le profil déjà posé n'oublie rien

Avant (lu) : `AuthContext.tsx` adopte un `initialActiveProfileId` neuf pendant le rendu
(`setActiveProfileIdState`) sans toucher au `QueryClient` ; seul l'`onSuccess` de
`useSwitchActiveProfile` (`useProfiles.ts`) réinitialisait le cache. Cinq actions d'accueil posent
le cookie (`onboarding.ts`, `auto-onboard.ts`, `agent-onboarding.ts`, `owner-onboarding.ts`,
`service-provider-onboarding.ts`).

## Hypothèses (mode sans humain)

- « La même fonction » : le prédicat et l'appel `resetQueries` sortent dans
  `src/lib/cache-d-espace.ts` (`oublierLeCacheDEspace`), appelé par l'`onSuccess` (dont le
  comportement ne change pas) et par `AuthProvider`. Un module à part plutôt qu'un export de
  `useProfiles.ts`, qui importe déjà `AuthContext` : l'inverse ferait un cycle d'import.
- « Le profil que le client tient déjà » : l'état `activeProfileId` d'`AuthProvider` au rendu qui
  voit la nouvelle valeur de la mise en page.
- À l'ouverture d'une session, `openSession` vide le cache et remet le profil à `null` ; si la
  mise en page rend ensuite un profil, l'oubli part aussi, sur un cache déjà vidé : sans effet sur
  ce qui s'affiche.

## Delta à produire

- [x] `src/lib/cache-d-espace.ts` : `CLE_PROFILS` et `oublierLeCacheDEspace(queryClient)`.
- [x] `useSwitchActiveProfile.onSuccess` l'appelle (comportement inchangé).
- [x] `AuthProvider` : un compteur de changements venus de la mise en page, incrémenté au rendu
  seulement si le profil rendu diffère de celui que tient le client ; un effet appelle l'oubli à
  chaque rang neuf.

## Critères d'acceptation

- [x] AC1 — `AuthProvider` re-rendu sous un autre `initialActiveProfileId` oublie une clé d'agence
  et garde les profils.
- [x] AC2 — Re-rendu sous le profil que le client a déjà posé (`setActiveProfileId`, comme le menu
  avant son `router.refresh()`), rien n'est oublié.
- [x] AC3 — Re-rendu sous le même profil, rien n'est oublié.

## Reste à faire

- Néant.

## Hors périmètre

- La clé de cache de `useApiQuery` (P197.04).

## Notes d'implémentation

- **Test** : `src/context/__tests__/AuthContext.profil-de-la-mise-en-page.tck-2229.test.tsx`
  (3 tests). Avant correctif, AC1 rouge : la clé `['credits','solde']` garde `{ agence: 'A' }`.
- **Ablation**, en deux temps : sans l'appel dans l'effet → AC1 rouge ; sans la comparaison au
  profil tenu (oubli à tout changement de la mise en page) → AC2 rouge ; correctif remis → 3 verts.
- **Piège** : l'oubli ne se lance pas dans la branche de rendu (effet de bord pendant le rendu) ;
  le rendu ne fait que monter un compteur d'état, que lit l'effet.
