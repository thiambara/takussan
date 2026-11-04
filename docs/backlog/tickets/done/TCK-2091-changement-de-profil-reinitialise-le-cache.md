---
id: TCK-2091
title: "Un changement de profil confirmé réinitialise tout le cache hors des profils, en un seul point"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2050, TCK-1899]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-197--clés-tanstack-query-des-lectures-de-lagence-active-face-au-changement-de-profil"
tags: [front, cache, profil-actif, pistes]
---

## Objectif utilisateur

Après un changement d'espace (profil actif) confirmé par le serveur, aucun écran ne montre une
donnée de l'agence quittée : tout ce qui est en cache est oublié et relu sous le nouveau profil,
au même endroit pour tous les écrans, et jamais sur l'écriture optimiste qui précède le `PATCH`.

## Contexte

Réf : **P197.05** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-23) : la recommandation du délégué (`resetQueries` hors `['me','profiles']` dans `onSuccess`), avec P174.01 ; le commentaire d'`AdminFinancesClient` peut se corriger tout de suite

La recommandation du délégué (ligne `Mesure` du 2026-10-23, 760e78f27) : un seul point,
l'`onSuccess` de `useSwitchActiveProfile`, qui réinitialise (`resetQueries`, comme
`credits-solde.ts`) tout le cache hors `['me','profiles']` ; retirer ensuite les remèdes de
`useSoldeCredits` et d'`AdminFinancesClient`, et corriger le commentaire `['auth', 'me']`.

P174.01 est fait (TCK-2050) : depuis lui, `apiRequest` pose dans le navigateur le profil que tient
`AuthProvider`, mis à jour au début de cet `onSuccess`. Les lectures relues après la
réinitialisation partent donc sous le nouveau profil.

Avant (lu) :
- `useProfiles.ts` — `onSuccess` n'invalide que `['me','subscription']` et `['me','payouts']`
  (TCK-1899) ;
- `credits-solde.ts:36-70` — `useSoldeCredits` écoute le cache des profils et réinitialise le
  solde sur un changement confirmé ;
- `AdminFinancesClient.tsx:37-55` — invalide cinq préfixes dans un effet sur
  `meta.active_profile_id`, que `onMutate` réécrit avant le `PATCH` ; son commentaire cite une clé
  `['auth', 'me']` qui n'existe pas.

## Hypothèses (mode sans humain)

- « Hors `['me','profiles']` » : toute requête dont la clé ne commence pas par `['me','profiles']`.
  Les profils restent en cache (le menu garde sa coche) ; `onSettled` les invalide déjà.
- `FinanceKpis` garde le profil dans sa clé : ce n'est pas un remède d'écoute, et la décision ne le
  nomme pas.
- `onSettled` reste tel quel : il sert aussi l'échec (rôles, permissions, `refreshUser`).

## Delta à produire

- [x] `useSwitchActiveProfile.onSuccess` : `resetQueries` de tout le cache hors `['me','profiles']`,
  après `setActiveProfileId` ; les deux invalidations de TCK-1899 s'y fondent.
- [x] `useSoldeCredits` : retrait de l'écoute du cache des profils (et de `CLE_PROFILS_ECOUTEE`).
- [x] `AdminFinancesClient` : retrait de l'effet d'invalidation et de son commentaire faux.

## Critères d'acceptation

- [x] AC1 — Après un changement réussi, une lecture d'agence en cache (solde, paiements, compte de
  modération, abonnement) est oubliée ; les profils restent.
- [x] AC2 — Pendant le `PATCH` (écriture optimiste faite), rien n'est oublié.
- [x] AC3 — Un changement refusé n'oublie rien.

## Reste à faire

- Néant au titre de cette piste. La clé des lectures d'agence (P197.04) est renvoyée au porteur.

## Hors périmètre

- La clé de cache de `useApiQuery` (P197.04).

## Notes d'implémentation

- **Ablation** : `useProfiles.ts` remis à sa version d'avant (deux invalidations de TCK-1899) → les
  deux tests d'oubli rougissent (`invalidate` garde la donnée : l'ancien espace reste affiché
  pendant la relecture) ; correctif remis → 3 verts. Le test « refusé » est vert des deux côtés :
  il garde qu'on ne déplace pas la réinitialisation dans `onSettled`.
- **Piège** : le préfixe se compare segment par segment (`estClePrefixee`), pas par `hashKey` :
  `['me','profiles']` doit épargner aussi une clé plus longue du même préfixe.
- `credits-solde.test.tsx` perd son bloc AC4 (l'écoute retirée) : la garantie est désormais tenue
  par `useSwitchActiveProfile.lectures-d-agence.test.tsx`, qui met `['credits','solde']` dans ses
  lectures d'agence.
